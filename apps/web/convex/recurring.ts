import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("recurring")
      .withIndex("by_user_startDate", (q) => q.eq("userId", identity.subject))
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    await ctx.db.insert("recurring", {
      userId: identity.subject,
      active: true,
      ...args,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("recurring"),
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

export const update = mutation({
  args: {
    id: v.id("recurring"),
    amount: v.optional(v.union(v.number(), v.string())),
    currency: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.number()),
    cadence: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("yearly"),
      ),
    ),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");

    const { id, ...fields } = args;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
  },
});

export const toggleActive = mutation({
  args: {
    id: v.id("recurring"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { active: args.active });
  },
});

export const postOccurrenceToLedger = mutation({
  args: {
    id: v.id("recurring"),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Not found");
    if (item.userId !== identity.subject) throw new Error("Unauthorized");

    // Check if this occurrence was already posted to prevent duplicates.
    const existing = await ctx.db
      .query("postedRecurringOccurrences")
      .withIndex("by_recurring_date", (q) =>
        q.eq("recurringId", args.id).eq("date", args.date),
      )
      .first();
    if (existing) return;

    await ctx.db.insert("transactions", {
      userId: identity.subject,
      amount: item.amount,
      currency: item.currency,
      type: item.type,
      category: item.category,
      description: item.description,
      date: args.date,
      encrypted: item.encrypted,
    });

    await ctx.db.insert("postedRecurringOccurrences", {
      userId: identity.subject,
      recurringId: args.id,
      date: args.date,
    });
  },
});


export const getPostedOccurrences = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("postedRecurringOccurrences")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});
