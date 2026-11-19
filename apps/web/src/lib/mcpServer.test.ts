import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ConvexError } from "convex/values";
import { encrypt, importKeyFromBase64 } from "@devcents/shared";
import {
  negotiateProtocolVersion,
  DEFAULT_PROTOCOL_VERSION,
  TOOLS,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
  publicToolError,
  sumLedger,
  currencyBreakdown,
  decryptItem,
  validateAmount,
  validateTimestamp,
  validateCurrency,
  validateMonth,
  resolveTimeZone,
  monthKeyInZone,
  startOfDayInZone,
  buildForecastEvents,
  budgetStatus,
  BUDGET_WARNING_RATIO,
  ToolInputError,
} from "./mcpServer";
import { DAY_MS, dayKey } from "./planningUtils";

// A fake Convex client: each test registers handlers by function name
// ("mcp:mcpGetAllTransactions") and inspects the calls it received.
const fake = vi.hoisted(() => ({
  handlers: {} as Record<string, (args: any) => unknown>,
  calls: [] as { name: string; args: any }[],
}));

vi.mock("convex/browser", async () => {
  const { getFunctionName } = await import("convex/server");
  const run = async (ref: any, args: any) => {
    const name = getFunctionName(ref);
    fake.calls.push({ name, args });
    const handler = fake.handlers[name];
    if (!handler) throw new Error(`no fake handler for ${name}`);
    return handler(args);
  };
  return {
    ConvexHttpClient: class {
      query = run;
      mutation = run;
      action = run;
    },
  };
});
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

// ─── Money logic ────────────────────────────────────────────────────────

const RATES = { USD: 1, LKR: 300, EUR: 0.5 };

describe("sumLedger", () => {
  it("converts mixed currencies to the base currency before summing", () => {
    const rows = [
      { type: "income", category: "salary", amount: 1000, currency: "USD", rateToUSD: 1 },
      // Locked at 1 LKR = 1/250 USD, so 25000 LKR = 100 USD regardless of today's rate.
      { type: "expense", category: "groceries", amount: 25000, currency: "LKR", rateToUSD: 1 / 250 },
      // No locked rate: today's rate, 10 EUR = 20 USD.
      { type: "expense", category: "dining", amount: 10, currency: "EUR" },
    ];
    const totals = sumLedger(rows, "USD", RATES);
    expect(totals.income).toBe(1000);
    expect(totals.expense).toBe(120);

    const inLkr = sumLedger(rows, "LKR", RATES);
    expect(inLkr.income).toBe(300000);
    expect(inLkr.expense).toBe(36000);
  });

  it("excludes transfers and reports only the outgoing leg", () => {
    const rows = [
      { type: "expense", category: "transfer", amount: 500, currency: "USD" },
      { type: "income", category: "transfer", amount: 500, currency: "USD" },
      { type: "expense", category: "groceries", amount: 40, currency: "USD" },
    ];
    const totals = sumLedger(rows, "USD", RATES);
    expect(totals.income).toBe(0);
    expect(totals.expense).toBe(40);
    expect(totals.transfers_out).toBe(500);
  });

  it("skips and counts rows that could not be decrypted", () => {
    const rows = [
      { type: "expense", category: "groceries", amount: null, decrypt_failed: true },
      { type: "expense", category: "groceries", amount: 10, currency: "USD" },
    ];
    const totals = sumLedger(rows, "USD", RATES);
    expect(totals.expense).toBe(10);
    expect(totals.skipped_undecryptable).toBe(1);
  });
});

describe("currencyBreakdown", () => {
  it("splits native income and expense per currency, both positive", () => {
    const out = currencyBreakdown([
      { type: "income", category: "salary", amount: 1000, currency: "USD" },
      { type: "expense", category: "groceries", amount: 200, currency: "USD" },
      { type: "expense", category: "groceries", amount: 5000, currency: "LKR" },
      { type: "expense", category: "transfer", amount: 999, currency: "LKR" },
    ]);
    expect(out).toEqual({
      USD: { income: 1000, expense: 200 },
      LKR: { income: 0, expense: 5000 },
    });
  });
});

