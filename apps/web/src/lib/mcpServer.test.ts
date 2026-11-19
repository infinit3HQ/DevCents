import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import {
  negotiateProtocolVersion,
  DEFAULT_PROTOCOL_VERSION,
  TOOLS,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
  publicToolError,
} from "./mcpServer";
import { verifyPkceS256 } from "@devcents/shared/oauth";
import {
  handleWellKnownProtectedResource,
  handleWellKnownAuthServer,
} from "./oauthServer";

describe("MCP Protocol Version Negotiation", () => {
  it("defaults to 2025-11-25 when omitted", () => {
    expect(negotiateProtocolVersion()).toBe(DEFAULT_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe("2025-11-25");
  });

  it("negotiates supported protocol versions accurately", () => {
    expect(negotiateProtocolVersion("2025-11-25")).toBe("2025-11-25");
    expect(negotiateProtocolVersion("2026-07-28")).toBe("2026-07-28");
    expect(negotiateProtocolVersion("2024-11-05")).toBe("2024-11-05");
  });

  it("falls back to default version for unknown protocol versions", () => {
    expect(negotiateProtocolVersion("1999-01-01")).toBe(DEFAULT_PROTOCOL_VERSION);
  });
});

describe("MCP Tools Suite Definitions", () => {
  it("advertises all expected tools", () => {
    const toolNames = TOOLS.map((t) => t.name);
    expect(toolNames).toContain("get_transactions");
    expect(toolNames).toContain("search_transactions");
    expect(toolNames).toContain("get_spending_summary");
    expect(toolNames).toContain("get_cashflow_forecast");
    expect(toolNames).toContain("get_wallet_balances");
    expect(toolNames).toContain("add_transaction");
    expect(toolNames).toContain("get_planned_transactions");
    expect(toolNames).toContain("add_planned_transaction");
    expect(toolNames).toContain("get_recurring_transactions");
    expect(toolNames).toContain("add_recurring_transaction");
    expect(toolNames).toContain("get_budget");
    expect(toolNames).toContain("get_category_budgets");
    expect(toolNames).toContain("set_category_budget");
    expect(toolNames).toContain("set_budget");
    expect(toolNames).toContain("get_exchange_rates");
    expect(TOOLS.length).toBe(15);
  });
});

describe("OAuth 2.1 RFC Metadata Handlers", () => {
  it("returns RFC 9728 protected resource metadata", async () => {
    const req = new Request("https://devcents.012140.xyz/.well-known/oauth-protected-resource");
    const res = await handleWellKnownProtectedResource(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.resource).toBe("https://devcents.012140.xyz/mcp");
    expect(json.authorization_servers).toContain("https://devcents.012140.xyz");
    expect(json.scopes_supported).toContain("mcp");
  });

  it("returns RFC 8414 authorization server metadata", async () => {
    const req = new Request("https://devcents.012140.xyz/.well-known/oauth-authorization-server");
    const res = await handleWellKnownAuthServer(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.issuer).toBe("https://devcents.012140.xyz");
    expect(json.authorization_endpoint).toBe("https://devcents.012140.xyz/oauth/authorize");
    expect(json.token_endpoint).toBe("https://devcents.012140.xyz/oauth/token");
    expect(json.registration_endpoint).toBe("https://devcents.012140.xyz/oauth/register");
    expect(json.response_types_supported).toContain("code");
    expect(json.grant_types_supported).toContain("authorization_code");
    expect(json.code_challenge_methods_supported).toContain("S256");
    expect(json.code_challenge_methods_supported).not.toContain("plain");
    expect(json.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });

  it("ignores spoofed forwarded headers unless TRUST_PROXY is set", async () => {
    const req = new Request("https://devcents.example/.well-known/oauth-authorization-server", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" },
    });
    const json = await (await handleWellKnownAuthServer(req)).json();
    expect(json.issuer).toBe("https://devcents.example");
  });

  it("verifies PKCE with S256 method", async () => {
    // RFC 7636 Appendix B test vector:
    // verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    // challenge: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await verifyPkceS256(verifier, expectedChallenge)).toBe(true);
    expect(await verifyPkceS256("invalid_verifier", expectedChallenge)).toBe(false);
    expect(await verifyPkceS256(expectedChallenge, expectedChallenge)).toBe(false);
  });

});

describe("MCP HTTP Handlers", () => {
  it("handles OPTIONS with CORS headers", () => {
    const res = handleMcpOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles GET with discovery info and WWW-Authenticate header", async () => {
    const req = new Request("https://devcents.012140.xyz/mcp");
    const res = handleMcpGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");

    const json = await res.json();
    expect(json.service).toBe("DevCents Remote Web MCP Server");
    expect(json.tools.length).toBe(15);
  });

  it("handles JSON-RPC initialize", async () => {
    const req = new Request("https://devcents.012140.xyz/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });

    const res = await handleMcpPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.protocolVersion).toBe("2025-11-25");
    expect(json.result.serverInfo.name).toBe("DevCents MCP Server");
  });

  it("handles JSON-RPC tools/list", async () => {
    const req = new Request("https://devcents.012140.xyz/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    });

    const res = await handleMcpPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.tools.length).toBe(15);
  });

  it("returns auth error when tools/call is attempted without credentials", async () => {
    const req = new Request("https://devcents.012140.xyz/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_transactions",
          arguments: {},
        },
      }),
    });

    const res = await handleMcpPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("Authentication error");
  });
});

describe("MCP request limits and error hygiene", () => {
  const post = (body: unknown) =>
    handleMcpPost(
      new Request("https://devcents.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("rejects oversized batches", async () => {
    const batch = Array.from({ length: 11 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
    const res = await post(batch);
    expect(res.status).toBe(400);
  });

  it("accepts small batches", async () => {
    const res = await post([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect(res.status).toBe(200);
  });

  it("no longer accepts a token passed as a tool argument", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_transactions", arguments: { api_key: "dct_live_abc" } },
    });
    const json = await res.json();
    expect(json.result.content[0].text).toContain("Missing token");
  });

  it("hides internal error details from MCP clients", () => {
    expect(publicToolError(new Error("connect ECONNREFUSED 10.0.0.5:3210"))).not.toContain("10.0.0.5");
    expect(publicToolError(new Error("Uncaught Error: secret internals"))).not.toContain("secret");
    expect(
      publicToolError(new ConvexError({ code: "INVALID_ARGUMENT", message: "Unknown expense category: foo" })),
    ).toBe("Error: Unknown expense category: foo");
    expect(publicToolError(new ConvexError({ code: "UNAUTHENTICATED" }))).toContain("invalid or expired token");
  });
});
