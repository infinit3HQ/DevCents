import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption } from "@/contexts/EncryptionContext";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
  currency?: string;
  rateToUSD?: number;
  /**
   * The amount is ciphertext we couldn't read (vault locked, or decryption
   * failed). `amount` is 0 so sums don't break; callers must exclude the row
   * from totals and tell the user rather than show a silently low number.
   */
  undecryptable?: boolean;
}

const NOT_PROVIDED = Symbol("not-provided");
const DecryptedTransactionsContext = createContext<
  DecryptedTransaction[] | undefined | typeof NOT_PROVIDED
>(NOT_PROVIDED);

type RawTx = NonNullable<ReturnType<typeof useQuery<typeof api.transactions.get>>>[number];

function plain(t: RawTx): DecryptedTransaction {
  return {
    ...t,
    _id: t._id as string,
    amount: typeof t.amount === "number" ? t.amount : 0,
    type: t.type as "income" | "expense",
    ...(typeof t.amount === "number" ? {} : { undecryptable: true }),
  };
}

/**
 * Subscribes to the user's transactions once and decrypts them once for the
 * whole app. Rows are cached by id + ciphertext, so an edit to one row only
 * re-decrypts that row instead of the full history.
 */
export function DecryptedTransactionsProvider({ children }: { children: ReactNode }) {
  const rawTransactions = useQuery(api.transactions.get);
  const { isUnlocked, decryptValue, isEnabled } = useEncryption();
  const [decrypted, setDecrypted] = useState<DecryptedTransaction[] | undefined>(undefined);
  const cacheRef = useRef(new Map<string, DecryptedTransaction>());
  const cacheOwnerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!rawTransactions) {
      setDecrypted(undefined);
      return;
    }
    if (!isEnabled || !isUnlocked) {
      setDecrypted(rawTransactions.map(plain));
      return;
    }

    // A different key means cached plaintext may be wrong; start over.
    if (cacheOwnerRef.current !== decryptValue) {
      cacheRef.current = new Map();
      cacheOwnerRef.current = decryptValue;
    }
    const cache = cacheRef.current;
    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        rawTransactions.map(async (t) => {
          if (!t.encrypted) return { ...plain(t), category: t.category };
          const cacheKey = `${t._id}|${t.description}|${t.amount}`;
          const hit = cache.get(cacheKey);
          // Category, date, rate etc. are plaintext and may change on their own.
          if (hit) return { ...hit, ...t, _id: t._id as string, description: hit.description, amount: hit.amount, type: t.type as "income" | "expense" };
          try {
            const [description, amountText] = await Promise.all([
              decryptValue(t.description),
              typeof t.amount === "string" ? decryptValue(t.amount) : Promise.resolve(String(t.amount)),
            ]);
            const row: DecryptedTransaction = {
              ...t,
              _id: t._id as string,
              description,
              amount: Number.isFinite(parseFloat(amountText)) ? parseFloat(amountText) : 0,
              ...(Number.isFinite(parseFloat(amountText)) ? {} : { undecryptable: true }),
              type: t.type as "income" | "expense",
            };
            cache.set(cacheKey, row);
            return row;
          } catch {
            return plain(t);
          }
        }),
      );
      if (!cancelled) setDecrypted(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [rawTransactions, isUnlocked, isEnabled, decryptValue]);

  return createElement(DecryptedTransactionsContext.Provider, { value: decrypted }, children);
}

export function useDecryptedTransactions() {
  const value = useContext(DecryptedTransactionsContext);
  if (value === NOT_PROVIDED) {
    throw new Error("useDecryptedTransactions must be used inside DecryptedTransactionsProvider");
  }
  return value;
}
