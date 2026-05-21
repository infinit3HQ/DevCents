// One-shot migration helpers introduced after the historical-exchange-rates
// feature was reverted. They strip the now-unused `exchangeRate` and
// `baseCurrencyAtTime` fields from existing documents and clear the
// `exchangeRates` table so the schema can be safely pruned afterwards.
//
// USAGE (self-hosted Convex):
//
//   # 1. Inspect — see what will be touched.
//   npx convex run cleanup:inspect \
//     --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"
//
//   # 2. Strip the locked-rate fields from transactions / planned / recurring.
//   npx convex run cleanup:stripLockedRates \
//     --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"
//
//   # 3. Empty the exchangeRates cache table.
//   npx convex run cleanup:clearExchangeRates \
//     --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"
//
//   # 4. Inspect again — every count should be zero.
//
// After all counts are zero, you can safely apply the Phase 2 schema/code
// cleanup and delete this file.

import { internalMutation, internalQuery } from "./_generated/server";

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").collect();
    const planned = await ctx.db.query("planned").collect();
    const recurring = await ctx.db.query("recurring").collect();
    const exchangeRates = await ctx.db.query("exchangeRates").collect();

    const hasLocked = (
      d: { exchangeRate?: number; baseCurrencyAtTime?: string },
    ) => d.exchangeRate !== undefined || d.baseCurrencyAtTime !== undefined;

    return {
      transactions: {
        total: transactions.length,
        withLockedRate: transactions.filter(hasLocked).length,
      },
      planned: {
        total: planned.length,
        withLockedRate: planned.filter(hasLocked).length,
      },
      recurring: {
        total: recurring.length,
        withLockedRate: recurring.filter(hasLocked).length,
      },
      exchangeRatesRows: exchangeRates.length,
    };
  },
});

export const stripLockedRates = internalMutation({
  args: {},
  handler: async (ctx) => {
    let transactionsPatched = 0;
    let plannedPatched = 0;
    let recurringPatched = 0;

    const transactions = await ctx.db.query("transactions").collect();
    for (const doc of transactions) {
      if (doc.exchangeRate !== undefined || doc.baseCurrencyAtTime !== undefined) {
        await ctx.db.patch(doc._id, {
          exchangeRate: undefined,
          baseCurrencyAtTime: undefined,
        });
        transactionsPatched++;
      }
    }

    const planned = await ctx.db.query("planned").collect();
    for (const doc of planned) {
      if (doc.exchangeRate !== undefined || doc.baseCurrencyAtTime !== undefined) {
        await ctx.db.patch(doc._id, {
          exchangeRate: undefined,
          baseCurrencyAtTime: undefined,
        });
        plannedPatched++;
      }
    }

    const recurring = await ctx.db.query("recurring").collect();
    for (const doc of recurring) {
      if (doc.exchangeRate !== undefined || doc.baseCurrencyAtTime !== undefined) {
        await ctx.db.patch(doc._id, {
          exchangeRate: undefined,
          baseCurrencyAtTime: undefined,
        });
        recurringPatched++;
      }
    }

    return {
      transactionsScanned: transactions.length,
      transactionsPatched,
      plannedScanned: planned.length,
      plannedPatched,
      recurringScanned: recurring.length,
      recurringPatched,
    };
  },
});

export const clearExchangeRates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("exchangeRates").collect();
    for (const doc of all) {
      await ctx.db.delete(doc._id);
    }
    return { deleted: all.length };
  },
});
