/**
 * OAuth 2.1 helpers shared by the Convex backend, the web server and the
 * consent page. Kept free of browser/Node-only APIs so it runs in all three.
 */

export const MAX_REDIRECT_URIS = 10;
export const MAX_REDIRECT_URI_LENGTH = 512;
export const MAX_CLIENT_NAME_LENGTH = 100;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLOCKED_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
  "filesystem:",
]);
// RFC 8252 private-use schemes look like reverse domain names (com.example.app)
// or simple app names (cursor, vscode). Require a letter first.
const PRIVATE_SCHEME = /^[a-z][a-z0-9+.-]*:$/;

/**
 * Returns null when `uri` is an acceptable OAuth redirect URI, otherwise the
 * reason. Accepted: https URLs, http on loopback (RFC 8252 §7.3) and
 * private-use schemes for native apps (§7.1). Fragments are never allowed.
 */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || uri.length === 0) return "must be a non-empty string";
  if (uri.length > MAX_REDIRECT_URI_LENGTH) return "is too long";
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return "is not an absolute URL";
  }
  if (parsed.hash) return "must not contain a fragment";
  const scheme = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) return `scheme ${scheme} is not allowed`;
  if (scheme === "https:") return parsed.hostname ? null : "must include a host";
  if (scheme === "http:") {
    return LOOPBACK_HOSTS.has(parsed.hostname) ? null : "http is only allowed for loopback hosts";
  }
  return PRIVATE_SCHEME.test(scheme) ? null : `scheme ${scheme} is not allowed`;
}

/** Validates a client's full redirect_uris list. Returns the first problem. */
export function redirectUrisProblem(uris: unknown): string | null {
  if (!Array.isArray(uris) || uris.length === 0) return "redirect_uris must be a non-empty array";
  if (uris.length > MAX_REDIRECT_URIS) return `at most ${MAX_REDIRECT_URIS} redirect_uris are allowed`;
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) return `redirect_uri ${String(uri).slice(0, 80)} ${problem}`;
  }
  return null;
}

function loopbackWithoutPort(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null;
    url.port = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Exact string match (OAuth 2.1 §2.3.1), with one exception: for http
 * loopback redirects the port is ignored, because native apps pick a free
 * port at runtime (RFC 8252 §7.3).
 */
export function isRegisteredRedirectUri(registered: readonly string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  const loopback = loopbackWithoutPort(uri);
  return loopback !== null && registered.some((r) => loopbackWithoutPort(r) === loopback);
}

/** Lower-case hex SHA-256, identical to hashToken() in ./encryption. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 7636 §4.1: 43–128 chars from the unreserved set.
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeChallenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && PKCE_CHALLENGE.test(challenge);
}

/** S256 is the only method OAuth 2.1 permits; "plain" is rejected. */
export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  if (!PKCE_VERIFIER.test(verifier) || !isValidCodeChallenge(challenge)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return timingSafeEqual(base64UrlEncode(new Uint8Array(digest)), challenge);
}

/** Constant-time comparison for equal-length secrets. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
