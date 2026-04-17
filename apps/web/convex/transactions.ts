import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    amount: v.union(v.number(), v.string()),
    currency: v.optional(v.string()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(),
    date: v.number(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    await ctx.db.insert("transactions", {
      userId: identity.subject,
      ...args,
    });
  },
});

export const createMany = mutation({
  args: {
    transactions: v.array(
      v.object({
        amount: v.union(v.number(), v.string()),
        currency: v.optional(v.string()),
        type: v.union(v.literal("income"), v.literal("expense")),
        category: v.string(),
        description: v.string(),
        date: v.number(),
        encrypted: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    if (args.transactions.length > 100) {
      throw new Error("Maximum 100 transactions per batch");
    }

    for (const tx of args.transactions) {
      await ctx.db.insert("transactions", {
        userId: identity.subject,
        ...tx,
      });
    }
  },
});

export const update = mutation({
  args: {
    id: v.id("transactions"),
    amount: v.optional(v.union(v.number(), v.string())),
    currency: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const transaction = await ctx.db.get(args.id);
    if (!transaction) throw new Error("Not found");
    if (transaction.userId !== identity.subject)
      throw new Error("Unauthorized");

    const { id, ...fields } = args;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: {
    id: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const transaction = await ctx.db.get(args.id);
    if (!transaction) throw new Error("Not found");
    if (transaction.userId !== identity.subject)
      throw new Error("Unauthorized");

    await ctx.db.delete(args.id);
  },
});
