import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("planned")
      .withIndex("by_user_date", (q) => q.eq("userId", identity.subject))
      .order("asc")
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

    await ctx.db.insert("planned", {
      userId: identity.subject,
      status: "planned",
      ...args,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("planned"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.delete(args.id);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("planned"),
    status: v.union(
      v.literal("planned"),
      v.literal("posted"),
      v.literal("skipped"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const postToLedger = mutation({
  args: {
    id: v.id("planned"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");
    if (item.status === "posted") return;

    const transactionId = (await ctx.db.insert("transactions", {
      userId: identity.subject,
      amount: item.amount,
      currency: item.currency,
      type: item.type,
      category: item.category,
      description: item.description,
      date: item.date,
      encrypted: item.encrypted,
    })) as Id<"transactions">;

    await ctx.db.patch(args.id, {
      status: "posted",
      postedTransactionId: transactionId,
    });
  },
});

