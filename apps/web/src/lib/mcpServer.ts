import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  hashToken,
  decrypt,
  encrypt,
  base64ToSalt,
  deriveKey,
  importKeyFromBase64,
} from "@devcents/shared";
import {
  recurringOccurrencesBetween,
  DAY_MS,
} from "./planningUtils";

import { getOrigin } from "./oauthServer";

function getConvexUrl(): string {
  const url =
    (typeof process !== "undefined" && process.env && process.env.CONVEX_URL) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CONVEX_URL) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONVEX_URL) ||
    "http://127.0.0.1:3210";
  return url;
}

function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2026-07-28", // MCP 2.0 draft
  "2025-11-25", // Latest standard SDK (OpenClaw, Claude, Cursor)
  "2025-06-18",
  "2025-03-26",
  "2024-11-05", // Legacy MCP 1.0
  "2024-10-07",
];

export const DEFAULT_PROTOCOL_VERSION = "2025-11-25";

export function negotiateProtocolVersion(requested?: string): string {
  if (!requested) {
    return DEFAULT_PROTOCOL_VERSION;
  }
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, X-DevCents-API-Key, X-DevCents-Passphrase",
  };
}

export const TOOLS = [
  {
    name: "get_transactions",
    description:
      "Fetch recent DevCents transactions with pagination, date filtering, and category/type filtering. Automatically decrypted.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to fetch (default: 50, max: 200)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination (default: 0)",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Filter by income or expense",
        },
        category: {
          type: "string",
          description: "Filter by category name",
        },
        since: {
          type: "number",
          description: "Filter transactions starting from this Unix timestamp (ms)",
        },
        until: {
          type: "number",
          description: "Filter transactions up to this Unix timestamp (ms)",
        },
        sort: {
          type: "string",
          enum: ["desc", "asc"],
          description: "Sort order by date (default: 'desc')",
        },
      },
    },
  },
  {
    name: "search_transactions",
    description:
      "Search transactions across full history by query string (matching description or category), exact year/month/day, amount range, or category. Returns matching decrypted records with calculated totals.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        query: {
          type: "string",
          description: "Text search query to match against description or category",
        },
        year: {
          type: "number",
          description: "Filter by calendar year (e.g. 2026)",
        },
        month: {
          type: "number",
          description: "Filter by calendar month (1-12)",
        },
        day: {
          type: "number",
          description: "Filter by day of month (1-31)",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Filter by transaction type",
        },
        category: {
          type: "string",
          description: "Filter by exact category name",
        },
        min_amount: {
          type: "number",
          description: "Minimum transaction amount",
        },
        max_amount: {
          type: "number",
          description: "Maximum transaction amount",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 50)",
        },
      },
    },
  },
  {
    name: "get_spending_summary",
    description:
      "Get aggregated financial summary and breakdown for a specified month or year: total income, total expenses, net savings, category breakdown, and currency totals.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        year: {
          type: "number",
          description: "Calendar year (defaults to current year)",
        },
        month: {
          type: "number",
          description: "Calendar month (1-12). If omitted, summarizes entire year.",
        },
      },
    },
  },
  {
    name: "get_cashflow_forecast",
    description:
      "Calculate cashflow and balance projection over a future time horizon (30 to 365 days) combining current ledger balances, planned future income/expenses, and active recurring schedules.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        horizon_days: {
          type: "number",
          enum: [30, 60, 90, 180, 365],
          description: "Number of days to forecast into the future (default: 30)",
        },
      },
    },
  },
  {
    name: "get_wallet_balances",
    description:
      "Get current net balances across all currencies held in DevCents and their converted total in USD based on live/cached exchange rates.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {},
    },
  },
  {
    name: "add_transaction",
    description:
      "Add a new expense or income to DevCents. Automatically encrypted before saving.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        amount: {
          type: "number",
          description: "The numerical amount",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Whether it is an income or expense",
        },
        category: {
          type: "string",
          description: "The category (e.g., 'Food and Dining', 'Shopping', 'Salary')",
        },
        description: {
          type: "string",
          description: "Description for the transaction",
        },
        currency: {
          type: "string",
          description:
            "Currency code (e.g., 'USD', 'LKR', 'EUR'). Uses default base currency if omitted.",
        },
        date: {
          type: "number",
          description:
            "Date as Unix timestamp (ms). Current time will be used if omitted.",
        },
      },
      required: ["amount", "type", "category", "description"],
    },
  },
  {
    name: "get_planned_transactions",
    description:
      "List one-time planned future transactions (upcoming bills, anticipated income). Automatically decrypted.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        status: {
          type: "string",
          enum: ["planned", "posted", "skipped"],
          description: "Filter by status (default: all)",
        },
      },
    },
  },
  {
    name: "add_planned_transaction",
    description:
      "Schedule a one-time future income or expense item in DevCents. Automatically encrypted before saving.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        amount: {
          type: "number",
          description: "The numerical amount",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Income or expense",
        },
        category: {
          type: "string",
          description: "Category",
        },
        description: {
          type: "string",
          description: "Description for the planned item",
        },
        date: {
          type: "number",
          description: "Target future date as Unix timestamp (ms)",
        },
        currency: {
          type: "string",
          description: "Currency code (default: USD)",
        },
      },
      required: ["amount", "type", "category", "description", "date"],
    },
  },
  {
    name: "get_recurring_transactions",
    description:
      "List repeating scheduled transactions (salaries, subscriptions, rent). Automatically decrypted.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        active_only: {
          type: "boolean",
          description: "Only return active schedules (default: true)",
        },
      },
    },
  },
  {
    name: "add_recurring_transaction",
    description:
      "Create a recurring transaction schedule in DevCents (e.g., monthly rent, biweekly salary). Automatically encrypted before saving.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        amount: {
          type: "number",
          description: "The repeating amount",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Income or expense",
        },
        category: {
          type: "string",
          description: "Category",
        },
        description: {
          type: "string",
          description: "Description",
        },
        start_date: {
          type: "number",
          description: "Starting date as Unix timestamp (ms)",
        },
        cadence: {
          type: "string",
          enum: ["weekly", "biweekly", "monthly", "yearly"],
          description: "Recurrence cadence",
        },
        currency: {
          type: "string",
          description: "Currency code (default: USD)",
        },
      },
      required: ["amount", "type", "category", "description", "start_date", "cadence"],
    },
  },
  {
    name: "get_budget",
    description:
      "Get budget limit, actual spend, remaining funds, and utilization percentage for a given month (YYYY-MM).",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        month: {
          type: "string",
          description: "Month in format 'YYYY-MM' (defaults to current month)",
        },
      },
    },
  },
  {
    name: "set_budget",
    description:
      "Set or update the spending budget limit for a specific month (YYYY-MM).",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        month: {
          type: "string",
          description: "Target month in format 'YYYY-MM'",
        },
        limit: {
          type: "number",
          description: "Spending limit amount",
        },
      },
      required: ["month", "limit"],
    },
  },
  {
    name: "get_exchange_rates",
    description:
      "Get currency exchange rates relative to USD from the DevCents currency cache.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        date: {
          type: "string",
          description: "Date in 'YYYY-MM-DD' format (defaults to current date)",
        },
      },
    },
  },
];

