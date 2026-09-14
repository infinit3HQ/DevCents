import { createFileRoute } from "@tanstack/react-router";
import {
  handleMcpGet,
  handleMcpPost,
  handleMcpOptions,
} from "@/lib/mcpServer";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: handleMcpGet,
      POST: ({ request }) => handleMcpPost(request),
      OPTIONS: handleMcpOptions,
    },
  },
});
