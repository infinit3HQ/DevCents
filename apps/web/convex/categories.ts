import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeCategory } from "@devcents/shared/categories";

/**
 * One-off cleanup: rewrites legacy free-text categories ("Food and Dining",
 * "Utilities & Bills") to canonical slugs across transactions, planned and
 * recurring. The UI already normalizes on read, so this only tidies storage.
 *
 * Preview:  npx convex run categories:normalizeStored
 * Apply:    npx convex run categories:normalizeStored '{"dryRun": false}'
 */
export const normalizeStored = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;
    const mapping: Record<string, { to: string; count: number }> = {};
    let changed = 0;

    for (const table of ["transactions", "planned", "recurring"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        const next = normalizeCategory(row.category, row.type);
        if (next === row.category) continue;
        const k = `${row.type}:${row.category}`;
        mapping[k] = { to: next, count: (mapping[k]?.count ?? 0) + 1 };
        changed++;
        if (!dryRun) await ctx.db.patch(row._id, { category: next });
      }
    }

    return { dryRun, changed, mapping };
  },
});
