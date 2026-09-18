import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { hashToken } from "@devcents/shared";

function getConvexUrl(): string {
  const url =
    (typeof process !== "undefined" && process.env && process.env.CONVEX_URL) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CONVEX_URL) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONVEX_URL) ||
    "http://127.0.0.1:3210";
  return url;
}

function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return url.origin;
}

export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ─── PKCE Verification (RFC 7636) ────────────────────────────────────────

function base64UrlEncode(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64url");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): Promise<boolean> {
  if (method === "plain") {
    return verifier === challenge;
  }
  if (method === "S256") {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const computedChallenge = base64UrlEncode(hash);
    return computedChallenge === challenge;
  }
  return false;
}

// ─── RFC 9728: Protected Resource Metadata ───────────────────────────────

export async function handleWellKnownProtectedResource(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }

  const origin = getOrigin(request);
  const metadata = {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
  };

  return Response.json(metadata, {
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "max-age=3600",
    },
  });
}

// ─── RFC 8414: Authorization Server Metadata ─────────────────────────────

export async function handleWellKnownAuthServer(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }

  const origin = getOrigin(request);
  const metadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  };

  return Response.json(metadata, {
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "max-age=3600",
    },
  });
}

// ─── RFC 7591: Dynamic Client Registration ───────────────────────────────

export async function handleOAuthRegister(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: getCorsHeaders(),
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_request", error_description: "Malformed JSON body" },
      { status: 400, headers: getCorsHeaders() },
    );
  }

  const clientName = body.client_name || "MCP Client";
  const redirectUris = body.redirect_uris;

  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris array is required",
      },
      { status: 400, headers: getCorsHeaders() },
    );
  }

  try {
    const client = getConvexClient();
    const registered = await client.mutation(api.oauth.registerClient, {
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: body.grant_types,
      response_types: body.response_types,
      scope: body.scope,
    });

    return Response.json(registered, {
      status: 201,
      headers: {
        ...getCorsHeaders(),
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    return Response.json(
      { error: "server_error", error_description: err.message },
      { status: 500, headers: getCorsHeaders() },
    );
  }
}

// ─── RFC 6749: Token Endpoint ────────────────────────────────────────────

export async function handleOAuthToken(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: getCorsHeaders(),
    });
  }

  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    params = new URLSearchParams(text);
  } else if (contentType.includes("application/json")) {
    try {
      const json = await request.json();
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) {
        params.set(k, String(v));
      }
    } catch {
      return Response.json(
        { error: "invalid_request", error_description: "Malformed JSON" },
        { status: 400, headers: getCorsHeaders() },
      );
    }
  } else {
    // Default to query params or text
    const text = await request.text();
    params = new URLSearchParams(text);
  }

  const grantType = params.get("grant_type");
  const clientId = params.get("client_id") || "";
  const client = getConvexClient();

  // 1. Authorization Code Grant
  if (grantType === "authorization_code") {
    const code = params.get("code") || "";
    const redirectUri = params.get("redirect_uri") || "";
    const codeVerifier = params.get("code_verifier") || "";

    if (!code || !redirectUri || !codeVerifier) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: "Missing code, redirect_uri, or code_verifier",
        },
        { status: 400, headers: getCorsHeaders() },
      );
    }

    try {
      const codeHash = await hashToken(code);
      const authCodeRecord = await client.query(api.oauth.getAuthCodeForExchange, {
        codeHash,
      });

      if (!authCodeRecord) {
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "Invalid or expired authorization code",
          },
          { status: 400, headers: getCorsHeaders() },
        );
      }

      // Verify PKCE
      const isPkceValid = await verifyPkce(
        codeVerifier,
        authCodeRecord.codeChallenge,
        authCodeRecord.codeChallengeMethod,
      );

      if (!isPkceValid) {
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "PKCE verification failed: invalid code_verifier",
          },
          { status: 400, headers: getCorsHeaders() },
        );
      }

      // Generate Access Token & Refresh Token
      const accessToken = `dco_acc_${crypto.randomUUID().replace(/-/g, "")}`;
      const refreshToken = `dco_ref_${crypto.randomUUID().replace(/-/g, "")}`;

      const tokenHash = await hashToken(accessToken);
      const refreshTokenHash = await hashToken(refreshToken);

      const exchangeResult = await client.mutation(api.oauth.exchangeAuthCode, {
        codeHash,
        tokenHash,
        refreshTokenHash,
        clientId: clientId || authCodeRecord.clientId,
        redirectUri,
        codeChallengeVerified: true,
      });

      return Response.json(
        {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: exchangeResult.expiresIn,
          refresh_token: refreshToken,
          scope: exchangeResult.scope,
        },
        {
          headers: {
            ...getCorsHeaders(),
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        },
      );
    } catch (err: any) {
      return Response.json(
        {
          error: "invalid_grant",
          error_description: err.message || "Code exchange failed",
        },
        { status: 400, headers: getCorsHeaders() },
      );
    }
  }

  // 2. Refresh Token Grant
  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") || "";
    if (!refreshToken) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: "Missing refresh_token",
        },
        { status: 400, headers: getCorsHeaders() },
      );
    }

    try {
      const refreshTokenHash = await hashToken(refreshToken);
      const newAccessToken = `dco_acc_${crypto.randomUUID().replace(/-/g, "")}`;
      const newRefreshToken = `dco_ref_${crypto.randomUUID().replace(/-/g, "")}`;

      const newTokenHash = await hashToken(newAccessToken);
      const newRefreshTokenHash = await hashToken(newRefreshToken);

      const result = await client.mutation(api.oauth.refreshOAuthToken, {
        refreshTokenHash,
        newTokenHash,
        newRefreshTokenHash,
        clientId,
      });

      return Response.json(
        {
          access_token: newAccessToken,
          token_type: "Bearer",
          expires_in: result.expiresIn,
          refresh_token: newRefreshToken,
          scope: result.scope,
        },
        {
          headers: {
            ...getCorsHeaders(),
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        },
      );
    } catch (err: any) {
      return Response.json(
        {
          error: "invalid_grant",
          error_description: err.message || "Token refresh failed",
        },
        { status: 400, headers: getCorsHeaders() },
      );
    }
  }

  return Response.json(
    {
      error: "unsupported_grant_type",
      error_description: `Unsupported grant_type: ${grantType}`,
    },
    { status: 400, headers: getCorsHeaders() },
  );
}