describe("decryptItem", () => {
  it("marks undecryptable rows instead of turning them into 0", async () => {
    const keyA = await importKeyFromBase64(btoa(String.fromCharCode(...new Uint8Array(32).fill(1))));
    const keyB = await importKeyFromBase64(btoa(String.fromCharCode(...new Uint8Array(32).fill(2))));
    const row = {
      type: "expense",
      category: "groceries",
      amount: await encrypt("42", keyA),
      description: await encrypt("milk", keyA),
      encrypted: true,
    };
    expect((await decryptItem(row, keyA)).amount).toBe(42);
    const failed = await decryptItem(row, keyB);
    expect(failed.decrypt_failed).toBe(true);
    expect(failed.amount).toBeNull();
  });
});

describe("write validation", () => {
  it("rejects bad amounts", () => {
    expect(() => validateAmount(0)).toThrow(ToolInputError);
    expect(() => validateAmount(-5)).toThrow(ToolInputError);
    expect(() => validateAmount(Number.NaN)).toThrow(ToolInputError);
    expect(() => validateAmount(Infinity)).toThrow(ToolInputError);
    expect(() => validateAmount(1e12)).toThrow(ToolInputError);
    expect(() => validateAmount("10")).toThrow(ToolInputError);
    expect(validateAmount(12.5)).toBe(12.5);
  });

  it("rejects timestamps passed in seconds", () => {
    expect(() => validateTimestamp(1_763_600_000, "date")).toThrow(/seconds/);
    expect(validateTimestamp(1_763_600_000_000, "date")).toBe(1_763_600_000_000);
  });

  it("checks currency codes against the rates table and defaults to base", () => {
    expect(validateCurrency(undefined, "LKR", RATES)).toBe("LKR");
    expect(validateCurrency("eur", "USD", RATES)).toBe("EUR");
    expect(() => validateCurrency("XYZ", "USD", RATES)).toThrow(/Unknown currency/);
    expect(() => validateCurrency("dollars", "USD", RATES)).toThrow(/3-letter/);
  });

  it("checks month format", () => {
    expect(validateMonth("2026-03")).toBe("2026-03");
    expect(() => validateMonth("2026-13")).toThrow(ToolInputError);
    expect(() => validateMonth("2026-3")).toThrow(ToolInputError);
  });
});

describe("time zones", () => {
  it("defaults to UTC and rejects unknown zones", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(() => resolveTimeZone("Mars/Base")).toThrow(ToolInputError);
  });

  it("buckets months in the requested zone", () => {
    const ms = Date.UTC(2026, 0, 31, 20, 0); // 31 Jan 20:00 UTC = 1 Feb 01:30 in Colombo
    expect(monthKeyInZone(ms, "UTC")).toBe("2026-01");
    expect(monthKeyInZone(ms, "Asia/Colombo")).toBe("2026-02");
  });

  it("finds local midnight", () => {
    const ms = Date.UTC(2026, 5, 15, 3, 0); // 15 Jun 03:00 UTC = 14 Jun 23:00 in New York (EDT)
    expect(startOfDayInZone(ms, "UTC")).toBe(Date.UTC(2026, 5, 15));
    expect(startOfDayInZone(ms, "America/New_York")).toBe(Date.UTC(2026, 5, 14, 4, 0));
  });
});

describe("budget status", () => {
  it("uses one warning threshold", () => {
    expect(BUDGET_WARNING_RATIO).toBe(0.8);
    expect(budgetStatus(0.79)).toBe("healthy");
    expect(budgetStatus(0.8)).toBe("warning");
    expect(budgetStatus(1)).toBe("exceeded");
  });
});

