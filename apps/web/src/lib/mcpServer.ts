import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api.js";
import {
  decrypt,
  encrypt,
  base64ToSalt,
  deriveKey,
  importKeyFromBase64,
  unwrapKeyForToken,
  verifyPassphrase,
  wrapKeyForToken,
} from "@devcents/shared";
import {
  normalizeCategory,
  getCategoryLabel,
  ALL_CATEGORY_VALUES,
  EXPENSE_CATEGORY_VALUES,
  INCOME_CATEGORY_VALUES,
  isTransferCategory,
} from "@devcents/shared/categories";
import { matchRule, parseRules } from "@devcents/shared/categoryRules";
import {
  recurringOccurrencesBetween,
  dayKey,
  DAY_MS,
} from "./planningUtils";
import { toBaseAtLockedRate } from "./lockedRate";

const TIMEZONE_SCHEMA = {
  type: "string",
  description:
    "IANA time zone used to decide which day/month a transaction falls in (e.g. 'Asia/Colombo', 'America/New_York'). Defaults to UTC.",
};

const CATEGORY_HELP =
  `Category slug. Expense: ${EXPENSE_CATEGORY_VALUES.join(", ")}. ` +
  `Income: ${INCOME_CATEGORY_VALUES.join(", ")}. ` +
  "Other names are mapped to the closest slug (or 'other').";

const CATEGORY_INPUT_SCHEMA = {
  type: "string",
  enum: [...ALL_CATEGORY_VALUES],
  description: CATEGORY_HELP,
};

const CATEGORY_FILTER_SCHEMA = {
  type: "string",
  description: `Filter by category. ${CATEGORY_HELP}`,
};

import { getOrigin, readLimitedText } from "./oauthServer";
import { getServerConvexUrl } from "./serverConfig";

const MAX_MCP_BODY_BYTES = 256 * 1024;
const MAX_BATCH_SIZE = 10;

function getConvexClient() {
  return new ConvexHttpClient(getServerConvexUrl());
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
      "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, X-DevCents-API-Key, X-DevCents-Passphrase",
  };
}

