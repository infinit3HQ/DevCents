import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  generateSecretToken,
  hashToken,
  redirectUrisProblem,
  unwrapKeyForToken,
  wrapKeyForToken,
} from "@devcents/shared";
import { getOrigin, getServerConvexUrl, getServerSecret } from "./serverConfig";

export { getOrigin } from "./serverConfig";

const MAX_BODY_BYTES = 64 * 1024;

function getConvexClient() {
  return new ConvexHttpClient(getServerConvexUrl());
}

/**
 * Bearer-token endpoints never use cookies, so a wildcard origin is safe:
 * a cross-site page can't make the browser attach credentials.
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function oauthError(error: string, description: string, status = 400): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...getCorsHeaders(), ...NO_STORE } },
  );
}

/** Reads a request body, refusing anything over `maxBytes`. */
export async function readLimitedText(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).length > maxBytes ? null : text;
}

// ─── RFC 9728: Protected Resource Metadata ───────────────────────────────

export async function handleWellKnownProtectedResource(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  const origin = getOrigin(request);
  return Response.json(
    {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    },
    { headers: { ...getCorsHeaders(), "Cache-Control": "public, max-age=300" } },
  );
}

// ─── RFC 8414: Authorization Server Metadata ─────────────────────────────

export async function handleWellKnownAuthServer(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  const origin = getOrigin(request);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { ...getCorsHeaders(), "Cache-Control": "public, max-age=300" } },
  );
}

// ─── RFC 7591: Dynamic Client Registration ───────────────────────────────

export async function handleOAuthRegister(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: getCorsHeaders() });
  }

  const text = await readLimitedText(request);
  if (text === null) return oauthError("invalid_request", "Request body too large", 413);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return oauthError("invalid_request", "Malformed JSON body");
  }

  const problem = redirectUrisProblem(body.redirect_uris);
  if (problem) return oauthError("invalid_redirect_uri", problem);

  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "MCP Client";
  const authMethod = body.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported");
  }

  try {
    const registered = await getConvexClient().mutation(api.oauth.registerClient, {
      serverSecret: getServerSecret(),
      client_name: clientName,
      redirect_uris: body.redirect_uris as string[],
    });
    return Response.json(registered, { status: 201, headers: { ...getCorsHeaders(), ...NO_STORE } });
  } catch (err) {
    console.error("[oauth] client registration failed:", err);
    return oauthError("server_error", "Client registration failed", 500);
  }
}

// ─── RFC 6749: Token Endpoint ────────────────────────────────────────────

function parseTokenParams(text: string, contentType: string): URLSearchParams | null {
  if (contentType.includes("application/json")) {
    try {
      const json = JSON.parse(text);
      if (!json || typeof json !== "object") return null;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === "string") params.set(k, v);
      }
      return params;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(text);
}

function tokenResponse(accessToken: string, refreshToken: string, expiresIn: number, scope: string): Response {
  return Response.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    },
    { headers: { ...getCorsHeaders(), ...NO_STORE } },
  );
}

async function issueTokenPair(keyB64: string | null) {
  const accessToken = generateSecretToken("dco_acc_");
  const refreshToken = generateSecretToken("dco_ref_");
  return {
    accessToken,
    refreshToken,
    tokenHash: await hashToken(accessToken),
    refreshTokenHash: await hashToken(refreshToken),
    wrappedKey: keyB64 ? await wrapKeyForToken(keyB64, accessToken) : undefined,
    refreshWrappedKey: keyB64 ? await wrapKeyForToken(keyB64, refreshToken) : undefined,
  };
}

async function handleAuthorizationCodeGrant(params: URLSearchParams): Promise<Response> {
  const code = params.get("code") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const codeVerifier = params.get("code_verifier") ?? "";
  const clientId = params.get("client_id") ?? "";
  if (!code || !redirectUri || !codeVerifier || !clientId) {
    return oauthError("invalid_request", "Missing code, redirect_uri, code_verifier or client_id");
  }

  const client = getConvexClient();
  const serverSecret = getServerSecret();
  const codeHash = await hashToken(code);

  const peek = await client.query(api.oauth.peekAuthCodeKey, { serverSecret, codeHash });
  if (!peek) return oauthError("invalid_grant", "Invalid or expired authorization code");

  let keyB64: string | null = null;
  if (peek.wrappedKey) {
    try {
      keyB64 = await unwrapKeyForToken(peek.wrappedKey, code);
    } catch {
      return oauthError("invalid_grant", "Invalid authorization code");
    }
  }

  const pair = await issueTokenPair(keyB64);
  const result = await client.mutation(api.oauth.exchangeAuthCode, {
    serverSecret,
    codeHash,
    codeVerifier,
    clientId,
    redirectUri,
    tokenHash: pair.tokenHash,
    refreshTokenHash: pair.refreshTokenHash,
    wrappedKey: pair.wrappedKey,
    refreshWrappedKey: pair.refreshWrappedKey,
  });
  if (!result.ok) return oauthError("invalid_grant", result.error);
  return tokenResponse(pair.accessToken, pair.refreshToken, result.expiresIn, result.scope);
}

async function handleRefreshGrant(params: URLSearchParams): Promise<Response> {
  const refreshToken = params.get("refresh_token") ?? "";
  const clientId = params.get("client_id") ?? "";
  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "Missing refresh_token or client_id");
  }

  const client = getConvexClient();
  const serverSecret = getServerSecret();
  const refreshTokenHash = await hashToken(refreshToken);

  const peek = await client.query(api.oauth.peekRefreshKey, { serverSecret, refreshTokenHash });
  if (!peek) return oauthError("invalid_grant", "Invalid or expired refresh token");

  let keyB64: string | null = peek.legacyKeyB64;
  if (peek.refreshWrappedKey) {
    try {
      keyB64 = await unwrapKeyForToken(peek.refreshWrappedKey, refreshToken);
    } catch {
      return oauthError("invalid_grant", "Invalid refresh token");
    }
  }

  const pair = await issueTokenPair(keyB64);
  const result = await client.mutation(api.oauth.refreshOAuthToken, {
    serverSecret,
    refreshTokenHash,
    clientId,
    newTokenHash: pair.tokenHash,
    newRefreshTokenHash: pair.refreshTokenHash,
    wrappedKey: pair.wrappedKey,
    refreshWrappedKey: pair.refreshWrappedKey,
  });
  if (!result.ok) return oauthError("invalid_grant", result.error);
  return tokenResponse(pair.accessToken, pair.refreshToken, result.expiresIn, result.scope);
}

export async function handleOAuthToken(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: getCorsHeaders() });
  }

  const text = await readLimitedText(request);
  if (text === null) return oauthError("invalid_request", "Request body too large", 413);
  const params = parseTokenParams(text, request.headers.get("content-type") ?? "");
  if (!params) return oauthError("invalid_request", "Malformed request body");

  const grantType = params.get("grant_type");
  try {
    if (grantType === "authorization_code") return await handleAuthorizationCodeGrant(params);
    if (grantType === "refresh_token") return await handleRefreshGrant(params);
  } catch (err) {
    console.error("[oauth] token request failed:", err);
    return oauthError("server_error", "Token request failed", 500);
  }
  return oauthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}
