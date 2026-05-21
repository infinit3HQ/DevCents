// Temporary diagnostic helpers for the "income total looks wrong" issue.
// Read-only. Will be removed once the discrepancy is understood.
//
// USAGE (self-hosted Convex, via Actions workflow or local CLI):
//   npx convex run audit:incomeBreakdown --url ... --admin-key ...
//   npx convex run audit:incomeRows      --url ... --admin-key ...

import { internalQuery } from "./_generated/server";

type Row = {
  _id: string;
  _creationTime: number;
  date: number;
  currency: string | null;
  type: "income" | "expense";
  category: string;
  encrypted: boolean;
  // amount is either a number (plaintext) or an encrypted string —
  // we expose the shape (and a numeric value if not encrypted) so we
  // can spot duplicates / unexpected entries without needing the
  // user's passphrase.
  amountIsEncrypted: boolean;
  amountNumeric: number | null;
  amountEncryptedPreview: string | null;
};

function projectRow(t: {
  _id: string;
  _creationTime: number;
  date: number;
  currency?: string;
  type: "income" | "expense";
  category: string;
  encrypted?: boolean;
  amount: number | string;
}): Row {
  const amountIsEncrypted = typeof t.amount === "string";
  return {
    _id: t._id,
    _creationTime: t._creationTime,
    date: t.date,
    currency: t.currency ?? null,
    type: t.type,
    category: t.category,
    encrypted: t.encrypted === true,
    amountIsEncrypted,
    amountNumeric: amountIsEncrypted ? null : (t.amount as number),
    amountEncryptedPreview: amountIsEncrypted
      ? `${(t.amount as string).slice(0, 12)}...(len=${(t.amount as string).length})`
      : null,
  };
}

export const incomeBreakdown = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("transactions").collect();
    const incomes = all.filter((t) => t.type === "income");

    const byCurrency: Record<
      string,
      { count: number; plaintextSum: number; encryptedCount: number }
    > = {};
    for (const t of incomes) {
      const ccy = t.currency ?? "(none)";
      if (!byCurrency[ccy])
        byCurrency[ccy] = { count: 0, plaintextSum: 0, encryptedCount: 0 };
      byCurrency[ccy].count++;
      if (typeof t.amount === "number") byCurrency[ccy].plaintextSum += t.amount;
      else byCurrency[ccy].encryptedCount++;
    }

    const byCategory: Record<string, number> = {};
    for (const t of incomes) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    }

    const sortedDates = incomes.map((t) => t.date).sort((a, b) => a - b);
    return {
      totalTransactions: all.length,
      incomeCount: incomes.length,
      expenseCount: all.length - incomes.length,
      byCurrency,
      byCategory,
      earliestIncome:
        sortedDates.length > 0
          ? new Date(sortedDates[0]).toISOString()
          : null,
      latestIncome:
        sortedDates.length > 0
          ? new Date(sortedDates[sortedDates.length - 1]).toISOString()
          : null,
    };
  },
});

export const incomeRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("transactions").collect();
    const incomes = all
      .filter((t) => t.type === "income")
      .map((t) => projectRow(t))
      .sort((a, b) => b.date - a.date)
      .map((r) => ({
        ...r,
        date: new Date(r.date).toISOString().slice(0, 10),
        _creationTime: new Date(r._creationTime).toISOString(),
      }));
    return { count: incomes.length, rows: incomes };
  },
});
