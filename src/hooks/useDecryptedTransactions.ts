import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useState, useEffect } from "react";

export interface DecryptedTransaction {
  _id: string;
  _creationTime: number;
  userId: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  description: string;
  date: number;
  encrypted?: boolean;
}

export function useDecryptedTransactions() {
  const rawTransactions = useQuery(api.transactions.get);
  const { isUnlocked, decryptValue, isEnabled } = useEncryption();
  const [decrypted, setDecrypted] = useState<
    DecryptedTransaction[] | undefined
  >(undefined);

  useEffect(() => {
    if (!rawTransactions) {
      setDecrypted(undefined);
      return;
    }

    if (rawTransactions.length === 0) {
      setDecrypted([]);
      return;
    }

    // If no encryption or not unlocked, return raw data with amount coerced to number
    if (!isEnabled || !isUnlocked) {
      const result = rawTransactions.map((t) => ({
        ...t,
        _id: t._id as string,
        amount: typeof t.amount === "number" ? t.amount : 0,
        type: t.type as "income" | "expense",
      }));
      setDecrypted(result);
      return;
    }

    // Decrypt encrypted transactions
    let cancelled = false;

    async function decryptAll() {
      const results: DecryptedTransaction[] = [];

      for (const t of rawTransactions!) {
        if (cancelled) return;

        if (t.encrypted) {
          try {
            const [decDescription, decAmount] = await Promise.all([
              decryptValue(t.description),
              typeof t.amount === "string"
                ? decryptValue(t.amount)
                : Promise.resolve(String(t.amount)),
            ]);

            results.push({
              ...t,
              _id: t._id as string,
              description: decDescription,
              amount: parseFloat(decAmount) || 0,
              type: t.type as "income" | "expense",
            });
          } catch {
            // If decryption fails, show raw data
            results.push({
              ...t,
              _id: t._id as string,
              amount: typeof t.amount === "number" ? t.amount : 0,
              type: t.type as "income" | "expense",
            });
          }
        } else {
          // Unencrypted transaction
          results.push({
            ...t,
            _id: t._id as string,
            amount: typeof t.amount === "number" ? t.amount : 0,
            type: t.type as "income" | "expense",
          });
        }
      }

      if (!cancelled) {
        setDecrypted(results);
      }
    }

    decryptAll();

    return () => {
      cancelled = true;
    };
  }, [rawTransactions, isUnlocked, isEnabled, decryptValue]);

  return decrypted;
}
