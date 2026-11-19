import { isRegisteredRedirectUri, isValidCodeChallenge } from "@devcents/shared/oauth";

export type AuthorizeParams = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
};

export type RegisteredClient = { clientName: string; redirectUris: string[] };

export function readAuthorizeParams(search: URLSearchParams): AuthorizeParams {
  return {
    client_id: search.get("client_id") ?? "",
    redirect_uri: search.get("redirect_uri") ?? "",
    response_type: search.get("response_type") ?? "",
    state: search.get("state") ?? "",
    code_challenge: search.get("code_challenge") ?? "",
    // OAuth 2.1 defaults to S256 only when the parameter is absent.
    code_challenge_method: search.get("code_challenge_method") ?? "S256",
    scope: search.get("scope") || "mcp",
  };
}

/**
 * Errors that must NOT be reported by redirecting, because the redirect URI
 * itself can't be trusted (RFC 6749 §4.1.2.1). Shown on the page instead.
 */
export function fatalAuthorizeProblem(
  params: AuthorizeParams,
  client: RegisteredClient | null | undefined,
): string | null {
  if (!params.client_id || !params.redirect_uri) return "Missing client_id or redirect_uri.";
  if (client === null) return "Unknown client_id. The application must register first.";
  if (client && !isRegisteredRedirectUri(client.redirectUris, params.redirect_uri)) {
    return "redirect_uri does not exactly match a URI registered by this application.";
  }
  return null;
}

/** Errors that can safely be returned to the (now verified) redirect URI. */
export function redirectableAuthorizeProblem(params: AuthorizeParams): string | null {
  if (params.response_type !== "code") return "unsupported_response_type";
  if (params.code_challenge_method !== "S256" || !isValidCodeChallenge(params.code_challenge)) {
    return "invalid_request";
  }
  if (params.scope !== "mcp") return "invalid_scope";
  return null;
}

/** Host shown to the user so they can spot a look-alike application. */
export function describeRedirect(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host ? `${url.protocol}//${url.host}` : url.protocol;
  } catch {
    return uri;
  }
}

export function buildRedirect(redirectUri: string, values: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
