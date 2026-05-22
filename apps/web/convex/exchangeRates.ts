// Historical and current exchange-rate fetcher + cache.
//
// Rates are stored USD-relative (the fxratesapi default) so any pair can be
// derived: amountInUSD = amountInX / rates[X];  amountInY = amountInUSD * rates[Y].
// Rows are keyed by "YYYY-MM-DD" and immutable once written — historical rates
// don't change.
//
// Public surface:
//   getCachedRates(date)        - query, returns the cached snapshot or null.
//   fetchAndCacheRates(date)    - action, fetches from fxratesapi if missing
//                                  and caches; throws on failure.
//   getRateToUSD(date, ccy)     - action, returns a single number for the
//                                  rate from ccy -> USD on `date`. Used by
//                                  AddTransaction to lock a rate at save time.

import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

type RatesMap = Record<string, number>;

function normaliseRates(raw: unknown): RatesMap {
  const out: RatesMap = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && isFinite(v) && v > 0) out[k] = v;
    }
  }
  // The API often omits USD from rates when base is USD. Force it.
  if (!out.USD) out.USD = 1;
  return out;
}

export const getCachedRates = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const row = await ctx.db
      .query("exchangeRates")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    return row ? { date: row.date, base: row.base, rates: row.rates as RatesMap } : null;
  },
});

export const saveRates = internalMutation({
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
      await ctx.db.patch(existing._id, { base: args.base, rates: args.rates });
      return existing._id;
    }
    return await ctx.db.insert("exchangeRates", {
      date: args.date,
      base: args.base,
      rates: args.rates,
    });
  },
});

async function fetchFromApi(date: string): Promise<RatesMap> {
  // Today's date should hit /latest; older dates hit /historical.
  const today = new Date().toISOString().slice(0, 10);
  const url =
    date >= today
      ? "https://api.fxratesapi.com/latest"
      : `https://api.fxratesapi.com/historical?date=${encodeURIComponent(date)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fxratesapi ${res.status} for date=${date}`);
  }
  const data = (await res.json()) as { rates?: unknown; success?: boolean };
  if (!data || !data.rates) {
    throw new Error(`fxratesapi returned no rates for date=${date}`);
  }
  const rates = normaliseRates(data.rates);
  if (Object.keys(rates).length < 2) {
    throw new Error(`fxratesapi returned empty rates for date=${date}`);
  }
  return rates;
}

export const fetchAndCacheRates = action({
  args: { date: v.string() },
  handler: async (ctx, { date }): Promise<RatesMap> => {
    // Fast path: already cached.
    const cached = await ctx.runQuery(api.exchangeRates.getCachedRates, { date });
    if (cached) return cached.rates;

    const rates = await fetchFromApi(date);
    await ctx.runMutation(internal.exchangeRates.saveRates, {
      date,
      base: "USD",
      rates,
    });
    return rates;
  },
});

export const getRateToUSD = action({
  args: { date: v.string(), currency: v.string() },
  handler: async (ctx, { date, currency }): Promise<number> => {
    if (currency === "USD") return 1;
    const rates: RatesMap = await ctx.runAction(
      api.exchangeRates.fetchAndCacheRates,
      { date },
    );
    const rate = rates[currency];
    if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) {
      throw new Error(`No rate for ${currency} on ${date}`);
    }
    // rate is X per USD (i.e. 1 USD = `rate` units of X).
    // We want X -> USD, which is 1/rate.
    return 1 / rate;
  },
});
