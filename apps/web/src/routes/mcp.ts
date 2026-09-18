import { createFileRoute } from "@tanstack/react-router";
import {
  handleMcpGet,
  handleMcpPost,
  handleMcpOptions,
} from "@/lib/mcpServer";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => handleMcpGet(request),
      POST: ({ request }) => handleMcpPost(request),
      OPTIONS: () => handleMcpOptions(),
    },
  },
});

