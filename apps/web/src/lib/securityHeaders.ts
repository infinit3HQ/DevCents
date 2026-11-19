/**
 * Headers added to every response. The CSP deliberately does not restrict
 * scripts (Clerk and SSR hydration need inline/remote scripts); it blocks
 * framing, plugins and <base> hijacking, which covers clickjacking of the
 * OAuth consent page.
 */
export function securityHeaders(isHttps: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  if (isHttps) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/** Returns `response` with the security headers, copying it if its headers are immutable. */
export function withSecurityHeaders(response: Response, isHttps: boolean): Response {
  const extra = securityHeaders(isHttps);
  try {
    for (const [key, value] of Object.entries(extra)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(extra)) {
      if (!headers.has(key)) headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
