import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

export const getRates = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("exchangeRates")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();
  },
});

export const saveRates = mutation({
  args: {
    date: v.string(),
    base: v.string(),
    rates: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("exchangeRates")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        base: args.base,
        rates: args.rates,
      });
      return existing._id;
    }

    return await ctx.db.insert("exchangeRates", {
      date: args.date,
      base: args.base,
      rates: args.rates,
    });
  },
});

export const fetchAndSaveRates = action({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(
        `https://api.fxratesapi.com/historical?date=${args.date}`,
      );
      const data = await response.json();

      if (data && data.rates) {
        await ctx.runMutation(api.exchangeRates.saveRates, {
          date: args.date,
          base: data.base || "USD",
          rates: data.rates,
        });
        return data.rates;
      }
      throw new Error("Failed to fetch rates from API");
    } catch (err) {
      console.error("Error fetching historical rates:", err);
      throw err;
    }
  },
});
