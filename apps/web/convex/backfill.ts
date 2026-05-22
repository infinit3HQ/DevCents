// One-shot backfill that stamps `rateToUSD` on existing transactions /
// planned / recurring rows that don't have it yet.
//
// Encryption-safe: only `date` and `currency` are read (both plaintext) and
// only the new `rateToUSD` field is written. Encrypted amounts and
// descriptions are never touched.
//
// USAGE (via .github/workflows/backfill-rates.yml or local CLI):
//   npx convex run backfill:inspect ...      → counts what's missing
//   npx convex run backfill:run ...          → fetches historical rate per
//                                              row and patches it in
//
// Idempotent: re-running after success is a no-op (every row already has
// rateToUSD so nothing matches the missing filter).
//
// This file will be removed once Stage B's dashboard ships and we've
// verified prod data is fully stamped.

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => {
    const txns = await ctx.db.query("transactions").collect();
    const planned = await ctx.db.query("planned").collect();
    const recurring = await ctx.db.query("recurring").collect();

    const missing = <T extends { rateToUSD?: number }>(rows: T[]) =>
      rows.filter((r) => r.rateToUSD === undefined).length;

    const byCurrency = <T extends { rateToUSD?: number; currency?: string }>(
      rows: T[],
    ) => {
      const out: Record<string, { total: number; missing: number }> = {};
      for (const r of rows) {
        const ccy = r.currency ?? "(none)";
        if (!out[ccy]) out[ccy] = { total: 0, missing: 0 };
        out[ccy].total++;
        if (r.rateToUSD === undefined) out[ccy].missing++;
      }
      return out;
    };

    return {
      transactions: {
        total: txns.length,
        missing: missing(txns),
        byCurrency: byCurrency(txns),
      },
      planned: {
        total: planned.length,
        missing: missing(planned),
        byCurrency: byCurrency(planned),
      },
      recurring: {
        total: recurring.length,
        missing: missing(recurring),
        byCurrency: byCurrency(recurring),
      },
    };
  },
});

// ── Listing helpers (read-only) ────────────────────────────────────────────

export const listMissingTransactions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("transactions").collect();
    return rows
      .filter((r) => r.rateToUSD === undefined)
      .map((r) => ({
        _id: r._id,
        date: r.date,
        currency: r.currency ?? "USD",
      }));
  },
});

export const listMissingPlanned = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("planned").collect();
    return rows
      .filter((r) => r.rateToUSD === undefined)
      .map((r) => ({
        _id: r._id,
        date: r.date,
        currency: r.currency ?? "USD",
      }));
  },
});

export const listMissingRecurring = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("recurring").collect();
    return rows
      .filter((r) => r.rateToUSD === undefined)
      .map((r) => ({
        _id: r._id,
        date: r.startDate,
        currency: r.currency ?? "USD",
      }));
  },
});

// ── Per-row patch mutations ────────────────────────────────────────────────

export const patchTransactionRate = internalMutation({
  args: { id: v.id("transactions"), rateToUSD: v.number() },
  handler: async (ctx, { id, rateToUSD }) => {
    await ctx.db.patch(id, { rateToUSD });
  },
});

export const patchPlannedRate = internalMutation({
  args: { id: v.id("planned"), rateToUSD: v.number() },
  handler: async (ctx, { id, rateToUSD }) => {
    await ctx.db.patch(id, { rateToUSD });
  },
});

export const patchRecurringRate = internalMutation({
  args: { id: v.id("recurring"), rateToUSD: v.number() },
  handler: async (ctx, { id, rateToUSD }) => {
    await ctx.db.patch(id, { rateToUSD });
  },
});

// ── Top-level runner ───────────────────────────────────────────────────────

type Outcome = {
  scanned: number;
  patched: number;
  errors: { id: string; reason: string }[];
};

export const run = action({
  args: {},
  handler: async (ctx) => {
    const stats: {
      transactions: Outcome;
      planned: Outcome;
      recurring: Outcome;
    } = {
      transactions: { scanned: 0, patched: 0, errors: [] },
      planned: { scanned: 0, patched: 0, errors: [] },
      recurring: { scanned: 0, patched: 0, errors: [] },
    };

    // 1. Transactions
    const txns: {
      _id: string;
      date: number;
      currency: string;
    }[] = await ctx.runQuery(internal.backfill.listMissingTransactions);
    stats.transactions.scanned = txns.length;
    for (const t of txns) {
      try {
        const rate: number = await ctx.runAction(
          api.exchangeRates.getRateToUSD,
          { date: isoDate(t.date), currency: t.currency },
        );
        await ctx.runMutation(internal.backfill.patchTransactionRate, {
          id: t._id as any,
          rateToUSD: rate,
        });
        stats.transactions.patched++;
      } catch (err) {
        stats.transactions.errors.push({
          id: String(t._id),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Planned
    const planned: {
      _id: string;
      date: number;
      currency: string;
    }[] = await ctx.runQuery(internal.backfill.listMissingPlanned);
    stats.planned.scanned = planned.length;
    for (const p of planned) {
      try {
        const rate: number = await ctx.runAction(
          api.exchangeRates.getRateToUSD,
          { date: isoDate(p.date), currency: p.currency },
        );
        await ctx.runMutation(internal.backfill.patchPlannedRate, {
          id: p._id as any,
          rateToUSD: rate,
        });
        stats.planned.patched++;
      } catch (err) {
        stats.planned.errors.push({
          id: String(p._id),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Recurring (uses startDate)
    const recurring: {
      _id: string;
      date: number;
      currency: string;
    }[] = await ctx.runQuery(internal.backfill.listMissingRecurring);
    stats.recurring.scanned = recurring.length;
    for (const r of recurring) {
      try {
        const rate: number = await ctx.runAction(
          api.exchangeRates.getRateToUSD,
          { date: isoDate(r.date), currency: r.currency },
        );
        await ctx.runMutation(internal.backfill.patchRecurringRate, {
          id: r._id as any,
          rateToUSD: rate,
        });
        stats.recurring.patched++;
      } catch (err) {
        stats.recurring.errors.push({
          id: String(r._id),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return stats;
  },
});