async function resolveEncryptionKey(
  client: ConvexHttpClient,
  tokenHash: string,
  passphraseHeader?: string,
): Promise<{ key: CryptoKey | null; error?: string }> {
  // 1. Check if key is attached directly to the API token or OAuth token record in Convex
  let tokenLookupError: string | undefined;
  try {
    const keyB64 = await client.query(api.mcp.mcpGetTokenKey, { tokenHash });
    if (keyB64) {
      const key = await importKeyFromBase64(keyB64);
      return { key };
    }
  } catch (err: any) {
    console.warn("[mcp] Could not fetch attached key from token record:", err?.message || err);
    tokenLookupError = err?.message || String(err);
  }

  // 2. Check X-DevCents-Passphrase request header or server env DEVCENTS_PASSPHRASE
  const serverPassphrase =
    passphraseHeader ||
    (typeof process !== "undefined" && process.env && process.env.DEVCENTS_PASSPHRASE);

  if (serverPassphrase) {
    try {
      const saltB64 = await client.query(api.mcp.mcpGetEncryptionSalt, { tokenHash });
      const salt = base64ToSalt(saltB64);
      const key = await deriveKey(serverPassphrase, salt);
      return { key };
    } catch (err: any) {
      console.error("[mcp] Error querying salt or deriving key:", err);
      return {
        key: null,
        error: `Failed to derive key from server passphrase: ${err?.message || String(err)}`,
      };
    }
  }

  if (tokenLookupError) {
    return {
      key: null,
      error: `Convex token lookup failed: ${tokenLookupError}`,
    };
  }

  return {
    key: null,
    error:
      "No encryption key is attached to this token in Convex. When generating a token or authorizing via OAuth, enter your passphrase to unlock zero-knowledge decryption. Otherwise, provide X-DevCents-Passphrase or set DEVCENTS_PASSPHRASE.",
  };
}

