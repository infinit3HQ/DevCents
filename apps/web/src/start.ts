import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart, createMiddleware } from "@tanstack/react-start";
import { handleMcpHttpRequest } from "./lib/mcpServer";

const mcpMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
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

