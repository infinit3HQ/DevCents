import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// ─── Token Management (Used by Frontend) ────────────────────────────────

export const generateToken = mutation({
  args: {
    name: v.string(),
    tokenHash: v.string(),
    keyB64: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const tokenId = await ctx.db.insert("apiTokens", {
      userId: identity.subject,
      name: args.name,
      tokenHash: args.tokenHash,
      keyB64: args.keyB64,
      createdAt: Date.now(),
    });

    return tokenId;
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

    // Do not return the hash to the frontend for display
    return tokens.map((t) => ({
      _id: t._id,
      name: t.name,
      createdAt: t.createdAt,
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
async function authenticateMCP(ctx: QueryCtx | MutationCtx, tokenHash: string): Promise<{ userId: string; keyB64: string | null }> {
  const token = await ctx.db
    .query("apiTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (token) {
    return { userId: token.userId, keyB64: token.keyB64 ?? null };
  }

  const oauthToken = await ctx.db
    .query("oauth_tokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (oauthToken && oauthToken.expiresAt > Date.now()) {
    return { userId: oauthToken.userId, keyB64: oauthToken.keyB64 ?? null };
  }

  throw new Error("Invalid or expired API / OAuth Token");
}

export const mcpGetEncryptionSalt = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
    const settings = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!settings) throw new Error("Encryption not configured for this user");
    return settings.salt;
  },
});

export const mcpGetTokenKey = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await authenticateMCP(ctx, args.tokenHash);
    return auth.keyB64;
  },
});

export const mcpGetTransactions = query({
  args: {
    tokenHash: v.string(),
    limit: v.optional(v.number()),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);

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
        if (args.category && t.category !== args.category) return false;
        return true;
      })
      .slice(0, limit);
  },
});

export const mcpGetAllTransactions = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);

    return await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const mcpAddTransaction = mutation({
  args: {
    tokenHash: v.string(),
    amount: v.union(v.number(), v.string()),
    currency: v.optional(v.string()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(),
    date: v.number(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);

    const { tokenHash, ...transactionData } = args;

    const transactionId = await ctx.db.insert("transactions", {
      userId,
      ...transactionData,
    });

    return transactionId;
  },
});

export const mcpGetPlanned = query({
  args: {
    tokenHash: v.string(),
    status: v.optional(v.union(v.literal("planned"), v.literal("posted"), v.literal("skipped"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
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
    tokenHash: v.string(),
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
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
    const { tokenHash, ...data } = args;

    return await ctx.db.insert("planned", {
      userId,
      status: "planned",
      ...data,
    });
  },
});

export const mcpGetRecurring = query({
  args: {
    tokenHash: v.string(),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
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
    tokenHash: v.string(),
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
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
    const { tokenHash, ...data } = args;

    return await ctx.db.insert("recurring", {
      userId,
      active: true,
      ...data,
    });
  },
});

export const mcpGetBudget = query({
  args: {
    tokenHash: v.string(),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
    return await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", args.month))
      .first();
  },
});

export const mcpSetBudget = mutation({
  args: {
    tokenHash: v.string(),
    month: v.string(), // "YYYY-MM"
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
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
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await authenticateMCP(ctx, args.tokenHash);
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
    tokenHash: v.string(),
    date: v.optional(v.string()), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    await authenticateMCP(ctx, args.tokenHash);
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