describe("buildForecastEvents", () => {
  const now = Date.now();
  const windowStart = startOfDayInZone(now, "UTC");
  const horizonEnd = now + 30 * DAY_MS;

  it("skips recurring occurrences that were already posted (same day, different time)", () => {
    const recurring = [
      { _id: "r1", type: "expense", category: "rent", amount: 100, currency: "USD", startDate: now - 7 * DAY_MS, cadence: "weekly", description: "Gym" },
    ];
    const all = buildForecastEvents({ planned: [], recurring, posted: [], windowStart, horizonEnd, base: "USD", rates: RATES });
    const first = all.events[0].date;
    const posted = [{ recurringId: "r1", date: first - 3 * 60 * 60 * 1000 }];
    expect(dayKey(posted[0].date)).toBe(dayKey(first));
    const after = buildForecastEvents({ planned: [], recurring, posted, windowStart, horizonEnd, base: "USD", rates: RATES });
    expect(after.events.length).toBe(all.events.length - 1);
    expect(after.events.some((e) => dayKey(e.date) === dayKey(first))).toBe(false);
  });

  it("includes overdue planned items as due now, converted to base", () => {
    const planned = [
      { status: "planned", type: "expense", category: "bills", amount: 3000, currency: "LKR", date: now - 5 * DAY_MS, description: "Late bill" },
      { status: "planned", type: "income", category: "salary", amount: 10, currency: "USD", date: now + 2 * DAY_MS, description: "Later" },
    ];
    const { events } = buildForecastEvents({ planned, recurring: [], posted: [], windowStart, horizonEnd, base: "USD", rates: RATES });
    expect(events[0]).toMatchObject({ date: windowStart, amount: 10, overdue_since: planned[0].date });
    expect(events[1].description).toBe("Later");
  });
});

// ─── Tool calls through a fake Convex client ────────────────────────────

