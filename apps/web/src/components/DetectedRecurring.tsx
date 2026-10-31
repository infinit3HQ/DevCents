import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import type { DecryptedRecurringItem } from "@/hooks/useDecryptedRecurring";
import { detectRecurring } from "@/lib/recurringDetection";
import { getCategoryMeta } from "@/lib/categoryUtils";
import { formatCurrency } from "@/lib/currencyUtils";
import type { PrefillData } from "@/components/AddTransaction";

const DISMISSED_KEY = "devcents.dismissedRecurring";
const MAX_SHOWN = 5;

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function toDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Suggests recurring items from regular repeats in the ledger. "Add" opens the
 * recurring form pre-filled so the user can review before saving; "dismiss"
 * is remembered on this device.
 */
export function DetectedRecurring({ recurring }: { recurring: DecryptedRecurringItem[] }) {
  const transactions = useDecryptedTransactions();
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const suggestions = useMemo(
    () => (transactions ? detectRecurring(transactions, recurring, Date.now(), dismissed) : []),
    [transactions, recurring, dismissed],
  );

  if (suggestions.length === 0) return null;

  const dismiss = (key: string) => {
    const next = new Set(dismissed).add(key);
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // Storage full or blocked; the dismissal just won't persist.
    }
  };

  const add = (s: (typeof suggestions)[number]) => {
    const prefill: PrefillData = {
      amount: s.amount,
      currency: s.currency,
      description: s.description,
      category: s.category,
      type: s.type,
      startDate: toDateInput(s.nextDate),
      cadence: s.cadence,
    };
    document.dispatchEvent(new CustomEvent("open-add-entry", { detail: { mode: "recurring", prefill } }));
  };

  return (
    <div className="mb-4 border border-primary/20 bg-primary/5">
      <p className="flex items-center gap-2 px-3 py-2 border-b border-primary/20 font-mono text-[9px] uppercase tracking-[0.2em] text-primary/80">
        <Sparkles className="h-3 w-3" /> detected repeating payments
      </p>
      <div className="divide-y divide-border/60">
        {suggestions.slice(0, MAX_SHOWN).map((s) => {
          const meta = getCategoryMeta(s.category, s.type);
          return (
            <div key={s.key} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
              <meta.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[11px] text-foreground/90 truncate">{s.description}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground truncate">
                  {s.cadence} · ~{formatCurrency(s.amount, s.currency)} · seen {s.count}× · next{" "}
                  {new Date(s.nextDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => add(s)}
                className="h-7 px-2.5 shrink-0 border border-primary/40 bg-primary/10 text-primary font-mono text-[9px] uppercase tracking-widest hover:bg-primary/20"
              >
                + add
              </button>
              <button
                type="button"
                onClick={() => dismiss(s.key)}
                className="h-7 w-7 shrink-0 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground"
                aria-label={`Dismiss suggestion for ${s.description}`}
                title="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
