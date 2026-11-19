import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart, createMiddleware } from "@tanstack/react-start";
import { handleMcpHttpRequest } from "./lib/mcpServer";
import {
  getCorsHeaders,
  handleWellKnownProtectedResource,
  handleWellKnownAuthServer,
  handleOAuthRegister,
  handleOAuthToken,
} from "./lib/oauthServer";
import { checkRateLimit, type RateLimitName } from "./lib/rateLimit";
import { withSecurityHeaders } from "./lib/securityHeaders";
import { clientIp, getOrigin } from "./lib/serverConfig";

function rateLimitFor(pathname: string, method: string): RateLimitName | null {
  if (method !== "POST") return null;
  if (pathname === "/oauth/register") return "register";
  if (pathname === "/oauth/token") return "token";
  if (pathname === "/mcp" || pathname === "/api/mcp") return "mcp";
  return null;
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited", error_description: "Too many requests, slow down." },
    {
      status: 429,
      headers: { ...getCorsHeaders(), "Retry-After": String(retryAfterSeconds) },
    },
  );
}

async function routeApi(request: Request, pathname: string): Promise<Response | null> {
  const limitName = rateLimitFor(pathname, request.method.toUpperCase());
  if (limitName) {
    const result = checkRateLimit(limitName, clientIp(request));
    if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
  }

  if (pathname === "/.well-known/oauth-protected-resource") return handleWellKnownProtectedResource(request);
  if (pathname === "/.well-known/oauth-authorization-server") return handleWellKnownAuthServer(request);
  if (pathname === "/oauth/register") return handleOAuthRegister(request);
  if (pathname === "/oauth/token") return handleOAuthToken(request);
  if (pathname === "/mcp" || pathname === "/api/mcp") return handleMcpHttpRequest(request);
  return null;
}

const securityMiddleware = createMiddleware().server(async ({ request, next }) => {
  const isHttps = getOrigin(request).startsWith("https://");
  const pathname = new URL(request.url).pathname;

  const apiResponse = await routeApi(request, pathname);
  if (apiResponse) return withSecurityHeaders(apiResponse, isHttps);

  const result = await next();
  return { ...result, response: withSecurityHeaders(result.response, isHttps) };
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [securityMiddleware, clerkMiddleware()],
  };
});
