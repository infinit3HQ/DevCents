import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useEffect, useState } from "react";

export interface DecryptedPlannedItem {
  _id: string;
  _creationTime: number;
  userId: string;
  amount: number;
  currency?: string;
  type: "income" | "expense";
  category: string;
  description: string;
  date: number;
  status?: "planned" | "posted" | "skipped";
  postedTransactionId?: string;
  encrypted?: boolean;
}

export function useDecryptedPlanned() {
  const raw = useQuery(api.planned.get);
  const { isUnlocked, decryptValue, isEnabled } = useEncryption();
  const [decrypted, setDecrypted] = useState<
    DecryptedPlannedItem[] | undefined
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
        raw.map((p) => ({
          ...p,
          _id: p._id as string,
          amount: typeof p.amount === "number" ? p.amount : 0,
          type: p.type as "income" | "expense",
          status: (p.status as "planned" | "posted" | "skipped") ?? "planned",
          postedTransactionId: p.postedTransactionId as unknown as
            | string
            | undefined,
        })),
      );
      return;
    }

    let cancelled = false;

    async function decryptAll() {
      const results: DecryptedPlannedItem[] = [];
      for (const p of raw!) {
        if (cancelled) return;

        if (p.encrypted) {
          try {
            const [decDescription, decAmount] = await Promise.all([
              decryptValue(p.description),
              typeof p.amount === "string"
                ? decryptValue(p.amount)
                : Promise.resolve(String(p.amount)),
            ]);

            results.push({
              ...p,
              _id: p._id as string,
              description: decDescription,
              amount: parseFloat(decAmount) || 0,
              type: p.type as "income" | "expense",
              status:
                (p.status as "planned" | "posted" | "skipped") ?? "planned",
              postedTransactionId: p.postedTransactionId as unknown as
                | string
                | undefined,
            });
          } catch {
            results.push({
              ...p,
              _id: p._id as string,
              amount: typeof p.amount === "number" ? p.amount : 0,
              type: p.type as "income" | "expense",
              status:
                (p.status as "planned" | "posted" | "skipped") ?? "planned",
              postedTransactionId: p.postedTransactionId as unknown as
                | string
                | undefined,
            });
          }
        } else {
          results.push({
            ...p,
            _id: p._id as string,
            amount: typeof p.amount === "number" ? p.amount : 0,
            type: p.type as "income" | "expense",
            status: (p.status as "planned" | "posted" | "skipped") ?? "planned",
            postedTransactionId: p.postedTransactionId as unknown as
              | string
              | undefined,
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

