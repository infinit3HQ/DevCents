import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Check, Pencil, Plus, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useEncryption } from "@/contexts/EncryptionContext";
import { formatAmountOnly, getCurrencySymbol } from "@/lib/currencyUtils";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  getCategoryLabel,
  normalizeCategory,
} from "@/lib/categoryUtils";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BudgetRow = {
  category: string;
  /** Limit converted to the base currency */
  limit: number;
  /** Limit as entered, for editing */
  rawLimit: number;
  rawCurrency: string;
};

const INPUT_CLASS =
  "h-8 w-28 bg-transparent border border-border px-2 font-mono text-[11px] tabular-nums text-foreground focus:outline-none focus:border-primary/60";

function parseLimit(text: string): number | null {
  const n = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Monthly spending limit per expense category, compared against the current
 * calendar month (independent of the chart's period selector).
 */
export function CategoryBudgets() {
  const budgets = useQuery(api.categoryBudgets.list);
  const setBudget = useMutation(api.categoryBudgets.set);
  const removeBudget = useMutation(api.categoryBudgets.remove);
  const transactions = useDecryptedTransactions();
  const { baseCurrency, convertAmount } = useCurrency();
  const { isEnabled, isUnlocked, encryptValue, decryptValue } = useEncryption();
  const symbol = getCurrencySymbol(baseCurrency);
  const fmt = (n: number) => `${symbol}${formatAmountOnly(n, baseCurrency)}`;

  const [rows, setRows] = useState<BudgetRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<string>("");
  const [newText, setNewText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const locked = isEnabled && !isUnlocked;

  // Decrypt limits (they're financial data, encrypted like amounts).
  useEffect(() => {
    if (!budgets) return;
    if (budgets.some((b) => b.encrypted) && !isUnlocked) {
      setRows(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const out: BudgetRow[] = [];
      for (const b of budgets) {
        try {
          const raw =
            typeof b.limit === "number" ? b.limit : parseFloat(await decryptValue(b.limit));
          if (!Number.isFinite(raw)) continue;
          out.push({
            category: b.category,
            rawLimit: raw,
            rawCurrency: b.currency,
            limit: convertAmount(raw, b.currency),
          });
        } catch {
          // Skip rows we can't decrypt rather than showing a wrong limit.
        }
      }
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [budgets, isUnlocked, decryptValue, convertAmount]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const daysLeft = Math.max(
    1,
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1,
  );
  const monthLabel = now.toLocaleString(undefined, { month: "long" });

  const spentThisMonth = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions ?? []) {
      if (t.type !== "expense" || t.date < monthStart || t.date >= nextMonthStart) continue;
      const key = normalizeCategory(t.category, "expense");
      out[key] = (out[key] ?? 0) + convertAmount(t.amount, t.currency || "USD");
    }
    return out;
  }, [transactions, monthStart, nextMonthStart, convertAmount]);

  const sorted = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ ...r, spent: spentThisMonth[r.category] ?? 0 }))
        .sort((a, b) => b.spent / b.limit - a.spent / a.limit),
    [rows, spentThisMonth],
  );

  const unbudgeted = EXPENSE_CATEGORIES.filter(
    (c) => c.value !== "transfer" && !(rows ?? []).some((r) => r.category === c.value),
  );

  const save = async (category: string, text: string) => {
    const limit = parseLimit(text);
    if (limit === null) {
      setError("Enter an amount greater than zero.");
      return false;
    }
    setError(null);
    const shouldEncrypt = isEnabled && isUnlocked;
    try {
      await setBudget({
        category,
        limit: shouldEncrypt ? await encryptValue(String(limit)) : limit,
        currency: baseCurrency,
        encrypted: shouldEncrypt,
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save budget.");
      return false;
    }
  };

  const totalLimit = sorted.reduce((s, r) => s + r.limit, 0);
  const totalSpent = sorted.reduce((s, r) => s + r.spent, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="p-5 border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          // category_budgets · {monthLabel}
        </p>
        {sorted.length > 0 && (
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground tabular-nums">
            {fmt(totalSpent)} / {fmt(totalLimit)} · {daysLeft}d left
          </p>
        )}
      </div>

      {locked ? (
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          unlock encryption to view budgets
        </p>
      ) : rows === null ? (
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">loading…</p>
      ) : (
        <div className="space-y-3">
          {sorted.length === 0 && !adding && (
            <p className="font-mono text-[10px] text-muted-foreground">
              No budgets yet. Set a monthly limit for a category to track it here.
            </p>
          )}

          {sorted.map((r) => {
            const Icon = CATEGORY_ICONS[r.category] ?? CATEGORY_ICONS.other;
            const color = CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS.other;
            const ratio = r.limit > 0 ? r.spent / r.limit : 0;
            const remaining = r.limit - r.spent;
            const tone =
              ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";
            const isEditing = editing === r.category;
            return (
              <div key={r.category} className="group">
                <div className="flex items-center gap-2 font-mono text-[10px] min-w-0">
                  <Icon className="h-3 w-3 shrink-0" style={{ color }} />
                  <span className="uppercase tracking-wider text-muted-foreground truncate">
                    {getCategoryLabel(r.category, "expense")}
                  </span>
                  {isEditing ? (
                    <form
                      className="ml-auto flex items-center gap-1"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await save(r.category, editText)) setEditing(null);
                      }}
                    >
                      <input
                        autoFocus
                        inputMode="decimal"
                        aria-label={`Monthly limit for ${getCategoryLabel(r.category, "expense")}`}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        className={INPUT_CLASS}
                      />
                      <button type="submit" className="h-8 w-8 flex items-center justify-center border border-border text-primary hover:bg-primary/10" aria-label="Save">
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBudget({ category: r.category }).then(() => setEditing(null))}
                        className="h-8 w-8 flex items-center justify-center border border-border text-muted-foreground hover:text-destructive"
                        aria-label="Remove budget"
                        title="Remove budget"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="ml-auto tabular-nums text-foreground/80 shrink-0">
                        {fmt(r.spent)} <span className="text-muted-foreground/70">/ {fmt(r.limit)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(r.category);
                          setEditText(String(r.rawCurrency === baseCurrency ? r.rawLimit : Math.round(r.limit)));
                          setError(null);
                        }}
                        className="h-6 w-6 flex items-center justify-center text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-foreground"
                        aria-label={`Edit ${getCategoryLabel(r.category, "expense")} budget`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-muted/50 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={cn("h-full", tone)}
                  />
                </div>
                <p
                  className={cn(
                    "mt-1 font-mono text-[9px] tabular-nums",
                    remaining < 0 ? "text-destructive" : "text-muted-foreground/80",
                  )}
                >
                  {remaining < 0
                    ? `${fmt(-remaining)} over budget`
                    : `${fmt(remaining)} left · about ${fmt(remaining / daysLeft)}/day`}
                </p>
              </div>
            );
          })}

          {adding ? (
            <form
              className="flex flex-wrap items-center gap-2 pt-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCategory) {
                  setError("Pick a category.");
                  return;
                }
                if (await save(newCategory, newText)) {
                  setAdding(false);
                  setNewCategory("");
                  setNewText("");
                }
              }}
            >
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-8 w-52 rounded-none bg-transparent border border-border font-mono text-[10px] uppercase tracking-widest">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card">
                  {unbudgeted.map((c) => {
                    const Icon = CATEGORY_ICONS[c.value] ?? CATEGORY_ICONS.other;
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[c.value] }} />
                          {c.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <input
                inputMode="decimal"
                placeholder={`${symbol} per month`}
                aria-label="Monthly limit"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className={INPUT_CLASS}
              />
              <button type="submit" className="h-8 px-3 border border-primary/40 bg-primary/10 text-primary font-mono text-[10px] uppercase tracking-widest">
                save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                className="h-8 px-3 border border-border text-muted-foreground font-mono text-[10px] uppercase tracking-widest"
              >
                cancel
              </button>
            </form>
          ) : (
            unbudgeted.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setError(null);
                }}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3 w-3" /> set a budget
              </button>
            )
          )}

          {error && <p className="font-mono text-[10px] text-destructive">{error}</p>}
        </div>
      )}
    </motion.div>
  );
}