export const TOOLS = [
  {
    name: "get_transactions",
    description:
      "Fetch recent DevCents transactions with pagination, date filtering, and category/type filtering. Automatically decrypted. page_income/page_expense are converted to the user's base currency (totals_currency) at each transaction's locked rate; transfers between own accounts and undecryptable rows are excluded from them.",
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
        category: CATEGORY_FILTER_SCHEMA,
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
      "Search transactions across full history by query string (matching description or category), exact year/month/day (in `timezone`, default UTC), amount range (native amount), or category. Returns matching decrypted records with totals in the user's base currency (totals_currency); transfers between own accounts and undecryptable rows are excluded from totals.",
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
        category: CATEGORY_FILTER_SCHEMA,
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
        timezone: TIMEZONE_SCHEMA,
      },
    },
  },
  {
    name: "get_spending_summary",
    description:
      "Get aggregated financial summary for a month or year (bucketed in `timezone`, default UTC): total income, total expenses, net savings and category breakdown in the user's base currency (totals_currency, at each transaction's locked rate), plus per-currency native income/expense. Transfers between own accounts are excluded (transfers_out_excluded reports the outgoing legs only).",
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
        timezone: TIMEZONE_SCHEMA,
      },
    },
  },
  {
    name: "get_cashflow_forecast",
    description:
      "Calculate cashflow and balance projection over a future time horizon (30 to 365 days) combining the current ledger balance, planned income/expenses (overdue unposted items count as due today) and active recurring schedules (occurrences already posted are skipped). Amounts are in the user's base currency; the window starts at the start of today in `timezone` (default UTC).",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        horizon_days: {
          type: "number",
          enum: [30, 60, 90, 180, 365],
          description: "Number of days to forecast into the future (default: 30)",
        },
        timezone: TIMEZONE_SCHEMA,
      },
    },
  },
  {
    name: "get_wallet_balances",
    description:
      "Get current net balances per currency held in DevCents, plus an approximate USD total converted at today's cached exchange rates (not the rates locked on each transaction).",
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
          description: "Positive amount, less than 1e12",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Whether it is an income or expense",
        },
        category: CATEGORY_INPUT_SCHEMA,
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
            "Date as Unix timestamp in milliseconds (not seconds). Current time will be used if omitted.",
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
          description: "Positive amount, less than 1e12",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Income or expense",
        },
        category: CATEGORY_INPUT_SCHEMA,
        description: {
          type: "string",
          description: "Description for the planned item",
        },
        date: {
          type: "number",
          description: "Target date (today or later) as Unix timestamp in milliseconds",
        },
        currency: {
          type: "string",
          description: "3-letter currency code (defaults to the user's base currency)",
        },
        timezone: {
          ...TIMEZONE_SCHEMA,
          description: "IANA time zone used to decide what 'today' is when checking the date. Defaults to UTC.",
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
        category: CATEGORY_INPUT_SCHEMA,
        description: {
          type: "string",
          description: "Description",
        },
        start_date: {
          type: "number",
          description: "Starting date as Unix timestamp in milliseconds",
        },
        cadence: {
          type: "string",
          enum: ["weekly", "biweekly", "monthly", "yearly"],
          description: "Recurrence cadence",
        },
        currency: {
          type: "string",
          description: "3-letter currency code (defaults to the user's base currency)",
        },
      },
      required: ["amount", "type", "category", "description", "start_date", "cadence"],
    },
  },
  {
    name: "get_budget",
    description:
      "Get the overall budget limit, actual spend, remaining funds, and utilization percentage for a given month (YYYY-MM, bucketed in `timezone`, default UTC). Limit and spend are in the user's base currency; transfers are excluded. Status is warning from 80% used.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        month: {
          type: "string",
          description: "Month in format 'YYYY-MM' (defaults to current month)",
        },
        timezone: TIMEZONE_SCHEMA,
      },
    },
  },
  {
    name: "set_budget",
    description:
      "Set or update the overall spending budget limit for a specific month (YYYY-MM). The limit is in the user's base currency.",
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
          description: "Spending limit in the user's base currency (greater than 0)",
        },
      },
      required: ["month", "limit"],
    },
  },
  {
    name: "get_category_budgets",
    description:
      "Per-category monthly budgets with spend so far, remaining amount, days left and status (healthy / warning at 80% / exceeded). Amounts are in the user's base currency, at each transaction's locked rate; months are bucketed in `timezone` (default UTC). Transfers between the user's own accounts are excluded.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        month: {
          type: "string",
          description: "Month in format 'YYYY-MM' (defaults to current month)",
        },
        timezone: TIMEZONE_SCHEMA,
      },
    },
  },
  {
    name: "set_category_budget",
    description:
      "Set, update or remove the monthly spending limit for one expense category. The limit applies to every month. Automatically encrypted before saving.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        category: {
          type: "string",
          enum: EXPENSE_CATEGORY_VALUES.filter((c) => c !== "transfer"),
          description: "Expense category slug",
        },
        limit: {
          type: "number",
          description: "Monthly limit. Use 0 to remove the budget.",
        },
        currency: {
          type: "string",
          description: "Currency of the limit (defaults to the user's base currency)",
        },
      },
      required: ["category", "limit"],
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
  rawToken: string,
  passphraseHeader?: string,
): Promise<{ key: CryptoKey | null; error?: string }> {
  let attached: { wrappedKey: string | null; legacyKeyB64: string | null };
  let check: { salt: string; verificationHash: string } | null;
  try {
    [attached, check] = await Promise.all([
      client.query(api.mcp.mcpGetTokenKey, { token: rawToken }),
      client.query(api.mcp.mcpGetEncryptionCheck, { token: rawToken }),
    ]);
  } catch {
    return { key: null, error: "Invalid or expired token." };
  }

  // Every key is checked against the account's current verification value
  // before use, so a key from before a passphrase change can never write
  // rows the user can no longer decrypt.
  const usable = async (key: CryptoKey) => !check || (await verifyPassphrase(key, check.verificationHash));
  const stale = {
    key: null,
    error: "This token's encryption key no longer matches your passphrase. Create a new token or reconnect.",
  };

  // 1. Key attached to the token, wrapped with the raw token.
  if (attached.wrappedKey) {
    try {
      const keyB64 = await unwrapKeyForToken(attached.wrappedKey, rawToken);
      const key = await importKeyFromBase64(keyB64);
      return (await usable(key)) ? { key } : stale;
    } catch (err) {
      console.error("[mcp] could not unwrap token key:", err);
      return { key: null, error: "The encryption key attached to this token could not be unlocked." };
    }
  }

  if (attached.legacyKeyB64) {
    const key = await importKeyFromBase64(attached.legacyKeyB64);
    if (!(await usable(key))) return stale;
    // Older tokens stored the key in plaintext. Wrap it now so the plaintext
    // copy is removed from the database.
    try {
      const wrappedKey = await wrapKeyForToken(attached.legacyKeyB64, rawToken);
      await client.mutation(api.mcp.mcpUpgradeLegacyKey, { token: rawToken, wrappedKey });
    } catch (err) {
      console.error("[mcp] legacy key upgrade failed:", err);
    }
    return { key };
  }

  // 2. Passphrase from the request header, or the server-wide env var
  //    (single-user self-hosting only).
  const passphrase =
    passphraseHeader ||
    (typeof process !== "undefined" && process.env && process.env.DEVCENTS_PASSPHRASE);

  if (passphrase && check) {
    const key = await deriveKey(passphrase, base64ToSalt(check.salt));
    return (await usable(key))
      ? { key }
      : { key: null, error: "The configured passphrase is incorrect for this account." };
  }

  return {
    key: null,
    error:
      "No encryption key is attached to this token. Create a remote token (or authorize via OAuth) and enter your passphrase when asked.",
  };
}

/** Converts between currencies using a USD-relative rate table. */
function convertWithRates(amount: number, from: string, to: string, rates: Record<string, number>): number {
  const f = rates[from.toUpperCase()] ?? (from.toUpperCase() === "USD" ? 1 : null);
  const t = rates[to.toUpperCase()] ?? (to.toUpperCase() === "USD" ? 1 : null);
  if (!f || !t) return amount;
  return (amount / f) * t;
}

// ─── Money helpers ──────────────────────────────────────────────────────

/** A budget turns to "warning" once spend reaches this share of the limit. */
export const BUDGET_WARNING_RATIO = 0.8;
/** Upper bound (exclusive) for any amount written through MCP. */
export const MAX_AMOUNT = 1e12;
/** Millisecond timestamps are above this; smaller values are almost always seconds. */
const MIN_MS_TIMESTAMP = 1e11;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export type Rates = Record<string, number>;
type EntryType = "income" | "expense";

