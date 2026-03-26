import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useEffect, useState } from "react";

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "yearly";

export interface DecryptedRecurringItem {
  _id: string;
  _creationTime: number;
  userId: string;
  amount: number;
  currency?: string;
  type: "income" | "expense";
  category: string;
  description: string;
  startDate: number;
  cadence: RecurringCadence;
  active?: boolean;
  encrypted?: boolean;
}

export function useDecryptedRecurring() {
  const raw = useQuery(api.recurring.get);
  const { isUnlocked, decryptValue, isEnabled } = useEncryption();
  const [decrypted, setDecrypted] = useState<
    DecryptedRecurringItem[] | undefined
  >(undefined);

  useEffect(() => {
    if (!raw) {
      setDecrypted(undefined);
      return;
    }
    if (raw.length === 0) {
      setDecrypted([]);
      return;
    }

    if (!isEnabled || !isUnlocked) {
      setDecrypted(
        raw.map((r) => ({
          ...r,
          _id: r._id as string,
          amount: typeof r.amount === "number" ? r.amount : 0,
          type: r.type as "income" | "expense",
          cadence: r.cadence as RecurringCadence,
          active: (r.active as boolean | undefined) ?? true,
        })),
      );
      return;
    }

    let cancelled = false;

    async function decryptAll() {
      const results: DecryptedRecurringItem[] = [];
      for (const r of raw!) {
        if (cancelled) return;

        if (r.encrypted) {
          try {
            const [decDescription, decAmount] = await Promise.all([
              decryptValue(r.description),
              typeof r.amount === "string"
                ? decryptValue(r.amount)
                : Promise.resolve(String(r.amount)),
            ]);

            results.push({
              ...r,
              _id: r._id as string,
              description: decDescription,
              amount: parseFloat(decAmount) || 0,
              type: r.type as "income" | "expense",
              cadence: r.cadence as RecurringCadence,
              active: (r.active as boolean | undefined) ?? true,
            });
          } catch {
            results.push({
              ...r,
              _id: r._id as string,
              amount: typeof r.amount === "number" ? r.amount : 0,
              type: r.type as "income" | "expense",
              cadence: r.cadence as RecurringCadence,
              active: (r.active as boolean | undefined) ?? true,
            });
          }
        } else {
          results.push({
            ...r,
            _id: r._id as string,
            amount: typeof r.amount === "number" ? r.amount : 0,
            type: r.type as "income" | "expense",
            cadence: r.cadence as RecurringCadence,
            active: (r.active as boolean | undefined) ?? true,
          });
        }
      }

      if (!cancelled) setDecrypted(results);
    }

    decryptAll();
    return () => {
      cancelled = true;
    };
  }, [raw, isUnlocked, isEnabled, decryptValue]);

  return decrypted;
}