describe("MCP tools with a fake backend", () => {
  let keyB64: string;
  let key: CryptoKey;

  beforeAll(async () => {
    keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    key = await importKeyFromBase64(keyB64);
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await handleMcpPost(
      new Request("https://devcents.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dct_test" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
    );
    const json = await res.json();
    return json.result as { isError?: boolean; content: { text: string }[] };
  };

  const enc = async (v: string) => encrypt(v, key);

  beforeEach(() => {
    fake.calls.length = 0;
    fake.handlers = {
      "mcp:mcpGetTokenKey": () => ({ wrappedKey: null, legacyKeyB64: keyB64 }),
      "mcp:mcpGetEncryptionCheck": () => null,
      "mcp:mcpUpgradeLegacyKey": () => true,
      "mcp:mcpGetUserSettings": () => ({ currency: "LKR" }),
      "mcp:mcpGetExchangeRates": () => ({ date: "2026-11-20", rates: RATES }),
      "mcp:mcpGetCategoryRules": () => null,
      "mcp:mcpRateToUSD": () => 1 / 320,
      "mcp:mcpAddTransaction": () => "tx1",
      "mcp:mcpAddPlanned": () => "p1",
      "mcp:mcpSetBudget": () => "b1",
    };
  });

  it("add_transaction defaults to the base currency and locks the historical rate", async () => {
    const result = await call("add_transaction", {
      amount: 1500,
      type: "expense",
      category: "groceries",
      description: "Keells",
      date: Date.now() - DAY_MS,
    });
    expect(result.isError).toBeUndefined();
    const add = fake.calls.find((c) => c.name === "mcp:mcpAddTransaction");
    expect(add?.args.currency).toBe("LKR");
    expect(add?.args.rateToUSD).toBeCloseTo(1 / 320);
  });

  it("add_transaction stores rate 1 for USD without a lookup", async () => {
    await call("add_transaction", { amount: 5, type: "expense", category: "dining", description: "Coffee", currency: "usd" });
    const add = fake.calls.find((c) => c.name === "mcp:mcpAddTransaction");
    expect(add?.args).toMatchObject({ currency: "USD", rateToUSD: 1 });
    expect(fake.calls.some((c) => c.name === "mcp:mcpRateToUSD")).toBe(false);
  });

  it("rejects invalid write arguments with clear errors and writes nothing", async () => {
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["add_transaction", { amount: -1, type: "expense", category: "dining", description: "x" }, /amount/],
      ["add_transaction", { amount: 1, type: "expense", category: "dining", description: "x", date: 1_763_600_000 }, /seconds/],
      ["add_transaction", { amount: 1, type: "expense", category: "dining", description: "x", currency: "ABC" }, /Unknown currency/],
      ["add_planned_transaction", { amount: 1, type: "expense", category: "bills", description: "x", date: Date.now() - 2 * DAY_MS }, /past/],
      ["add_recurring_transaction", { amount: 1, type: "expense", category: "bills", description: "x", start_date: Date.now(), cadence: "daily" }, /cadence/],
      ["set_budget", { month: "2026-13", limit: 100 }, /YYYY-MM/],
      ["set_budget", { month: "2026-11", limit: 0 }, /limit/],
    ];
    for (const [tool, args, pattern] of cases) {
      const result = await call(tool, args);
      expect(result.isError, tool).toBe(true);
      expect(result.content[0].text).toMatch(pattern);
    }
    expect(fake.calls.some((c) => /mcpAdd|mcpSetBudget/.test(c.name))).toBe(false);
  });

  it("get_spending_summary totals in base currency, excludes transfers and counts undecryptable rows", async () => {
    const otherKey = await importKeyFromBase64(btoa(String.fromCharCode(...new Uint8Array(32).fill(9))));
    const date = Date.UTC(2026, 2, 10);
    fake.handlers["mcp:mcpGetAllTransactions"] = async () => [
      { type: "income", category: "salary", amount: await enc("1000"), description: await enc("pay"), currency: "USD", rateToUSD: 1, date, encrypted: true },
      { type: "expense", category: "groceries", amount: await enc("3000"), description: await enc("food"), currency: "LKR", rateToUSD: 1 / 300, date, encrypted: true },
      { type: "expense", category: "transfer", amount: 50, description: "to savings", currency: "USD", date },
      { type: "income", category: "transfer", amount: 50, description: "from checking", currency: "USD", date },
      { type: "expense", category: "groceries", amount: await encrypt("7", otherKey), description: await encrypt("x", otherKey), currency: "USD", date, encrypted: true },
    ];
    const result = await call("get_spending_summary", { year: 2026, month: 3 });
    const out = JSON.parse(result.content[0].text);
    expect(out.totals_currency).toBe("LKR");
    expect(out.total_income).toBe(300000);
    expect(out.total_expenses).toBe(3000);
    expect(out.transfers_out_excluded).toBe(15000);
    expect(out.skipped_undecryptable).toBe(1);
    expect(out.currency_breakdown_native).toEqual({
      USD: { income: 1000, expense: 0 },
      LKR: { income: 0, expense: 3000 },
    });
  });

  it("get_cashflow_forecast does not double-count posted recurring occurrences", async () => {
    const now = Date.now();
    fake.handlers["mcp:mcpGetAllTransactions"] = () => [];
    fake.handlers["mcp:mcpGetPlanned"] = () => [];
    fake.handlers["mcp:mcpGetRecurring"] = () => [
      { _id: "r1", type: "expense", category: "bills", amount: 10, currency: "LKR", startDate: now - 7 * DAY_MS, cadence: "weekly", description: "Bill" },
    ];
    fake.handlers["mcp:mcpGetPostedOccurrences"] = () => [];
    const before = JSON.parse((await call("get_cashflow_forecast", { horizon_days: 30 })).content[0].text);

    const firstOccurrence = new Date(now);
    firstOccurrence.setHours(9, 0, 0, 0);
    fake.handlers["mcp:mcpGetPostedOccurrences"] = () => [{ recurringId: "r1", date: firstOccurrence.getTime() }];
    const after = JSON.parse((await call("get_cashflow_forecast", { horizon_days: 30 })).content[0].text);

    expect(after.events_count).toBe(before.events_count - 1);
    expect(after.projected_expenses).toBe(before.projected_expenses - 10);
    expect(after.totals_currency).toBe("LKR");
  });
});