/** Bad tool input. Its message is safe to show the MCP client. */
export class ToolInputError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function budgetStatus(ratio: number): "healthy" | "warning" | "exceeded" {
  if (ratio >= 1) return "exceeded";
  return ratio >= BUDGET_WARNING_RATIO ? "warning" : "healthy";
}

/** Amount of a decrypted row, or null when it could not be read. */
export function rowAmount(row: { amount?: unknown; decrypt_failed?: boolean }): number | null {
  if (row.decrypt_failed) return null;
  const n =
    typeof row.amount === "number" ? row.amount : typeof row.amount === "string" ? Number(row.amount) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Legacy rows without a currency were recorded in USD (same default as the web app). */
export function rowCurrency(row: { currency?: unknown }): string {
  return typeof row.currency === "string" && row.currency ? row.currency.toUpperCase() : "USD";
}

/** Row amount in the base currency at its locked rate, or null when unreadable. */
export function rowToBase(row: any, base: string, rates: Rates): number | null {
  const amount = rowAmount(row);
  if (amount === null) return null;
  const locked = typeof row.rateToUSD === "number" ? row.rateToUSD : undefined;
  return toBaseAtLockedRate(amount, rowCurrency(row), locked, base, rates);
}

function isTransferRow(row: { category?: unknown; type?: EntryType }): boolean {
  return typeof row.category === "string" && isTransferCategory(row.category, row.type);
}

export type LedgerTotals = {
  income: number;
  expense: number;
  /** Outgoing legs of transfers between own accounts (one side only, so a pair isn't counted twice). */
  transfers_out: number;
  skipped_undecryptable: number;
};

/** Income/expense totals in `base`, excluding transfers and unreadable rows. */
export function sumLedger(rows: any[], base: string, rates: Rates): LedgerTotals {
  let income = 0;
  let expense = 0;
  let transfersOut = 0;
  let skipped = 0;
  for (const row of rows) {
    const value = rowToBase(row, base, rates);
    if (value === null) {
      skipped++;
      continue;
    }
    if (isTransferRow(row)) {
      if (row.type === "expense") transfersOut += value;
      continue;
    }
    if (row.type === "income") income += value;
    else if (row.type === "expense") expense += value;
  }
  return {
    income: round2(income),
    expense: round2(expense),
    transfers_out: round2(transfersOut),
    skipped_undecryptable: skipped,
  };
}

/** Native-currency income and expense per currency, excluding transfers and unreadable rows. */
export function currencyBreakdown(rows: any[]): Record<string, { income: number; expense: number }> {
  const out: Record<string, { income: number; expense: number }> = {};
  for (const row of rows) {
    const amount = rowAmount(row);
    if (amount === null || isTransferRow(row)) continue;
    const ccy = rowCurrency(row);
    const prev = out[ccy] ?? { income: 0, expense: 0 };
    out[ccy] =
      row.type === "income"
        ? { ...prev, income: round2(prev.income + amount) }
        : { ...prev, expense: round2(prev.expense + amount) };
  }
  return out;
}

// ─── Time zone helpers ──────────────────────────────────────────────────

export function resolveTimeZone(input: unknown): string {
  if (input === undefined || input === null || input === "") return "UTC";
  const invalid = new ToolInputError("timezone must be an IANA time zone such as 'Asia/Colombo' or 'UTC'.");
  if (typeof input !== "string" || input.length > 64) throw invalid;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input });
    return input;
  } catch {
    throw invalid;
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(tz: string): Intl.DateTimeFormat {
  const cached = zoneFormatters.get(tz);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  zoneFormatters.set(tz, fmt);
  return fmt;
}

export function zonedParts(ms: number, tz: string) {
  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const parts = zoneFormatter(tz).formatToParts(new Date(ms));
  return {
    year: get(parts, "year"),
    month: get(parts, "month"),
    day: get(parts, "day"),
    hour: get(parts, "hour") % 24,
    minute: get(parts, "minute"),
    second: get(parts, "second"),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" of `ms` in `tz`. */
export function monthKeyInZone(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad2(p.month)}`;
}

/** "YYYY-MM-DD" of `ms` in `tz`. */
export function dayKeyInZone(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function zoneOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of local midnight, in `tz`, of the day containing `ms`. */
export function startOfDayInZone(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day);
  const guess = wallMidnight - zoneOffsetMs(wallMidnight, tz);
  return wallMidnight - zoneOffsetMs(guess, tz);
}

// ─── Input validation ───────────────────────────────────────────────────

export function validateAmount(value: unknown, field = "amount"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= MAX_AMOUNT) {
    throw new ToolInputError(`${field} must be a number greater than 0 and less than 1e12.`);
  }
  return value;
}

export function validateTimestamp(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ToolInputError(`${field} must be a Unix timestamp in milliseconds.`);
  }
  if (value < MIN_MS_TIMESTAMP) {
    throw new ToolInputError(
      `${field} (${value}) looks like seconds. Pass milliseconds, e.g. ${Math.round(value * 1000)}.`,
    );
  }
  return value;
}

/** Validates a currency code against the rates table; a missing one means the base currency. */
export function validateCurrency(value: unknown, base: string, rates: Rates): string {
  if (value === undefined || value === null || value === "") return base.toUpperCase();
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CURRENCY_RE.test(code)) {
    throw new ToolInputError("currency must be a 3-letter ISO code such as 'USD' or 'LKR'.");
  }
  if (code !== "USD" && code !== base.toUpperCase() && !(code in rates)) {
    throw new ToolInputError(`Unknown currency '${code}': no exchange rate is available for it.`);
  }
  return code;
}

export function validateMonth(value: unknown, field = "month"): string {
  if (typeof value !== "string" || !MONTH_RE.test(value)) {
    throw new ToolInputError(`${field} must be in 'YYYY-MM' format (e.g. '2026-03').`);
  }
  return value;
}

function validateEntryType(value: unknown): EntryType {
  if (value !== "income" && value !== "expense") {
    throw new ToolInputError("type must be 'income' or 'expense'.");
  }
  return value;
}

function validateText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolInputError(`${field} is required.`);
  }
  return value;
}

/** USD value of one unit of `currency` from a USD-relative table (1 USD = rates[code]). */
export function rateToUSDFromTable(currency: string, rates: Rates): number | null {
  if (currency === "USD") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? 1 / r : null;
}

type ConvexClient = ReturnType<typeof getConvexClient>;

async function loadCurrencyContext(client: ConvexClient, mcpToken: string) {
  const [settings, ratesRow] = await Promise.all([
    client.query(api.mcp.mcpGetUserSettings, { token: mcpToken }),
    client.query(api.mcp.mcpGetExchangeRates, { token: mcpToken }),
  ]);
  const rates: Rates = { USD: 1, ...(ratesRow?.rates ?? {}) };
  return { base: (settings.currency || "USD").toUpperCase(), rates, ratesDate: ratesRow?.date ?? null };
}

/**
 * Locks the currency -> USD rate for an entry dated `dateMs`, the way the web
 * app does: the historical rate for past and present dates, today's rate for
 * future ones. Falls back to the cached rate table if the lookup fails.
 */
async function lockRateToUSD(
  client: ConvexClient,
  mcpToken: string,
  currency: string,
  dateMs: number,
  todayRates: Rates,
): Promise<number | undefined> {
  if (currency === "USD") return 1;
  const now = Date.now();
  if (dateMs <= now) {
    const isoDate = new Date(dateMs).toISOString().slice(0, 10);
    try {
      const rate = await client.action(api.mcp.mcpRateToUSD, { token: mcpToken, date: isoDate, currency });
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate;
    } catch {
      // Rate service unavailable: use the cached table below.
    }
    try {
      const row = await client.query(api.mcp.mcpGetExchangeRates, { token: mcpToken, date: isoDate });
      const cached = rateToUSDFromTable(currency, row?.rates ?? {});
      if (cached) return cached;
    } catch {
      // Fall through to today's rates.
    }
  }
  return rateToUSDFromTable(currency, todayRates) ?? undefined;
}

// ─── Cashflow forecast ──────────────────────────────────────────────────

export type ForecastEvent = {
  date: number;
  type: EntryType;
  amount: number;
  description: string;
  source: "planned" | "recurring";
  overdue_since?: number;
};

/**
 * Future events between `windowStart` (start of today) and `horizonEnd`, in
 * the base currency. Overdue unposted planned items are due now; recurring
 * occurrences already posted to the ledger (same recurring id, same day) are
 * skipped so they aren't counted twice.
 */
export function buildForecastEvents(opts: {
  planned: any[];
  recurring: any[];
  posted: { recurringId: string; date: number }[];
  windowStart: number;
  horizonEnd: number;
  base: string;
  rates: Rates;
}): { events: ForecastEvent[]; skipped_undecryptable: number } {
  const { windowStart, horizonEnd, base, rates } = opts;
  const postedKeys = new Set(opts.posted.map((p) => `${p.recurringId}|${dayKey(p.date)}`));
  const events: ForecastEvent[] = [];
  let skipped = 0;

  for (const p of opts.planned) {
    if ((p.status ?? "planned") !== "planned" || p.date > horizonEnd || isTransferRow(p)) continue;
    const amount = rowToBase(p, base, rates);
    if (amount === null) {
      skipped++;
      continue;
    }
    const overdue = p.date < windowStart;
    events.push({
      date: overdue ? windowStart : p.date,
      type: p.type,
      amount,
      description: p.description,
      source: "planned",
      ...(overdue ? { overdue_since: p.date } : {}),
    });
  }

  for (const r of opts.recurring) {
    if (isTransferRow(r)) continue;
    const amount = rowToBase(r, base, rates);
    if (amount === null) {
      skipped++;
      continue;
    }
    const occurrences = recurringOccurrencesBetween(r.startDate, r.cadence, windowStart, horizonEnd);
    for (const occ of occurrences) {
      if (postedKeys.has(`${r._id}|${dayKey(occ)}`)) continue;
      events.push({
        date: occ,
        type: r.type,
        amount,
        description: `${r.description} (${r.cadence})`,
        source: "recurring",
      });
    }
  }

  const sorted = [...events].sort((a, b) => a.date - b.date);
  return { events: sorted, skipped_undecryptable: skipped };
}

/** Spend vs limit for each category budget in `month` (YYYY-MM), in base currency. */
async function categoryBudgetStatus(
  client: ReturnType<typeof getConvexClient>,
  mcpToken: string,
  key: CryptoKey,
  month: string,
  tz = "UTC",
) {
  const [budgets, rawTxs, { base, rates }] = await Promise.all([
    client.query(api.mcp.mcpGetCategoryBudgets, { token: mcpToken }),
    client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken }),
    loadCurrencyContext(client, mcpToken),
  ]);
  const txs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

  const spent: Record<string, number> = {};
  let skipped = 0;
  for (const t of txs) {
    if (t.type !== "expense" || isTransferRow(t)) continue;
    if (monthKeyInZone(t.date, tz) !== month) continue;
    const value = rowToBase(t, base, rates);
    if (value === null) {
      skipped++;
      continue;
    }
    spent[t.category] = (spent[t.category] ?? 0) + value;
  }

  const [y, m] = month.split("-").map(Number);
  const today = zonedParts(Date.now(), tz);
  const isCurrent = today.year === y && today.month === m;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = isCurrent ? daysInMonth - today.day + 1 : 0;

  const round = round2;
  const rows = [];
  for (const b of budgets) {
    let rawLimit: number;
    try {
      rawLimit = typeof b.limit === "number" ? b.limit : parseFloat(b.encrypted ? await decrypt(b.limit, key) : b.limit);
    } catch {
      continue;
    }
    if (!Number.isFinite(rawLimit)) continue;
    const limit = convertWithRates(rawLimit, b.currency, base, rates);
    const used = spent[b.category] ?? 0;
    const ratio = limit > 0 ? used / limit : 0;
    rows.push({
      category: b.category,
      label: getCategoryLabel(b.category, "expense"),
      limit: round(limit),
      spent: round(used),
      remaining: round(limit - used),
      percent_used: Math.round(ratio * 1000) / 10,
      per_day_left: daysLeft > 0 ? round(Math.max(0, limit - used) / daysLeft) : null,
      status: budgetStatus(ratio),
    });
  }
  rows.sort((a, b) => b.percent_used - a.percent_used);
  return {
    month,
    timezone: tz,
    base_currency: base,
    days_left: daysLeft,
    skipped_undecryptable: skipped,
    budgets: rows,
  };
}

/**
 * Picks the category for an MCP write. A rule the user taught by
 * re-categorizing this merchant wins over the model's guess.
 */
async function resolveCategory(
  client: ReturnType<typeof getConvexClient>,
  mcpToken: string,
  key: CryptoKey,
  category: string,
  type: "income" | "expense",
  description: string,
): Promise<string> {
  try {
    const row = await client.query(api.mcp.mcpGetCategoryRules, { token: mcpToken });
    if (row) {
      const json = row.encrypted ? await decrypt(row.data, key) : row.data;
      const learned = matchRule(parseRules(json), description, type);
      if (learned) return learned;
    }
  } catch {
    // Rules are a hint; fall through to name/keyword matching.
  }
  return normalizeCategory(category, type, description);
}

/**
 * Decrypts a row. A row that can't be decrypted is returned with
 * `decrypt_failed: true` and `amount: null`, so sums skip it instead of
 * silently counting it as 0.
 */
export async function decryptItem(item: any, key: CryptoKey) {
  // Legacy rows may hold free-text categories; expose the canonical slug.
  const row =
    typeof item.category === "string"
      ? { ...item, category: normalizeCategory(item.category, item.type) }
      : item;
  if (!row.encrypted) return row;
  try {
    const rawAmt =
      typeof row.amount === "string" ? await decrypt(row.amount, key) : row.amount;
    const desc = await decrypt(row.description, key);
    return {
      ...row,
      amount: typeof rawAmt === "string" ? parseFloat(rawAmt) : rawAmt,
      description: desc,
    };
  } catch {
    return { ...row, amount: null, description: "[Decryption Failed]", decrypt_failed: true };
  }
}

/**
 * Turns an error into text safe to show an MCP client: validation messages
 * thrown by our own Convex functions pass through, everything else (stack
 * traces, request ids, internal URLs) is replaced with a generic message.
 */
export function publicToolError(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { code?: string; message?: string } | undefined;
    if (data?.code === "UNAUTHENTICATED") return "Authentication error: invalid or expired token.";
    if (data?.code === "INVALID_ARGUMENT" && data.message) return `Error: ${data.message}`;
  }
  return "The tool failed. Check the arguments and try again.";
}

export function handleMcpOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export function handleMcpGet(request?: Request): Response {
  const origin = request ? getOrigin(request) : "";
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

  const text = await readLimitedText(request, MAX_MCP_BODY_BYTES);
  if (text === null) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large" } },
      { status: 413, headers: getCorsHeaders() },
    );
  }

  let rawBody: any;
  try {
    rawBody = JSON.parse(text);
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

      const effectiveToken = rawToken;
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
        const mcpToken = effectiveToken;
        const { key, error: keyError } = await resolveEncryptionKey(
          client,
          effectiveToken,
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

          const raw = await client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken });

          let filtered = await Promise.all(raw.map((t) => decryptItem(t, key)));

          if (toolArgs.type) {
            filtered = filtered.filter((t) => t.type === toolArgs.type);
          }
          if (toolArgs.category) {
            filtered = filtered.filter((t) =>
              t.category === normalizeCategory(toolArgs.category, t.type)
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
          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const totals = sumLedger(page, base, rates);

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
                      totals_currency: base,
                      page_income: totals.income,
                      page_expense: totals.expense,
                      page_transfers_out_excluded: totals.transfers_out,
                      skipped_undecryptable: totals.skipped_undecryptable,
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
          const raw = await client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken });
          const decrypted = await Promise.all(raw.map((t) => decryptItem(t, key)));

          const queryText = (toolArgs.query || "").toLowerCase().trim();
          const targetYear = toolArgs.year;
          const targetMonth = toolArgs.month;
          const targetDay = toolArgs.day;
          const minAmt = toolArgs.min_amount;
          const maxAmt = toolArgs.max_amount;
          const targetType = toolArgs.type;
          const targetCategory: string | null = toolArgs.category ? String(toolArgs.category) : null;
          const limit = typeof toolArgs.limit === "number" ? toolArgs.limit : 50;
          const tz = resolveTimeZone(toolArgs.timezone);

          const results = decrypted.filter((t) => {
            if (queryText) {
              const descMatch = (t.description || "").toLowerCase().includes(queryText);
              const catMatch =
                (t.category || "").toLowerCase().includes(queryText) ||
                getCategoryLabel(t.category, t.type).toLowerCase().includes(queryText);
              if (!descMatch && !catMatch) return false;
            }

            if (targetType && t.type !== targetType) return false;
            if (targetCategory && t.category !== normalizeCategory(targetCategory, t.type)) return false;

            const amt = rowAmount(t);
            if ((typeof minAmt === "number" || typeof maxAmt === "number") && amt === null) return false;
            if (typeof minAmt === "number" && amt !== null && amt < minAmt) return false;
            if (typeof maxAmt === "number" && amt !== null && amt > maxAmt) return false;

            if (targetYear || targetMonth || targetDay) {
              const d = zonedParts(t.date, tz);
              if (targetYear && d.year !== targetYear) return false;
              if (targetMonth && d.month !== targetMonth) return false;
              if (targetDay && d.day !== targetDay) return false;
            }

            return true;
          });

          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const totals = sumLedger(results, base, rates);

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
                      timezone: tz,
                      totals_currency: base,
                      total_income: totals.income,
                      total_expense: totals.expense,
                      transfers_out_excluded: totals.transfers_out,
                      skipped_undecryptable: totals.skipped_undecryptable,
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
          const raw = await client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken });
          const decrypted = await Promise.all(raw.map((t) => decryptItem(t, key)));

          const tz = resolveTimeZone(toolArgs.timezone);
          const today = zonedParts(Date.now(), tz);
          const targetYear = toolArgs.year ?? today.year;
          const targetMonth = toolArgs.month; // 1-12 or undefined

          const filtered = decrypted.filter((t) => {
            const d = zonedParts(t.date, tz);
            if (d.year !== targetYear) return false;
            if (targetMonth && d.month !== targetMonth) return false;
            return true;
          });

          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          // Moves between the user's own accounts aren't income or spending.
          const totals = sumLedger(filtered, base, rates);
          const categoryBreakdown: Record<string, number> = {};
          for (const t of filtered) {
            if (t.type !== "expense" || isTransferRow(t)) continue;
            const value = rowToBase(t, base, rates);
            if (value === null) continue;
            categoryBreakdown[t.category] = round2((categoryBreakdown[t.category] ?? 0) + value);
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
                      timezone: tz,
                      totals_currency: base,
                      transaction_count: filtered.length,
                      total_income: totals.income,
                      total_expenses: totals.expense,
                      net_savings: round2(totals.income - totals.expense),
                      category_breakdown: categoryBreakdown,
                      currency_breakdown_native: currencyBreakdown(filtered),
                      transfers_out_excluded: totals.transfers_out,
                      skipped_undecryptable: totals.skipped_undecryptable,
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
          const tz = resolveTimeZone(toolArgs.timezone);
          const nowMs = Date.now();
          // Planned and recurring items share one window: start of today.
          const windowStart = startOfDayInZone(nowMs, tz);
          const horizonEnd = nowMs + horizonDays * DAY_MS;

          const [rawTxs, rawPlanned, rawRecurring, posted, { base, rates }] = await Promise.all([
            client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken }),
            client.query(api.mcp.mcpGetPlanned, { token: mcpToken, status: "planned" }),
            client.query(api.mcp.mcpGetRecurring, { token: mcpToken, activeOnly: true }),
            client.query(api.mcp.mcpGetPostedOccurrences, { token: mcpToken }),
            loadCurrencyContext(client, mcpToken),
          ]);
          const [decTxs, decPlanned, decRecurring] = await Promise.all([
            Promise.all(rawTxs.map((t) => decryptItem(t, key))),
            Promise.all(rawPlanned.map((p) => decryptItem(p, key))),
            Promise.all(rawRecurring.map((r) => decryptItem(r, key))),
          ]);

          // 1. Current balance from the ledger, in base currency, transfers excluded.
          const ledger = sumLedger(decTxs, base, rates);
          const currentBalance = round2(ledger.income - ledger.expense);

          // 2. Planned (incl. overdue) and unposted recurring occurrences.
          const { events: futureEvents, skipped_undecryptable: skippedFuture } = buildForecastEvents({
            planned: decPlanned,
            recurring: decRecurring,
            posted,
            windowStart,
            horizonEnd,
            base,
            rates,
          });

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
            minBalance = Math.min(minBalance, runningBalance);
            return {
              date: dayKeyInZone(evt.date, tz),
              description: evt.description,
              type: evt.type,
              amount: round2(evt.amount),
              source: evt.source,
              ...(evt.overdue_since !== undefined
                ? { overdue_since: dayKeyInZone(evt.overdue_since, tz) }
                : {}),
              projected_balance: round2(runningBalance),
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
                      timezone: tz,
                      totals_currency: base,
                      current_balance: currentBalance,
                      projected_final_balance: round2(runningBalance),
                      lowest_projected_balance: round2(minBalance),
                      projected_income: round2(projectedIncome),
                      projected_expenses: round2(projectedExpense),
                      net_projected_change: round2(runningBalance - currentBalance),
                      events_count: futureEvents.length,
                      overdue_planned_count: futureEvents.filter((e) => e.overdue_since !== undefined).length,
                      skipped_undecryptable: ledger.skipped_undecryptable + skippedFuture,
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
          const rawTxs = await client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken });
          const decTxs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

          const balancesByCurrency: Record<string, number> = {};
          let skipped = 0;
          for (const t of decTxs) {
            const amt = rowAmount(t);
            if (amt === null) {
              skipped++;
              continue;
            }
            const ccy = rowCurrency(t);
            balancesByCurrency[ccy] = (balancesByCurrency[ccy] ?? 0) + (t.type === "income" ? amt : -amt);
          }

          const ratesRow = await client.query(api.mcp.mcpGetExchangeRates, { token: mcpToken });
          const rates: Rates = { USD: 1, ...(ratesRow?.rates ?? {}) };

          let totalInUSD = 0;
          const breakdown: Record<
            string,
            { balance: number; units_per_usd: number | null; usd_equivalent_approx: number | null }
          > = {};
          const unconverted: string[] = [];

          for (const [ccy, bal] of Object.entries(balancesByCurrency)) {
            const unitsPerUsd = rates[ccy] > 0 ? rates[ccy] : null;
            const usdEq = unitsPerUsd ? bal / unitsPerUsd : null;
            if (usdEq === null) unconverted.push(ccy);
            else totalInUSD += usdEq;
            breakdown[ccy] = {
              balance: round2(bal),
              units_per_usd: unitsPerUsd,
              usd_equivalent_approx: usdEq === null ? null : round2(usdEq),
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
                      total_usd_approx_at_today_rates: round2(totalInUSD),
                      total_note:
                        "Approximate: each currency balance is converted at today's exchange rates, not the rates locked when transactions were recorded.",
                      currencies: breakdown,
                      currencies_without_rate: unconverted,
                      skipped_undecryptable: skipped,
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
          const amount = validateAmount(toolArgs.amount);
          const type = validateEntryType(toolArgs.type);
          const category = validateText(toolArgs.category, "category");
          const description = validateText(toolArgs.description, "description");
          const txDate =
            toolArgs.date === undefined || toolArgs.date === null
              ? Date.now()
              : validateTimestamp(toolArgs.date, "date");
          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const currency = validateCurrency(toolArgs.currency, base, rates);
          const rateToUSD = await lockRateToUSD(client, mcpToken, currency, txDate, rates);

          const txId = await client.mutation(api.mcp.mcpAddTransaction, {
            token: mcpToken,
            amount: await encrypt(amount.toString(), key),
            type,
            category: await resolveCategory(client, mcpToken, key, category, type, description),
            description: await encrypt(description, key),
            currency,
            rateToUSD,
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
                  text: `Transaction of ${amount} ${currency} encrypted and saved successfully (ID: ${txId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 7: get_planned_transactions ──────────────────────────
        if (toolName === "get_planned_transactions") {
          const raw = await client.query(api.mcp.mcpGetPlanned, {
            token: mcpToken,
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
          const amount = validateAmount(toolArgs.amount);
          const type = validateEntryType(toolArgs.type);
          const category = validateText(toolArgs.category, "category");
          const description = validateText(toolArgs.description, "description");
          const date = validateTimestamp(toolArgs.date, "date");
          const tz = resolveTimeZone(toolArgs.timezone);
          if (date < startOfDayInZone(Date.now(), tz)) {
            throw new ToolInputError(
              "date is in the past. Planned items must be dated today or later; use add_transaction for past entries.",
            );
          }
          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const currency = validateCurrency(toolArgs.currency, base, rates);
          const rateToUSD = await lockRateToUSD(client, mcpToken, currency, date, rates);

          const plannedId = await client.mutation(api.mcp.mcpAddPlanned, {
            token: mcpToken,
            amount: await encrypt(amount.toString(), key),
            type,
            category: await resolveCategory(client, mcpToken, key, category, type, description),
            description: await encrypt(description, key),
            date,
            currency,
            rateToUSD,
            encrypted: true,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Planned item of ${amount} ${currency} scheduled and encrypted successfully (ID: ${plannedId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 9: get_recurring_transactions ────────────────────────
        if (toolName === "get_recurring_transactions") {
          const activeOnly = toolArgs.active_only !== false;
          const raw = await client.query(api.mcp.mcpGetRecurring, {
            token: mcpToken,
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
          const amount = validateAmount(toolArgs.amount);
          const type = validateEntryType(toolArgs.type);
          const category = validateText(toolArgs.category, "category");
          const description = validateText(toolArgs.description, "description");
          const startDate = validateTimestamp(toolArgs.start_date, "start_date");
          const cadence = toolArgs.cadence;
          if (cadence !== "weekly" && cadence !== "biweekly" && cadence !== "monthly" && cadence !== "yearly") {
            throw new ToolInputError("cadence must be one of weekly, biweekly, monthly, yearly.");
          }
          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const currency = validateCurrency(toolArgs.currency, base, rates);
          const rateToUSD = await lockRateToUSD(client, mcpToken, currency, startDate, rates);

          const recurringId = await client.mutation(api.mcp.mcpAddRecurring, {
            token: mcpToken,
            amount: await encrypt(amount.toString(), key),
            type,
            category: await resolveCategory(client, mcpToken, key, category, type, description),
            description: await encrypt(description, key),
            startDate,
            cadence,
            currency,
            rateToUSD,
            encrypted: true,
          });

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Recurring schedule of ${amount} ${currency} (${cadence}) created and encrypted successfully (ID: ${recurringId})`,
                },
              ],
            },
          };
        }

        // ─── Tool 11: get_budget ───────────────────────────────────────
        if (toolName === "get_budget") {
          const tz = resolveTimeZone(toolArgs.timezone);
          const targetMonth =
            toolArgs.month === undefined || toolArgs.month === null || toolArgs.month === ""
              ? monthKeyInZone(Date.now(), tz)
              : validateMonth(toolArgs.month);
          const [budget, rawTxs, { base, rates }] = await Promise.all([
            client.query(api.mcp.mcpGetBudget, { token: mcpToken, month: targetMonth }),
            client.query(api.mcp.mcpGetAllTransactions, { token: mcpToken }),
            loadCurrencyContext(client, mcpToken),
          ]);
          const decTxs = await Promise.all(rawTxs.map((t) => decryptItem(t, key)));

          // Spend in the base currency; the overall limit is in the base currency too.
          const inMonth = decTxs.filter((t) => t.type === "expense" && monthKeyInZone(t.date, tz) === targetMonth);
          const totals = sumLedger(inMonth, base, rates);
          const actualSpent = totals.expense;

          const categoryStatus = await categoryBudgetStatus(client, mcpToken, key, targetMonth, tz);
          const limit: number | null = budget?.limit ?? null;
          const remaining = limit !== null ? round2(limit - actualSpent) : null;
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
                      timezone: tz,
                      currency: base,
                      budget_limit: limit,
                      spent_so_far: actualSpent,
                      remaining,
                      percent_used: percentUsed !== null ? `${percentUsed.toFixed(1)}%` : null,
                      status:
                        limit === null || limit <= 0
                          ? "no_budget_set"
                          : budgetStatus(actualSpent / limit),
                      skipped_undecryptable: totals.skipped_undecryptable,
                      category_alerts: categoryStatus.budgets
                        .filter((b) => b.status !== "healthy")
                        .map((b) => `${b.label}: ${b.percent_used}% used (${b.status})`),
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
          const month = validateMonth(toolArgs.month);
          const limit = validateAmount(toolArgs.limit, "limit");
          const { base } = await loadCurrencyContext(client, mcpToken);

          const budgetId = await client.mutation(api.mcp.mcpSetBudget, {
            token: mcpToken,
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
                  text: `Budget for ${month} set to ${limit} ${base} (your base currency) (ID: ${budgetId})`,
                },
              ],
            },
          };
        }

        if (toolName === "get_category_budgets") {
          const tz = resolveTimeZone(toolArgs.timezone);
          const month =
            toolArgs.month === undefined || toolArgs.month === null || toolArgs.month === ""
              ? monthKeyInZone(Date.now(), tz)
              : validateMonth(toolArgs.month);
          const status = await categoryBudgetStatus(client, mcpToken, key, month, tz);
          return {
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] },
          };
        }

        if (toolName === "set_category_budget") {
          const { category, limit, currency } = toolArgs;
          const slug = typeof category === "string" ? normalizeCategory(category, "expense") : "other";
          if (slug === "transfer") {
            throw new ToolInputError("Transfers can't have a budget; pick an expense category.");
          }
          if (limit === 0) {
            await client.mutation(api.mcp.mcpSetCategoryBudget, { token: mcpToken, category: slug, remove: true });
            return {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: `Removed the ${getCategoryLabel(slug, "expense")} budget.` }] },
            };
          }
          const validLimit = validateAmount(limit, "limit");
          const { base, rates } = await loadCurrencyContext(client, mcpToken);
          const ccy = validateCurrency(currency, base, rates);
          await client.mutation(api.mcp.mcpSetCategoryBudget, {
            token: mcpToken,
            category: slug,
            limit: await encrypt(String(validLimit), key),
            currency: ccy,
            encrypted: true,
          });
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                { type: "text", text: `Set the ${getCategoryLabel(slug, "expense")} budget to ${validLimit} ${ccy} per month.` },
              ],
            },
          };
        }

        if (toolName === "get_exchange_rates") {
          const row = await client.query(api.mcp.mcpGetExchangeRates, {
            token: mcpToken,
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
        if (e instanceof ToolInputError) {
          return {
            jsonrpc: "2.0",
            id,
            result: { isError: true, content: [{ type: "text", text: `Invalid arguments: ${e.message}` }] },
          };
        }
        console.error(`[mcp] tool ${String(toolName)} failed:`, e);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: publicToolError(e) }],
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
    if (rawBody.length === 0 || rawBody.length > MAX_BATCH_SIZE) {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: `Batch must contain 1-${MAX_BATCH_SIZE} messages` } },
        { status: 400, headers: getCorsHeaders() },
      );
    }
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
