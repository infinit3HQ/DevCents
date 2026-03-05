import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const settings = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    return settings;
  },
});

export const setup = mutation({
  args: {
    salt: v.string(),
    verificationHash: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check if already exists
    const existing = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (existing) {
      throw new Error(
        "Encryption already configured. Use reset to change passphrase.",
      );
    }

    await ctx.db.insert("encryption_settings", {
      userId: identity.subject,
      salt: args.salt,
      verificationHash: args.verificationHash,
    });
  },
});