async function decryptItem(item: any, key: CryptoKey) {
  if (!item.encrypted) return item;
  try {
    const rawAmt =
      typeof item.amount === "string" ? await decrypt(item.amount, key) : item.amount;
    const desc = await decrypt(item.description, key);
    return {
      ...item,
      amount: typeof rawAmt === "string" ? parseFloat(rawAmt) : rawAmt,
      description: desc,
    };
  } catch {
    return { ...item, description: "[Decryption Failed]" };
  }
}

export function handleMcpOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export function handleMcpGet(request?: Request): Response {
  const origin = request ? getOrigin(request) : "https://devcents.012140.xyz";
  return Response.json(
    {
      status: "ok",
      service: "DevCents Remote Web MCP Server",
      version: "2.0.0",
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      endpoint: "/mcp",
      tools: TOOLS.map((t) => t.name),
      authentication: {
        type: "OAuth 2.1 / Bearer",
        resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
        authorization_server: `${origin}/.well-known/oauth-authorization-server`,
      },
    },
    {
      headers: {
        ...getCorsHeaders(),
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

export async function handleMcpPost(request: Request): Promise<Response> {
  const origin = getOrigin(request);

  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: Invalid JSON" },
      },
      { status: 400, headers: getCorsHeaders() },
    );
  }

  const client = getConvexClient();

  // Extract auth token from Authorization header or X-DevCents-API-Key
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-devcents-api-key");
  const passphraseHeader = request.headers.get("x-devcents-passphrase") || undefined;

  let rawToken = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    rawToken = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    rawToken = apiKeyHeader.trim();
  }

  const handleSingleMessage = async (msg: any): Promise<any> => {
    if (!msg || typeof msg !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      };
    }

    const { id, method: rpcMethod, params } = msg;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      return null;
    }

    // 1. initialize / server/discover
    if (rpcMethod === "initialize" || rpcMethod === "server/discover") {
      const protocolVersion = negotiateProtocolVersion(params?.protocolVersion);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: "DevCents MCP Server",
            version: "2.0.0",
          },
        },
      };
    }

    // 2. ping
    if (rpcMethod === "ping") {
      return {
        jsonrpc: "2.0",
        id,
        result: {},
      };
    }

    // 3. tools/list
    if (rpcMethod === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      };
    }

    // 4. tools/call
    if (rpcMethod === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      const effectiveToken = rawToken || toolArgs.api_key;
      if (!effectiveToken) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Authentication error: Missing token. Authorize via OAuth 2.1 or provide Authorization: Bearer <token>. Resource metadata: ${origin}/.well-known/oauth-protected-resource`,
              },
            ],
          },
        };
      }

      try {
        const tokenHash = await hashToken(effectiveToken);
        const { key, error: keyError } = await resolveEncryptionKey(
          client,
          tokenHash,
          passphraseHeader,
        );

        if (!key) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Decryption error: ${keyError || "No encryption key available."}`,
                },
              ],
            },
          };
        }

        // ─── Tool 1: get_transactions ──────────────────────────────────
        if (toolName === "get_transactions") {
          const limit = Math.min(typeof toolArgs.limit === "number" ? toolArgs.limit : 50, 200);
          const offset = typeof toolArgs.offset === "number" ? Math.max(toolArgs.offset, 0) : 0;
          const sortOrder = toolArgs.sort === "asc" ? "asc" : "desc";

          const raw = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });

          let filtered = await Promise.all(raw.map((t) => decryptItem(t, key)));

          if (toolArgs.type) {
            filtered = filtered.filter((t) => t.type === toolArgs.type);
          }
          if (toolArgs.category) {
            filtered = filtered.filter((t) =>
              t.category.toLowerCase() === toolArgs.category.toLowerCase()
            );
          }
          if (typeof toolArgs.since === "number") {
            filtered = filtered.filter((t) => t.date >= toolArgs.since);
          }
          if (typeof toolArgs.until === "number") {
            filtered = filtered.filter((t) => t.date <= toolArgs.until);
          }

          filtered.sort((a, b) => (sortOrder === "asc" ? a.date - b.date : b.date - a.date));

          const page = filtered.slice(offset, offset + limit);

          const totalIncome = page
            .filter((t) => t.type === "income")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          const totalExpense = page
            .filter((t) => t.type === "expense")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      total_matching: filtered.length,
                      offset,
                      limit,
                      page_income: totalIncome,
                      page_expense: totalExpense,
                      transactions: page,
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 2: search_transactions ───────────────────────────────
        if (toolName === "search_transactions") {
          const raw = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });
          const decrypted = await Promise.all(raw.map((t) => decryptItem(t, key)));

          const queryText = (toolArgs.query || "").toLowerCase().trim();
          const targetYear = toolArgs.year;
          const targetMonth = toolArgs.month;
          const targetDay = toolArgs.day;
          const minAmt = toolArgs.min_amount;
          const maxAmt = toolArgs.max_amount;
          const targetType = toolArgs.type;
          const targetCategory = (toolArgs.category || "").toLowerCase().trim();
          const limit = typeof toolArgs.limit === "number" ? toolArgs.limit : 50;

          const results = decrypted.filter((t) => {
            if (queryText) {
              const descMatch = (t.description || "").toLowerCase().includes(queryText);
              const catMatch = (t.category || "").toLowerCase().includes(queryText);
              if (!descMatch && !catMatch) return false;
            }

            if (targetType && t.type !== targetType) return false;
            if (targetCategory && (t.category || "").toLowerCase() !== targetCategory) return false;

            const amt = Number(t.amount) || 0;
            if (typeof minAmt === "number" && amt < minAmt) return false;
            if (typeof maxAmt === "number" && amt > maxAmt) return false;

            if (targetYear || targetMonth || targetDay) {
              const d = new Date(t.date);
              if (targetYear && d.getFullYear() !== targetYear) return false;
              if (targetMonth && d.getMonth() + 1 !== targetMonth) return false;
              if (targetDay && d.getDate() !== targetDay) return false;
            }

            return true;
          });

          const totalIncome = results
            .filter((t) => t.type === "income")
            .reduce((s, t) => s + (Number(t.amount) || 0), 0);
          const totalExpense = results
            .filter((t) => t.type === "expense")
            .reduce((s, t) => s + (Number(t.amount) || 0), 0);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      matched_count: results.length,
                      total_income: totalIncome,
                      total_expense: totalExpense,
                      results: results.slice(0, limit),
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 3: get_spending_summary ──────────────────────────────
        if (toolName === "get_spending_summary") {
          const raw = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });
          const decrypted = await Promise.all(raw.map((t) => decryptItem(t, key)));

          const now = new Date();
          const targetYear = toolArgs.year ?? now.getFullYear();
          const targetMonth = toolArgs.month; // 1-12 or undefined

          const filtered = decrypted.filter((t) => {
            const d = new Date(t.date);
            if (d.getFullYear() !== targetYear) return false;
            if (targetMonth && d.getMonth() + 1 !== targetMonth) return false;
            return true;
          });

          let totalIncome = 0;
          let totalExpenses = 0;
          const categoryBreakdown: Record<string, number> = {};
          const currencyBreakdown: Record<string, number> = {};

          for (const t of filtered) {
            const amt = Number(t.amount) || 0;
            const ccy = t.currency || "USD";
            currencyBreakdown[ccy] = (currencyBreakdown[ccy] || 0) + amt;

            if (t.type === "income") {
              totalIncome += amt;
            } else {
              totalExpenses += amt;
              categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + amt;
            }
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      period: targetMonth ? `${targetYear}-${String(targetMonth).padStart(2, "0")}` : `${targetYear}`,
                      transaction_count: filtered.length,
                      total_income: totalIncome,
                      total_expenses: totalExpenses,
                      net_savings: totalIncome - totalExpenses,
                      category_breakdown: categoryBreakdown,
                      currency_breakdown: currencyBreakdown,
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 4: get_cashflow_forecast ─────────────────────────────
        if (toolName === "get_cashflow_forecast") {
          const horizonDays = toolArgs.horizon_days ?? 30;
          const nowMs = Date.now();
          const horizonMs = nowMs + horizonDays * DAY_MS;

          // 1. Current balance from all historical transactions
          const rawTxs = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });
          const decTxs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

          let currentBalance = 0;
          for (const t of decTxs) {
            const amt = Number(t.amount) || 0;
            if (t.type === "income") currentBalance += amt;
            else currentBalance -= amt;
          }

          // 2. Planned items in window
          const rawPlanned = await client.query(api.mcp.mcpGetPlanned, {
            tokenHash,
            status: "planned",
          });
          const decPlanned = await Promise.all(rawPlanned.map((p) => decryptItem(p, key)));
          const upcomingPlanned = decPlanned.filter(
            (p) => p.date >= nowMs && p.date <= horizonMs
          );

          // 3. Recurring items in window
          const rawRecurring = await client.query(api.mcp.mcpGetRecurring, {
            tokenHash,
            activeOnly: true,
          });
          const decRecurring = await Promise.all(rawRecurring.map((r) => decryptItem(r, key)));

          type Event = {
            date: number;
            type: "income" | "expense";
            amount: number;
            description: string;
            source: "planned" | "recurring";
          };

          const futureEvents: Event[] = [];

          for (const p of upcomingPlanned) {
            futureEvents.push({
              date: p.date,
              type: p.type,
              amount: Number(p.amount) || 0,
              description: p.description,
              source: "planned",
            });
          }

          for (const r of decRecurring) {
            const occurrences = recurringOccurrencesBetween(
              r.startDate,
              r.cadence,
              nowMs,
              horizonMs
            );
            for (const occ of occurrences) {
              futureEvents.push({
                date: occ,
                type: r.type,
                amount: Number(r.amount) || 0,
                description: `${r.description} (${r.cadence})`,
                source: "recurring",
              });
            }
          }

          futureEvents.sort((a, b) => a.date - b.date);

          let runningBalance = currentBalance;
          let minBalance = currentBalance;
          let projectedIncome = 0;
          let projectedExpense = 0;

          const timeline = futureEvents.map((evt) => {
            if (evt.type === "income") {
              runningBalance += evt.amount;
              projectedIncome += evt.amount;
            } else {
              runningBalance -= evt.amount;
              projectedExpense += evt.amount;
            }
            if (runningBalance < minBalance) {
              minBalance = runningBalance;
            }
            return {
              date: new Date(evt.date).toISOString().split("T")[0],
              description: evt.description,
              type: evt.type,
              amount: evt.amount,
              source: evt.source,
              projected_balance: runningBalance,
            };
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      horizon_days: horizonDays,
                      current_balance: currentBalance,
                      projected_final_balance: runningBalance,
                      lowest_projected_balance: minBalance,
                      projected_income: projectedIncome,
                      projected_expenses: projectedExpense,
                      net_projected_change: runningBalance - currentBalance,
                      events_count: futureEvents.length,
                      upcoming_events: timeline.slice(0, 30),
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 5: get_wallet_balances ───────────────────────────────
        if (toolName === "get_wallet_balances") {
          const rawTxs = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });
          const decTxs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

          const balancesByCurrency: Record<string, number> = {};
          for (const t of decTxs) {
            const ccy = (t.currency || "USD").toUpperCase();
            const amt = Number(t.amount) || 0;
            balancesByCurrency[ccy] = (balancesByCurrency[ccy] || 0) + (t.type === "income" ? amt : -amt);
          }

          const ratesRow = await client.query(api.mcp.mcpGetExchangeRates, { tokenHash });
          const rates: Record<string, number> = ratesRow?.rates || { USD: 1 };

          let totalInUSD = 0;
          const breakdownWithUSD: Record<string, { balance: number; rateToUSD: number; usdEquivalent: number }> = {};

          for (const [ccy, bal] of Object.entries(balancesByCurrency)) {
            const rate = rates[ccy] ?? (ccy === "USD" ? 1 : null);
            const usdEq = rate ? bal / rate : bal;
            totalInUSD += usdEq;
            breakdownWithUSD[ccy] = {
              balance: bal,
              rateToUSD: rate ?? 1,
              usdEquivalent: usdEq,
            };
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      total_estimated_usd: totalInUSD,
                      currencies: breakdownWithUSD,
                      rate_snapshot_date: ratesRow?.date || "latest",
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 6: add_transaction ───────────────────────────────────
        if (toolName === "add_transaction") {
          const { amount, type, category, description, currency, date } = toolArgs;

          if (typeof amount !== "number" || !type || !category || !description) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "Invalid arguments: amount, type, category, description are required.",
                  },
                ],
              },
            };
          }

          const encryptedAmount = await encrypt(amount.toString(), key);
          const encryptedDescription = await encrypt(description, key);
          const txDate = typeof date === "number" ? date : Date.now();

          const txId = await client.mutation(api.mcp.mcpAddTransaction, {
            tokenHash,
            amount: encryptedAmount,
            type,
            category,
            description: encryptedDescription,
            currency: currency ? currency.toUpperCase() : undefined,
            date: txDate,
            encrypted: true,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Transaction encrypted and saved successfully (ID: ${txId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 7: get_planned_transactions ──────────────────────────
        if (toolName === "get_planned_transactions") {
          const raw = await client.query(api.mcp.mcpGetPlanned, {
            tokenHash,
            status: toolArgs.status,
          });
          const decrypted = await Promise.all(raw.map((p) => decryptItem(p, key)));

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(decrypted, null, 2),
                },
              ],
            },
          };
        }

        // ─── Tool 8: add_planned_transaction ───────────────────────────
        if (toolName === "add_planned_transaction") {
          const { amount, type, category, description, date, currency } = toolArgs;
          if (typeof amount !== "number" || !type || !category || !description || typeof date !== "number") {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [{ type: "text", text: "amount, type, category, description, and date are required." }],
              },
            };
          }

          const encryptedAmount = await encrypt(amount.toString(), key);
          const encryptedDescription = await encrypt(description, key);

          const plannedId = await client.mutation(api.mcp.mcpAddPlanned, {
            tokenHash,
            amount: encryptedAmount,
            type,
            category,
            description: encryptedDescription,
            date,
            currency: currency ? currency.toUpperCase() : undefined,
            encrypted: true,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Planned item scheduled and encrypted successfully (ID: ${plannedId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 9: get_recurring_transactions ────────────────────────
        if (toolName === "get_recurring_transactions") {
          const activeOnly = toolArgs.active_only !== false;
          const raw = await client.query(api.mcp.mcpGetRecurring, {
            tokenHash,
            activeOnly,
          });
          const decrypted = await Promise.all(raw.map((r) => decryptItem(r, key)));

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(decrypted, null, 2),
                },
              ],
            },
          };
        }

        // ─── Tool 10: add_recurring_transaction ────────────────────────
        if (toolName === "add_recurring_transaction") {
          const { amount, type, category, description, start_date, cadence, currency } = toolArgs;
          if (
            typeof amount !== "number" ||
            !type ||
            !category ||
            !description ||
            typeof start_date !== "number" ||
            !cadence
          ) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "amount, type, category, description, start_date, and cadence are required.",
                  },
                ],
              },
            };
          }

          const encryptedAmount = await encrypt(amount.toString(), key);
          const encryptedDescription = await encrypt(description, key);

          const recurringId = await client.mutation(api.mcp.mcpAddRecurring, {
            tokenHash,
            amount: encryptedAmount,
            type,
            category,
            description: encryptedDescription,
            startDate: start_date,
            cadence,
            currency: currency ? currency.toUpperCase() : undefined,
            encrypted: true,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Recurring schedule created and encrypted successfully (ID: ${recurringId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 11: get_budget ───────────────────────────────────────
        if (toolName === "get_budget") {
          const targetMonth = toolArgs.month || new Date().toISOString().slice(0, 7);
          const budget = await client.query(api.mcp.mcpGetBudget, {
            tokenHash,
            month: targetMonth,
          });

          // Calculate actual spent in that month
          const rawTxs = await client.query(api.mcp.mcpGetAllTransactions, { tokenHash });
          const decTxs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

          let actualSpent = 0;
          for (const t of decTxs) {
            if (t.type === "expense") {
              const d = new Date(t.date).toISOString().slice(0, 7);
              if (d === targetMonth) {
                actualSpent += Number(t.amount) || 0;
              }
            }
          }

          const limit = budget?.limit ?? null;
          const remaining = limit !== null ? limit - actualSpent : null;
          const percentUsed = limit !== null && limit > 0 ? (actualSpent / limit) * 100 : null;

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      month: targetMonth,
                      budget_limit: limit,
                      spent_so_far: actualSpent,
                      remaining,
                      percent_used: percentUsed ? `${percentUsed.toFixed(1)}%` : null,
                      status:
                        limit === null
                          ? "no_budget_set"
                          : actualSpent > limit
                            ? "exceeded"
                            : actualSpent > limit * 0.85
                              ? "warning"
                              : "healthy",
                    },
                    null,
                    2,
                  ),
                },
              ],
            },
          };
        }

        // ─── Tool 12: set_budget ───────────────────────────────────────
        if (toolName === "set_budget") {
          const { month, limit } = toolArgs;
          if (!month || typeof limit !== "number") {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [{ type: "text", text: "month ('YYYY-MM') and limit are required." }],
              },
            };
          }

          const budgetId = await client.mutation(api.mcp.mcpSetBudget, {
            tokenHash,
            month,
            limit,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Budget for ${month} set to ${limit} (ID: ${budgetId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 13: get_exchange_rates ───────────────────────────────
        if (toolName === "get_exchange_rates") {
          const row = await client.query(api.mcp.mcpGetExchangeRates, {
            tokenHash,
            date: toolArgs.date,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(row ?? { message: "No exchange rates found" }, null, 2),
                },
              ],
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Unknown tool: ${toolName}`,
              },
            ],
          },
        };
      } catch (e: unknown) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${e instanceof Error ? e.message : String(e)}`,
              },
            ],
          },
        };
      }
    }

    // Method not found
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method '${rpcMethod}' not found`,
      },
    };
  };

  // Support batch JSON-RPC requests
  if (Array.isArray(rawBody)) {
    const responses = (await Promise.all(rawBody.map(handleSingleMessage))).filter(Boolean);
    return Response.json(responses, { headers: getCorsHeaders() });
  }

  const response = await handleSingleMessage(rawBody);
  if (!response) {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  return Response.json(response, { headers: getCorsHeaders() });
}

export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return handleMcpOptions();
  }
  if (method === "GET") {
    return handleMcpGet(request);
  }
  if (method === "POST") {
    return handleMcpPost(request);
  }
  return new Response("Method not allowed", {
    status: 405,
    headers: getCorsHeaders(),
  });
}
