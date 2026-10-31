import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { EXPENSE_CATEGORY_VALUES } from "@devcents/shared/categories";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("categoryBudgets")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

export const set = mutation({
  args: {
    category: v.string(),
    limit: v.union(v.number(), v.string()),
    currency: v.string(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!EXPENSE_CATEGORY_VALUES.includes(args.category) || args.category === "transfer")
      throw new Error(`Unknown expense category: ${args.category}`);
    if (typeof args.limit === "number" && !(args.limit > 0))
      throw new Error("Budget must be greater than zero");

    const existing = await ctx.db
      .query("categoryBudgets")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", identity.subject).eq("category", args.category),
      )
      .first();

    const fields = {
      limit: args.limit,
      currency: args.currency.toUpperCase(),
      encrypted: args.encrypted,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("categoryBudgets", {
      userId: identity.subject,
      category: args.category,
      ...fields,
    });
  },
});

export const remove = mutation({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("categoryBudgets")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", identity.subject).eq("category", args.category),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
