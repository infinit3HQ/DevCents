import { decrypt, encrypt } from "@devcents/shared";
import type { Id } from "../../convex/_generated/dataModel";

type EncryptedTable = "transactions" | "planned" | "recurring";
type Row<T extends EncryptedTable> = {
  _id: Id<T>;
  amount: number | string;
  description: string;
  encrypted?: boolean;
};
type BudgetRow = { _id: Id<"categoryBudgets">; limit: number | string; encrypted?: boolean };

export type ExportedData = {
  transactions: Row<"transactions">[];
  planned: Row<"planned">[];
  recurring: Row<"recurring">[];
  categoryBudgets: BudgetRow[];
  categoryRules: { data: string; encrypted?: boolean } | null;
};

/** Rows that could not be decrypted with the current key. */
export class UndecryptableRowsError extends Error {
  constructor(readonly ids: string[]) {
    super(`${ids.length} record(s) can't be decrypted with your current passphrase`);
  }
}

type Recrypt = (value: string, id: string) => Promise<string>;

function makeRecrypt(oldKey: CryptoKey, newKey: CryptoKey, failed: Set<string>): Recrypt {
  return async (value, id) => {
    try {
      return await encrypt(await decrypt(value, oldKey), newKey);
    } catch {
      failed.add(id);
      return "";
    }
  };
}

async function recryptRows<T extends EncryptedTable>(rows: Row<T>[], recrypt: Recrypt) {
  const encrypted = rows.filter((r) => r.encrypted);
  return Promise.all(
    encrypted.map(async (r) => ({
      id: r._id,
      amount: await recrypt(String(r.amount), r._id),
      description: await recrypt(r.description, r._id),
      prevAmount: String(r.amount),
      prevDescription: r.description,
    })),
  );
}

/**
 * Re-encrypts every encrypted field from `oldKey` to `newKey`. Throws
 * {@link UndecryptableRowsError} listing every row that can't be decrypted,
 * so nothing is sent until the user has dealt with them.
 */
export async function buildRotationPayload(data: ExportedData, oldKey: CryptoKey, newKey: CryptoKey) {
  const failed = new Set<string>();
  const recrypt = makeRecrypt(oldKey, newKey, failed);
  const budgets = await Promise.all(
    data.categoryBudgets
      .filter((b) => b.encrypted)
      .map(async (b) => ({
        id: b._id,
        limit: await recrypt(String(b.limit), b._id),
        prevLimit: String(b.limit),
      })),
  );
  const rules = data.categoryRules;
  const payload = {
    transactions: await recryptRows(data.transactions, recrypt),
    planned: await recryptRows(data.planned, recrypt),
    recurring: await recryptRows(data.recurring, recrypt),
    categoryBudgets: budgets,
    categoryRulesData: rules?.encrypted ? await recrypt(rules.data, "category rules") : undefined,
    prevCategoryRulesData: rules?.encrypted ? rules.data : undefined,
  };
  if (failed.size > 0) throw new UndecryptableRowsError([...failed]);
  return payload;
}
