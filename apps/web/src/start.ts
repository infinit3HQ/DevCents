import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart, createMiddleware } from "@tanstack/react-start";
import { handleMcpHttpRequest } from "./lib/mcpServer";
import {
  handleWellKnownProtectedResource,
  handleWellKnownAuthServer,
  handleOAuthRegister,
  handleOAuthToken,
} from "./lib/oauthServer";

const mcpMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);

  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return handleWellKnownProtectedResource(request);
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return handleWellKnownAuthServer(request);
  }
  if (url.pathname === "/oauth/register") {
    return handleOAuthRegister(request);
  }
  if (url.pathname === "/oauth/token") {
    return handleOAuthToken(request);
  }
  if (url.pathname === "/mcp" || url.pathname === "/api/mcp") {
    return handleMcpHttpRequest(request);
  }

  return next();
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [mcpMiddleware, clerkMiddleware()],
  };
});


