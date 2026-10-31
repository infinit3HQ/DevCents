import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Upper bound for the rules blob (500 rules ≈ 40 KB of JSON, more once
// encrypted and base64-encoded).
const MAX_RULES_BYTES = 200_000;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("categoryRules")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
  },
});

export const save = mutation({
  args: {
    data: v.string(),
    encrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (args.data.length > MAX_RULES_BYTES) throw new Error("Category rules too large");

    const existing = await ctx.db
      .query("categoryRules")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data, encrypted: args.encrypted });
    } else {
      await ctx.db.insert("categoryRules", {
        userId: identity.subject,
        data: args.data,
        encrypted: args.encrypted,
      });
    }
  },
});
