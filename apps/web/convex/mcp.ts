import { internalMutation, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { sha256Hex } from "@devcents/shared/oauth";
import { EXPENSE_CATEGORY_VALUES, normalizeCategory } from "@devcents/shared/categories";
import { assertMaxLength, assertTokenHash } from "./lib/serverAuth";

const MAX_TOKENS_PER_USER = 25;
const MAX_TOKEN_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_WRAPPED_KEY_LENGTH = 512;
const MAX_TEXT_LENGTH = 4_000; // encrypted description/amount, base64

// ─── Token Management (Used by Frontend) ────────────────────────────────

export const generateToken = mutation({
  args: {
    name: v.string(),
    tokenHash: v.string(),
    wrappedKey: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    assertTokenHash(args.tokenHash);
    assertMaxLength(args.name, 100, "name");
    if (args.wrappedKey) assertMaxLength(args.wrappedKey, MAX_WRAPPED_KEY_LENGTH, "wrappedKey");
    const now = Date.now();
    if (args.expiresAt !== undefined && (args.expiresAt <= now || args.expiresAt > now + MAX_TOKEN_LIFETIME_MS)) {
      throw new Error("expiresAt must be in the future and within one year");
    }

    const existing = await ctx.db
      .query("apiTokens")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .take(MAX_TOKENS_PER_USER);
    if (existing.length >= MAX_TOKENS_PER_USER) {
      throw new Error(`At most ${MAX_TOKENS_PER_USER} tokens; revoke one first`);
    }

    return await ctx.db.insert("apiTokens", {
      userId: identity.subject,
      name: args.name,
      tokenHash: args.tokenHash,
      wrappedKey: args.wrappedKey,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
  },
});

export const listTokens = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    // Never return the hash or key material to the frontend.
    return tokens.map((t) => ({
      _id: t._id,
      name: t.name,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt ?? null,
      hasKey: Boolean(t.wrappedKey || t.keyB64),
    }));
  },
});

export const revokeToken = mutation({
  args: {
    id: v.id("apiTokens"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const token = await ctx.db.get(args.id);
    if (!token) throw new Error("Not found");
    if (token.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.delete(args.id);
  },
});

// ─── MCP Data Access (Used by MCP Server) ───────────────────────────────

/**
 * Helper to authenticate an MCP request using a token hash.
 * Checks both standard apiTokens and oauth_tokens.
 */
type McpAuth = {
  userId: string;
  wrappedKey: string | null;
  legacyKeyB64: string | null;
};

/**
 * Authenticates with the raw bearer token, hashed here. A stolen hash (for
 * example from a database dump) is therefore not a usable credential.
 */
async function authenticateMCP(ctx: QueryCtx | MutationCtx, rawToken: string): Promise<McpAuth> {
  if (!rawToken || rawToken.length > 200) throw new ConvexError({ code: "UNAUTHENTICATED" });
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();
  const token = await ctx.db
    .query("apiTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (token && (token.expiresAt === undefined || token.expiresAt > now)) {
    return {
      userId: token.userId,
      wrappedKey: token.wrappedKey ?? null,
      legacyKeyB64: token.keyB64 ?? null,
    };
  }

  const oauthToken = await ctx.db
    .query("oauth_tokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (oauthToken && oauthToken.expiresAt > now) {
    return {
      userId: oauthToken.userId,
      wrappedKey: oauthToken.wrappedKey ?? null,
      legacyKeyB64: oauthToken.keyB64 ?? null,
    };
  }

  throw new ConvexError({ code: "UNAUTHENTICATED" });
}

function assertTextFields(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "A field is too long" });
    }
  }
}

/** Salt and verification value, so the MCP server can check a key before using it. */
export const mcpGetEncryptionCheck = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    const settings = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return settings ? { salt: settings.salt, verificationHash: settings.verificationHash } : null;
  },
});

/** Wrapped key for this token (needs the raw token to unwrap), or a legacy plaintext key. */
export const mcpGetTokenKey = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await authenticateMCP(ctx, args.token);
    return { wrappedKey: auth.wrappedKey, legacyKeyB64: auth.legacyKeyB64 };
  },
});

/**
 * Replaces a legacy plaintext key with a wrapped one. Called by the MCP server
 * the first time an old token is used, so plaintext keys disappear over time.
 */
export const mcpUpgradeLegacyKey = mutation({
  args: { token: v.string(), wrappedKey: v.string() },
  handler: async (ctx, args) => {
    assertMaxLength(args.wrappedKey, MAX_WRAPPED_KEY_LENGTH, "wrappedKey");
    await authenticateMCP(ctx, args.token);
    const tokenHash = await sha256Hex(args.token);
    const apiToken = await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (apiToken?.keyB64) {
      await ctx.db.patch(apiToken._id, { wrappedKey: args.wrappedKey, keyB64: undefined });
      return true;
    }
    const oauthToken = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (oauthToken?.keyB64 && oauthToken.expiresAt > Date.now()) {
      // Only the access-token wrap is possible here (the refresh token is not
      // presented); the legacy key stays until the next refresh rotates it.
      await ctx.db.patch(oauthToken._id, { wrappedKey: args.wrappedKey });
      return true;
    }
    return false;
  },
});

