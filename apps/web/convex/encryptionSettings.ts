import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

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

const MAX_ROTATION_ROWS = 6_000;
const MAX_CIPHERTEXT = 8_000;

// `prev*` is the ciphertext the client re-encrypted from. If the stored value
// differs, the row was edited mid-way and the whole change is rejected rather
// than overwriting the edit.
const reencryptedRow = {
  amount: v.string(),
  description: v.string(),
  prevAmount: v.string(),
  prevDescription: v.string(),
};

function conflict(what: string): never {
  throw new ConvexError({ code: "ROTATION_CONFLICT", message: `Your ${what} changed while re-encrypting` });
}

/**
 * Changes the passphrase atomically: every encrypted row is replaced with a
 * ciphertext under the new key in the same transaction that swaps the salt
 * and verification hash, so a failure leaves everything on the old key.
 * The client must send every encrypted row; if the counts don't match (data
 * changed mid-way) the whole change is rejected.
 *
 * Tokens and OAuth grants that carry the old key can no longer decrypt, so
 * they are revoked.
 */
export const rotate = mutation({
  args: {
    currentVerificationHash: v.string(),
    salt: v.string(),
    verificationHash: v.string(),
    transactions: v.array(v.object({ id: v.id("transactions"), ...reencryptedRow })),
    planned: v.array(v.object({ id: v.id("planned"), ...reencryptedRow })),
    recurring: v.array(v.object({ id: v.id("recurring"), ...reencryptedRow })),
    categoryBudgets: v.array(
      v.object({ id: v.id("categoryBudgets"), limit: v.string(), prevLimit: v.string() }),
    ),
    categoryRulesData: v.optional(v.string()),
    prevCategoryRulesData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userId = identity.subject;

    const settings = await ctx.db
      .query("encryption_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!settings) throw new Error("Encryption is not set up");
    if (settings.verificationHash !== args.currentVerificationHash) conflict("passphrase");

    const total =
      args.transactions.length + args.planned.length + args.recurring.length + args.categoryBudgets.length;
    if (total > MAX_ROTATION_ROWS) {
      throw new Error(`Too many records to re-encrypt at once (${total}); export a backup and contact support`);
    }

    const [transactions, planned, recurring, budgets, rules] = await Promise.all([
      ctx.db.query("transactions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("planned").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("recurring").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("categoryBudgets").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("categoryRules").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);

    const expectIds = (table: string, rows: { _id: string; encrypted?: boolean }[], sent: { id: string }[]) => {
      const owned = new Set(rows.filter((r) => r.encrypted).map((r) => r._id as string));
      const sentIds = new Set(sent.map((s) => s.id as string));
      if (owned.size !== sentIds.size || [...owned].some((id) => !sentIds.has(id))) {
        conflict(table);
      }
    };
    expectIds("transactions", transactions, args.transactions);
    expectIds("planned items", planned, args.planned);
    expectIds("recurring items", recurring, args.recurring);
    expectIds("budgets", budgets, args.categoryBudgets);
    if (rules?.encrypted && (args.categoryRulesData === undefined || args.prevCategoryRulesData !== rules.data)) {
      conflict("category rules");
    }

    const tooLong = (s: string) => s.length > MAX_CIPHERTEXT;
    const byId = new Map<string, { amount: unknown; description?: string; limit?: unknown }>(
      [...transactions, ...planned, ...recurring].map((r) => [r._id as string, r]),
    );
    for (const row of [...args.transactions, ...args.planned, ...args.recurring]) {
      const stored = byId.get(row.id);
      if (!stored || stored.amount !== row.prevAmount || stored.description !== row.prevDescription) {
        conflict("entries");
      }
      if (tooLong(row.amount) || tooLong(row.description)) throw new Error("Ciphertext too long");
      await ctx.db.patch(row.id, { amount: row.amount, description: row.description, encrypted: true });
    }
    const budgetById = new Map(budgets.map((b) => [b._id as string, b]));
    for (const row of args.categoryBudgets) {
      if (budgetById.get(row.id)?.limit !== row.prevLimit) conflict("budgets");
      if (tooLong(row.limit)) throw new Error("Ciphertext too long");
      await ctx.db.patch(row.id, { limit: row.limit, encrypted: true });
    }
    if (rules?.encrypted && args.categoryRulesData !== undefined) {
      await ctx.db.patch(rules._id, { data: args.categoryRulesData });
    }

    await ctx.db.patch(settings._id, { salt: args.salt, verificationHash: args.verificationHash });

    let revoked = 0;
    const apiTokens = await ctx.db.query("apiTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const t of apiTokens) {
      if (t.wrappedKey || t.keyB64) {
        await ctx.db.delete(t._id);
        revoked++;
      }
    }
    const grants = await ctx.db.query("oauth_tokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const g of grants) {
      await ctx.db.delete(g._id);
      revoked++;
    }
    // Codes approved just before the change carry the old key too.
    const codes = await ctx.db.query("oauth_codes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const c of codes) await ctx.db.delete(c._id);
    return { revoked };
  },
});
