import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Full-account backup. Rows are exported exactly as stored, so encrypted
 * amounts/descriptions stay encrypted; only the user's passphrase can read
 * them. Restore is additive and skips rows that already exist, so restoring
 * the same file twice is harmless.
 */

export const exportAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userId = identity.subject;

    const [transactions, planned, recurring, occurrences, categoryBudgets, rules, encryption, settings, budgets] =
      await Promise.all([
        ctx.db.query("transactions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        ctx.db.query("planned").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        ctx.db.query("recurring").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        ctx.db.query("postedRecurringOccurrences").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        ctx.db.query("categoryBudgets").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        ctx.db.query("categoryRules").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("encryption_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("user_settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("budgets").withIndex("by_user_month", (q) => q.eq("userId", userId)).collect(),
      ]);

    return {
      transactions,
      planned,
      recurring,
      postedRecurringOccurrences: occurrences,
      categoryBudgets,
      budgets,
      categoryRules: rules ? { data: rules.data, encrypted: rules.encrypted } : null,
      encryption: encryption
        ? { salt: encryption.salt, verificationHash: encryption.verificationHash }
        : null,
      baseCurrency: settings?.currency ?? null,
    };
  },
});

type Row = Record<string, unknown>;

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

const TX_FIELDS = ["amount", "currency", "rateToUSD", "type", "category", "description", "date", "encrypted"];
const PLANNED_FIELDS = [...TX_FIELDS, "status", "postedTransactionId"];
const RECURRING_FIELDS = ["amount", "currency", "rateToUSD", "type", "category", "description", "startDate", "cadence", "active", "encrypted"];

const fingerprint = {
  transactions: (r: Row) => `${r.date}|${r.type}|${r.amount}|${r.description}`,
  planned: (r: Row) => `${r.date}|${r.type}|${r.amount}|${r.description}`,
  recurring: (r: Row) => `${r.startDate}|${r.cadence}|${r.type}|${r.amount}|${r.description}`,
  postedRecurringOccurrences: (r: Row) => `${r.recurringId}|${r.date}`,
};

async function existingByFingerprint(
  ctx: MutationCtx,
  table: keyof typeof fingerprint,
  userId: string,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(rows.map((r) => [fingerprint[table](r as unknown as Row), r._id as string]));
}

/**
 * Restores one table's rows (call in batches). `idMap` translates ids from
 * the backup to ids in this account for rows restored earlier
 * (transactions → planned.postedTransactionId, recurring → occurrences).
 * Returns the ids assigned to this batch so the caller can extend the map.
 */
export const restoreBatch = mutation({
  args: {
    table: v.union(
      v.literal("transactions"),
      v.literal("planned"),
      v.literal("recurring"),
      v.literal("postedRecurringOccurrences"),
      v.literal("categoryBudgets"),
      v.literal("budgets"),
    ),
    rows: v.array(v.any()),
    idMap: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userId = identity.subject;
    if (args.rows.length > 300) throw new Error("Maximum 300 rows per batch");
    const idMap = args.idMap ?? {};

    let inserted = 0;
    let skipped = 0;
    const assigned: Record<string, string> = {};

    if (args.table === "categoryBudgets") {
      for (const raw of args.rows as Row[]) {
        const row = pick(raw, ["category", "limit", "currency", "encrypted"]);
        const existing = await ctx.db
          .query("categoryBudgets")
          .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("category", String(row.category)))
          .first();
        if (existing) {
          skipped++;
          continue;
        }
        await ctx.db.insert("categoryBudgets", { userId, ...(row as any) });
        inserted++;
      }
      return { inserted, skipped, assigned };
    }

    if (args.table === "budgets") {
      for (const raw of args.rows as Row[]) {
        const row = pick(raw, ["month", "limit"]);
        const existing = await ctx.db
          .query("budgets")
          .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", String(row.month)))
          .first();
        if (existing) {
          skipped++;
          continue;
        }
        await ctx.db.insert("budgets", { userId, ...(row as any) });
        inserted++;
      }
      return { inserted, skipped, assigned };
    }

    const table = args.table;
    const seen = await existingByFingerprint(ctx, table, userId);
    const fields =
      table === "transactions" ? TX_FIELDS
      : table === "planned" ? PLANNED_FIELDS
      : table === "recurring" ? RECURRING_FIELDS
      : ["recurringId", "date"];

    for (const raw of args.rows as Row[]) {
      const oldId = typeof raw._id === "string" ? raw._id : null;
      const row = pick(raw, fields);

      // idMap comes from the client, so only accept ids the caller owns.
      if (table === "planned" && row.postedTransactionId) {
        const id = ctx.db.normalizeId("transactions", idMap[String(row.postedTransactionId)] ?? "");
        const tx = id ? await ctx.db.get(id) : null;
        if (tx && tx.userId === userId) row.postedTransactionId = id;
        else delete row.postedTransactionId;
      }
      if (table === "postedRecurringOccurrences") {
        const id = ctx.db.normalizeId("recurring", idMap[String(row.recurringId)] ?? "");
        const rec = id ? await ctx.db.get(id) : null;
        if (!rec || rec.userId !== userId) {
          skipped++;
          continue;
        }
        row.recurringId = id;
      }

      const fp = fingerprint[table](row);
      const existingId = seen.get(fp);
      if (existingId) {
        if (oldId) assigned[oldId] = existingId;
        skipped++;
        continue;
      }
      const newId = await ctx.db.insert(table, { userId, ...(row as any) });
      seen.set(fp, newId);
      if (oldId) assigned[oldId] = newId;
      inserted++;
    }
    return { inserted, skipped, assigned };
  },
});