/**
 * Admin-only cleanup: removes every remaining plaintext key. Tokens that were
 * never upgraded keep working for reads that don't need decryption; users
 * create a new remote token to restore decryption. Run with:
 *   npx convex run mcp:purgeLegacyPlaintextKeys --url ... --admin-key ...
 */
export const purgeLegacyPlaintextKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    let purged = 0;
    for (const table of ["apiTokens", "oauth_tokens", "oauth_codes"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.keyB64) {
          await ctx.db.patch(row._id, { keyB64: undefined });
          purged++;
        }
      }
    }
    return { purged };
  },
});

export const mcpGetTransactions = query({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);

    const limit = Math.min(args.limit ?? 50, 500);

    const items = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit * 2);

    return items
      .filter((t) => {
        if (args.type && t.type !== args.type) return false;
        if (args.since && t.date < args.since) return false;
        if (args.until && t.date > args.until) return false;
        if (args.category && normalizeCategory(t.category, t.type) !== normalizeCategory(args.category, t.type)) return false;
        return true;
      })
      .slice(0, limit);
  },
});

export const mcpGetAllTransactions = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);

    return await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const mcpAddTransaction = mutation({
  args: {
    token: v.string(),
    amount: v.union(v.number(), v.string()),
    currency: v.optional(v.string()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(),
    date: v.number(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    assertTextFields(args.amount, args.description, args.category, args.currency);

    const { token, ...transactionData } = args;

    const transactionId = await ctx.db.insert("transactions", {
      userId,
      ...transactionData,
      category: normalizeCategory(transactionData.category, transactionData.type),
    });

    return transactionId;
  },
});

export const mcpGetPlanned = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("planned"), v.literal("posted"), v.literal("skipped"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    const rows = await ctx.db
      .query("planned")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();

    if (args.status) {
      return rows.filter((r) => (r.status ?? "planned") === args.status);
    }
    return rows;
  },
});

export const mcpAddPlanned = mutation({
  args: {
    token: v.string(),
    amount: v.union(v.number(), v.string()),
    currency: v.optional(v.string()),
    rateToUSD: v.optional(v.number()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(),
    date: v.number(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    assertTextFields(args.amount, args.description, args.category, args.currency);
    const { token, ...data } = args;

    return await ctx.db.insert("planned", {
      userId,
      status: "planned",
      ...data,
      category: normalizeCategory(data.category, data.type),
    });
  },
});

export const mcpGetRecurring = query({
  args: {
    token: v.string(),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    const items = await ctx.db
      .query("recurring")
      .withIndex("by_user_startDate", (q) => q.eq("userId", userId))
      .collect();

    if (args.activeOnly) {
      return items.filter((r) => r.active !== false);
    }
    return items;
  },
});

export const mcpAddRecurring = mutation({
  args: {
    token: v.string(),
    amount: v.union(v.number(), v.string()),
    currency: v.optional(v.string()),
    rateToUSD: v.optional(v.number()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(),
    startDate: v.number(),
    cadence: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    assertTextFields(args.amount, args.description, args.category, args.currency);
    const { token, ...data } = args;

    return await ctx.db.insert("recurring", {
      userId,
      active: true,
      ...data,
      category: normalizeCategory(data.category, data.type),
    });
  },
});

export const mcpGetCategoryRules = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    return await ctx.db
      .query("categoryRules")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const mcpGetCategoryBudgets = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    return await ctx.db
      .query("categoryBudgets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Sets a category's monthly limit; `remove: true` deletes it. */
export const mcpSetCategoryBudget = mutation({
  args: {
    token: v.string(),
    category: v.string(),
    limit: v.optional(v.union(v.number(), v.string())),
    currency: v.optional(v.string()),
    encrypted: v.optional(v.boolean()),
    remove: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    if (!EXPENSE_CATEGORY_VALUES.includes(args.category) || args.category === "transfer")
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: `Unknown expense category: ${args.category.slice(0, 40)}` });
    const existing = await ctx.db
      .query("categoryBudgets")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("category", args.category))
      .first();
    if (args.remove) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (args.limit === undefined || !args.currency) {
      throw new ConvexError({ code: "INVALID_ARGUMENT", message: "limit and currency are required" });
    }
    const fields = { limit: args.limit, currency: args.currency.toUpperCase(), encrypted: args.encrypted };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("categoryBudgets", { userId, category: args.category, ...fields });
  },
});

export const mcpGetBudget = query({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    return await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", args.month))
      .first();
  },
});

export const mcpSetBudget = mutation({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", args.month))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { limit: args.limit });
      return existing._id;
    } else {
      return await ctx.db.insert("budgets", {
        userId,
        month: args.month,
        limit: args.limit,
      });
    }
  },
});

export const mcpGetUserSettings = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.token);
    const settings = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      currency: settings?.currency ?? "USD",
    };
  },
});

export const mcpGetExchangeRates = query({
  args: {
    token: v.string(),
    date: v.optional(v.string()), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    await authenticateMCP(ctx, args.token);
    const targetDate = args.date ?? new Date().toISOString().split("T")[0];
    const row = await ctx.db
      .query("exchangeRates")
      .withIndex("by_date", (q) => q.eq("date", targetDate))
      .first();

    if (row) {
      return row;
    }
    // Fall back to most recent available
    const latest = await ctx.db.query("exchangeRates").order("desc").first();
    return latest ?? null;
  },
});

