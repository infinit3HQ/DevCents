import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// ─── Token Management (Used by Frontend) ────────────────────────────────

export const generateToken = mutation({
  args: {
    name: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const tokenId = await ctx.db.insert("apiTokens", {
      userId: identity.subject,
      name: args.name,
      tokenHash: args.tokenHash,
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
 */
async function authenticateMCP(ctx: QueryCtx | MutationCtx, tokenHash: string) {
  const token = await ctx.db
    .query("apiTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!token) {
    throw new Error("Invalid API Token");
  }

  return token.userId;
}

export const mcpGetEncryptionSalt = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await authenticateMCP(ctx, args.tokenHash);
    const settings = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!settings) throw new Error("Encryption not configured for this user");
    return settings.salt;
  },
});

export const mcpGetTransactions = query({
  args: {
    tokenHash: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await authenticateMCP(ctx, args.tokenHash);

    const limit = Math.min(args.limit ?? 50, 500);

    return await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
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
    const userId = await authenticateMCP(ctx, args.tokenHash);

    const { tokenHash, ...transactionData } = args;

    const transactionId = await ctx.db.insert("transactions", {
      userId,
      ...transactionData,
    });

    return transactionId;
  },
});
