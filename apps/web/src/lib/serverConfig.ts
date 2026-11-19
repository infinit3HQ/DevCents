/**
 * Server-only runtime configuration for the OAuth and MCP endpoints.
 * Everything comes from process.env so a single published image works for
 * any deployment.
 */

function env(key: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

/** URL the web server uses to reach Convex (may be an internal address). */
export function getServerConvexUrl(): string {
  return env("CONVEX_URL") ?? env("VITE_CONVEX_URL") ?? "http://127.0.0.1:3210";
}

/** Shared secret proving a Convex call came from this web server. */
export function getServerSecret(): string {
  const secret = env("DEVCENTS_SERVER_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("DEVCENTS_SERVER_SECRET is not configured (min 32 chars)");
  }
  return secret;
}

/** True when a reverse proxy in front of the app sets X-Forwarded-* headers. */
export function trustProxy(): boolean {
  return env("TRUST_PROXY") === "true";
}

/**
 * Public origin of the app. PUBLIC_URL wins; otherwise forwarded headers are
 * used only when TRUST_PROXY=true, so a client can't spoof the issuer and
 * endpoint URLs in OAuth metadata.
 */
export function getOrigin(request: Request): string {
  const configured = env("PUBLIC_URL");
  if (configured) return configured.replace(/\/+$/, "");
  if (trustProxy()) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (proto && host && /^https?$/.test(proto) && /^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) {
      return `${proto}://${host}`;
    }
  }
  return new URL(request.url).origin;
}

/**
 * Client IP for rate limiting. With TRUST_PROXY the right-most
 * X-Forwarded-For entry is used: it was appended by our own proxy, while
 * entries to its left are client controlled.
 */
export function clientIp(request: Request): string {
  if (trustProxy()) {
    const forwarded = request.headers.get("x-forwarded-for");
    const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last;
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  const ip = (request as Request & { ip?: string }).ip;
  if (ip) return ip;
  if (!warnedUnknownIp) {
    warnedUnknownIp = true;
    console.warn(
      "[devcents] Client IP unavailable; all clients share one rate-limit bucket. " +
        "Behind a reverse proxy, set TRUST_PROXY=true.",
    );
  }
  return "unknown";
}

let warnedUnknownIp = false;
