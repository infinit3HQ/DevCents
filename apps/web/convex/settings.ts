import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCurrency = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return "USD";

    const settings = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    return settings?.currency || "USD";
  },
});

export const setCurrency = mutation({
  args: {
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { currency: args.currency });
    } else {
      await ctx.db.insert("user_settings", {
        userId: identity.subject,
        currency: args.currency,
      });
    }
  },
});
