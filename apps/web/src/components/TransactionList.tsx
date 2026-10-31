import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowUpRight, ArrowDownRight, LayoutList, CalendarDays, CalendarRange, CalendarSync, ChevronDown, ChevronRight, Pencil, Filter, X, Search, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useDecryptedTransactions, type DecryptedTransaction } from "@/hooks/useDecryptedTransactions";
import { Id } from "../../convex/_generated/dataModel";
import { formatCurrency } from "@/lib/currencyUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS, categoriesFor, getCategoryLabel, getCategoryMeta, isTransferCategory, normalizeCategory } from "@/lib/categoryUtils";
import { useLedgerFilter } from "@/contexts/LedgerFilterContext";
import { useCategoryRules } from "@/hooks/useCategoryRules";
import { merchantKey } from "@devcents/shared/categoryRules";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { EditData } from "@/components/AddTransaction";
import { Tip } from "@/components/ui/Tip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TransactionListProps {
  limit?: number;
  compact?: boolean;
}

type GroupBy = "none" | "day" | "week" | "month";

const UNDO_MS = 6000;

export function TransactionList({
  limit,
  compact = false,
}: TransactionListProps) {
  const allTransactions = useDecryptedTransactions();
  const removeTransaction = useMutation(api.transactions.remove);
  const updateTransactionMut = useMutation(api.transactions.update);
  const setCategoryMany = useMutation(api.transactions.setCategoryMany);
  const { baseCurrency, convertAmount } = useCurrency();
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { filter: ledgerFilter, setFilter: setLedgerFilter } = useLedgerFilter();
  const { learn } = useCategoryRules();
  const [similarPrompt, setSimilarPrompt] = useState<{
    ids: Id<"transactions">[];
    category: string;
    type: "income" | "expense";
    merchant: string;
  } | null>(null);

  const [search, setSearch] = useState("");

  // Deletes wait UNDO_MS before reaching the server so they can be undone.
  // Pending ids are hidden right away; unmounting commits them immediately.
  const [pendingDeletes, setPendingDeletes] = useState<Array<{ id: Id<"transactions">; description: string }>>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removeRef = useRef(removeTransaction);
  removeRef.current = removeTransaction;

  const commitDelete = useCallback((id: Id<"transactions">) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setPendingDeletes((prev) => prev.filter((p) => p.id !== id));
    void removeRef.current({ id }).catch((err) => console.error("Delete failed", err));
  }, []);

  const deleteTransaction = useCallback(
    ({ id }: { id: Id<"transactions"> }) => {
      if (timersRef.current.has(id)) return;
      const tx = allTransactions?.find((t) => t._id === id);
      setPendingDeletes((prev) => [...prev, { id, description: tx?.description ?? "entry" }]);
      timersRef.current.set(id, setTimeout(() => commitDelete(id), UNDO_MS));
    },
    [allTransactions, commitDelete],
  );

  const undoDelete = (id: Id<"transactions">) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setPendingDeletes((prev) => prev.filter((p) => p.id !== id));
  };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        void removeRef.current({ id: id as Id<"transactions"> });
      }
      timers.clear();
    };
  }, []);

  // The compact overview list ignores the chart filter and search.
  const activeFilter = compact ? null : ledgerFilter;
  const query = compact ? "" : search.trim().toLowerCase();
  const visibleTransactions = useMemo(() => {
    if (!allTransactions) return allTransactions;
    const hidden = new Set(pendingDeletes.map((p) => p.id as string));
    return allTransactions.filter((t) => {
      if (hidden.has(t._id)) return false;
      if (
        activeFilter &&
        !(
          t.type === activeFilter.type &&
          t.date >= activeFilter.start &&
          t.date <= activeFilter.end &&
          normalizeCategory(t.category, t.type) === activeFilter.category
        )
      )
        return false;
      if (query) {
        const haystack = `${t.description} ${getCategoryLabel(normalizeCategory(t.category, t.type), t.type)} ${t.amount} ${t.currency ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [allTransactions, activeFilter, query, pendingDeletes]);

  const transactions =
    limit && visibleTransactions
      ? visibleTransactions.slice(0, limit)
      : visibleTransactions;

  // Manual re-categorize: save, remember the choice for this merchant, and
  // offer to move other entries from the same merchant too.
  const updateTransaction = async ({ id, category }: { id: Id<"transactions">; category: string }) => {
    await updateTransactionMut({ id, category });
    const tx = allTransactions?.find((t) => t._id === id);
    if (!tx) return;
    void learn(tx.description, category, tx.type);
    const key = merchantKey(tx.description);
    // Transfers are decided per entry (your cash vs cash you gave away).
    if (!key || category === "transfer") {
      setSimilarPrompt(null);
      return;
    }
    const ids = (allTransactions ?? [])
      .filter(
        (t) =>
          t._id !== id &&
          t.type === tx.type &&
          merchantKey(t.description) === key &&
          normalizeCategory(t.category, t.type) !== category,
      )
      .map((t) => t._id as Id<"transactions">);
    setSimilarPrompt(ids.length ? { ids, category, type: tx.type, merchant: key } : null);
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const groupedData = useMemo(() => {
    if (!transactions || groupBy === "none") return null;

    const groups: Record<string, {
      transactions: DecryptedTransaction[];
      income: number;
      expense: number;
      date: number;
    }> = {};

    transactions.forEach(t => {
      let key = "all";
      const d = new Date(t.date);
      if (groupBy === "day") {
        key = d.toLocaleDateString(undefined, { dateStyle: "medium" });
      } else if (groupBy === "week") {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = `Week of ${startOfWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      } else if (groupBy === "month") {
        key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      }

      if (!groups[key]) {
        groups[key] = { transactions: [], income: 0, expense: 0, date: t.date };
      }
      groups[key].transactions.push(t);
      if (isTransferCategory(t.category, t.type)) return;
      const amountInBase = convertAmount(t.amount, t.currency || "USD");
      if (t.type === "income") {
        groups[key].income += amountInBase;
      } else {
        groups[key].expense += amountInBase;
      }
    });

    return Object.entries(groups).sort((a, b) => b[1].date - a[1].date);
  }, [transactions, groupBy, convertAmount]);

  if (!transactions)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-8 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        <span className="text-primary">$ </span>loading records...
      </motion.div>
    );

  // Only a truly empty ledger replaces the whole view; empty search/filter
  // results render inside it so the controls (and undo) stay reachable.
  const hasNarrowing = !!activeFilter || !!query || pendingDeletes.length > 0;
  if (transactions.length === 0 && !hasNarrowing)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="m-5 p-8 text-center font-mono text-[10px] uppercase tracking-widest border border-dashed border-border text-muted-foreground"
      >
        <span className="text-primary">→ </span>no records found. input
        required.
      </motion.div>
    );

  const emptyResult = transactions.length === 0 && (
    <div className="m-5 p-8 text-center font-mono text-[10px] uppercase tracking-widest border border-dashed border-border text-muted-foreground">
      {query ? (
        <>
          no matches for “{search.trim()}”.{" "}
          <button type="button" onClick={() => setSearch("")} className="text-primary hover:underline">
            clear search
          </button>
        </>
      ) : activeFilter ? (
        <>
          no {getCategoryLabel(activeFilter.category, activeFilter.type)} entries for {activeFilter.periodLabel}.{" "}
          <button type="button" onClick={() => setLedgerFilter(null)} className="text-primary hover:underline">
            clear filter
          </button>
        </>
      ) : (
        "no records left."
      )}
    </div>
  );

  const GroupControls = () => (
    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card/30 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-1.5 pr-3 mr-1.5 border-r border-border/50">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/80 whitespace-nowrap">view:</span>
      </div>
      <div className="flex items-center gap-1">
        {[
          { id: "none", label: "Flat", icon: LayoutList },
          { id: "day", label: "Daily", icon: CalendarDays },
          { id: "week", label: "Weekly", icon: CalendarRange },
          { id: "month", label: "Monthly", icon: CalendarSync },
        ].map((m) => {
          const Icon = m.icon;
          const active = groupBy === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setGroupBy(m.id as GroupBy)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-none font-mono text-[9px] uppercase tracking-widest transition-all border",
                active
                  ? "bg-primary/10 text-primary border-primary/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:bg-white/5",
              )}
            >
              <Icon className="h-3 w-3" />
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const GroupHeader = ({ name, income, expense, count, isOpen, onToggle, isMobile = false }: { name: string, income: number, expense: number, count: number, isOpen: boolean, onToggle: () => void, isMobile?: boolean }) => (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors group",
        isMobile && "border-l-[3px] border-l-transparent"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-4 flex justify-center shrink-0">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />}
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground font-medium truncate">{name}</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">{count}_items</span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden @md:flex items-center gap-3 pr-3 border-r border-border/30">
          {income > 0 && (
            <span className="font-mono text-[10px] text-primary/80 num-display">+{formatCurrency(income, baseCurrency)}</span>
          )}
          {expense > 0 && (
            <span className="font-mono text-[10px] text-destructive/80 num-display">-{formatCurrency(expense, baseCurrency)}</span>
          )}
        </div>
        <span className={cn(
          "font-mono text-[10px] num-display",
          income - expense >= 0 ? "text-foreground" : "text-destructive"
        )}>
          {formatCurrency(income - expense, baseCurrency)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={cn("@container min-w-0 pb-20 md:pb-0", compact && "pb-0")}>
      {!limit && <GroupControls />}
      {!limit && !compact && (
        <label className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/20">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            placeholder="search description, category, amount…"
            aria-label="Search ledger"
            className="flex-1 min-w-0 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {query && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              {transactions?.length ?? 0} found
            </span>
          )}
        </label>
      )}
      {pendingDeletes.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-destructive/5 font-mono text-[10px]" role="status">
          <Trash2 className="h-3 w-3 text-destructive shrink-0" />
          <span className="text-muted-foreground truncate">
            {pendingDeletes.length === 1
              ? `Deleted “${pendingDeletes[0].description}”`
              : `Deleted ${pendingDeletes.length} entries`}
          </span>
          <button
            type="button"
            onClick={() => pendingDeletes.forEach((p) => undoDelete(p.id))}
            className="ml-auto flex items-center gap-1 h-6 px-2 border border-border text-foreground uppercase tracking-widest hover:bg-white/5 shrink-0"
          >
            <Undo2 className="h-3 w-3" /> undo
          </button>
        </div>
      )}
      {activeFilter && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-primary/5 font-mono text-[10px] uppercase tracking-widest">
          <Filter className="h-3 w-3 text-primary shrink-0" />
          {(() => {
            const meta = getCategoryMeta(activeFilter.category, activeFilter.type);
            return <meta.Icon className="h-3 w-3 shrink-0" style={{ color: meta.color }} />;
          })()}
          <span className="text-foreground truncate">{getCategoryLabel(activeFilter.category, activeFilter.type)}</span>
          <span className="text-muted-foreground whitespace-nowrap">· {activeFilter.periodLabel} · {transactions?.length ?? 0}</span>
          <button
            type="button"
            onClick={() => setLedgerFilter(null)}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Clear category filter"
          >
            <X className="h-3 w-3" /> clear
          </button>
        </div>
      )}
      {similarPrompt && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 font-mono text-[10px]">
          <span className="text-muted-foreground">
            Move {similarPrompt.ids.length} other “{similarPrompt.merchant}” {similarPrompt.ids.length === 1 ? "entry" : "entries"} to{" "}
            <span className="text-foreground">{getCategoryLabel(similarPrompt.category, similarPrompt.type)}</span> too?
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const prompt = similarPrompt;
                setSimilarPrompt(null);
                for (let i = 0; i < prompt.ids.length; i += 500) {
                  await setCategoryMany({ ids: prompt.ids.slice(i, i + 500), category: prompt.category });
                }
              }}
              className="h-6 px-2 border border-primary/40 bg-primary/10 text-primary uppercase tracking-widest"
            >
              apply
            </button>
            <button
              type="button"
              onClick={() => setSimilarPrompt(null)}
              className="h-6 px-2 border border-border text-muted-foreground uppercase tracking-widest"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {emptyResult}
      {/* ── CARD LIST: used whenever the ledger is narrower than 42rem ── */}
      <div className="@2xl:hidden">
        <AnimatePresence mode="wait">
          {groupedData ? (
            <motion.div
              key={`grouped-${groupBy}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {groupedData.map(([key, group]) => (
                <div key={key} className="border-b border-border last:border-b-0">
                  <GroupHeader
                    name={key}
                    income={group.income}
                    expense={group.expense}
                    count={group.transactions.length}
                    isOpen={expandedGroups[key] !== false}
                    onToggle={() => toggleGroup(key)}
                    isMobile
                  />
                  {expandedGroups[key] !== false && (
                    <div className="overflow-hidden">
                      {group.transactions.map((t, index) => (
                        <TransactionMobileRow
                          key={t._id}
                          t={t}
                          index={index}
                          compact={compact}
                          deleteTransaction={deleteTransaction}
                          updateTransaction={updateTransaction}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="flat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="border-border"
            >
              {transactions.map((t, index) => (
                <TransactionMobileRow
                  key={t._id}
                  t={t}
                  index={index}
                  compact={compact}
                  deleteTransaction={deleteTransaction}
                  updateTransaction={updateTransaction}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.table
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="hidden @2xl:table table-fixed w-full text-sm text-left border-collapse"
      >
        <thead>
          <tr className="border-b border-border">
            {["date", "category", "description", "amount", ""].map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "px-4 py-2.5 font-mono font-normal text-[9px] uppercase tracking-[0.2em] text-muted-foreground bg-card/50",
                  i === 0 && "w-24",
                  i === 1 && "w-[26%]",
                  i === 3 && "w-40 text-right",
                  i === 4 && "w-20",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <AnimatePresence mode="wait">
          {groupedData ? (
            <motion.tbody
              key={`grouped-${groupBy}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {groupedData.map(([key, group]) => (
                <React.Fragment key={key}>
                  <tr>
                    <td colSpan={5} className="p-0">
                      <GroupHeader
                        name={key}
                        income={group.income}
                        expense={group.expense}
                        count={group.transactions.length}
                        isOpen={expandedGroups[key] !== false}
                        onToggle={() => toggleGroup(key)}
                      />
                    </td>
                  </tr>
                  {expandedGroups[key] !== false && group.transactions.map((t, index) => (
                    <TransactionDesktopRow
                      key={t._id}
                      t={t}
                      index={index}
                      deleteTransaction={deleteTransaction}
                      updateTransaction={updateTransaction}
                    />
                  ))}
                </React.Fragment>
              ))}
            </motion.tbody>
          ) : (
            <motion.tbody
              key="flat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {transactions.map((t, index) => (
                <TransactionDesktopRow
                  key={t._id}
                  t={t}
                  index={index}
                  deleteTransaction={deleteTransaction}
                  updateTransaction={updateTransaction}
                />
              ))}
            </motion.tbody>
          )}
        </AnimatePresence>
      </motion.table>
    </div>
  );
}

function TransactionMobileRow({ t, index, compact, deleteTransaction, updateTransaction }: {
  t: DecryptedTransaction,
  index: number,
  compact: boolean,
  deleteTransaction: any,
  updateTransaction: any
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.18, delay: index * 0.025 }}
      className="flex items-center gap-3 px-4 py-3 transition-colors border-b border-border/50 last:border-b-0 hover:bg-primary/5"
      style={{ borderLeftWidth: "3px", borderLeftColor: getCategoryMeta(t.category, t.type).color }}
    >
      {/* Type icon */}
      <div
        className={cn(
          "w-7 h-7 flex items-center justify-center shrink-0 border",
          t.type === "income"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-destructive/30 bg-destructive/10 text-destructive",
        )}
      >
        {t.type === "income" ? (
          <ArrowUpRight className="h-3.5 w-3.5" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[12px] truncate text-foreground/90">
          {t.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          <CategoryDropdown
            t={t}
            updateTransaction={updateTransaction}
            triggerClassName="font-mono text-[9px] uppercase tracking-wider text-muted-foreground border-l-2 border-border pl-[5px] flex items-center gap-1 min-w-0 hover:text-foreground transition-colors focus:outline-none cursor-pointer"
            iconClassName="h-3 w-3"
          />
          <span className="font-mono text-[9px] text-muted-foreground opacity-60 whitespace-nowrap shrink-0">
            {new Date(t.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Amount + edit + delete */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            "font-mono text-sm num-display",
            amountTone(t),
          )}
        >
          {amountSign(t)}
          {formatCurrency(t.amount, t.currency || "USD")}
        </span>
        {!compact && (
          <>
            <Tip label="Edit">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  document.dispatchEvent(new CustomEvent("open-add-entry", {
                    detail: {
                      mode: "ledger",
                      editData: {
                        id: t._id,
                        amount: t.amount,
                        currency: t.currency || "USD",
                        description: t.description,
                        category: t.category,
                        type: t.type,
                        date: new Date(t.date).toISOString().slice(0, 10),
                      } satisfies EditData,
                    },
                  }));
                }}
                className="h-7 w-7 border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </Tip>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-none transition-colors text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                deleteTransaction({ id: t._id as Id<"transactions"> });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Transfers move the user's own money, so they render neutral, not red/green. */
function amountTone(t: DecryptedTransaction) {
  if (isTransferCategory(t.category, t.type)) return "text-muted-foreground";
  return t.type === "income" ? "text-primary" : "text-destructive";
}

function amountSign(t: DecryptedTransaction) {
  if (isTransferCategory(t.category, t.type)) return "⇄ ";
  return t.type === "income" ? "+" : "-";
}

function CategoryDropdown({ t, updateTransaction, triggerClassName, iconClassName }: {
  t: DecryptedTransaction,
  updateTransaction: any,
  triggerClassName: string,
  iconClassName: string,
}) {
  const meta = getCategoryMeta(t.category, t.type);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClassName} title={t.category !== meta.key ? `Stored as "${t.category}"` : undefined}>
        <meta.Icon className={cn(iconClassName, "shrink-0")} style={{ color: meta.color }} />
        <span className="truncate whitespace-nowrap">{meta.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70 min-w-[180px] max-h-72 overflow-y-auto" align="start">
        {categoriesFor(t.type).map((c) => {
          const Icon = CATEGORY_ICONS[c.value] ?? CATEGORY_ICONS.other;
          const active = c.value === meta.key;
          return (
            <DropdownMenuItem
              key={c.value}
              onSelect={() => {
                if (c.value !== t.category) updateTransaction({ id: t._id as Id<"transactions">, category: c.value });
              }}
              className={active ? "cursor-pointer text-foreground" : "cursor-pointer"}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[c.value] ?? CATEGORY_COLORS.other }} />
                {c.label}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransactionDesktopRow({ t, index, deleteTransaction, updateTransaction }: {
  t: DecryptedTransaction,
  index: number,
  deleteTransaction: any,
  updateTransaction: any
}) {
  return (
    <motion.tr
      key={t._id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className="group cursor-default tr-hover border-b border-border/80"
    >
      <td className="px-4 py-3 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
        {new Date(t.date).toLocaleDateString(undefined, {
          month: "2-digit",
          day: "2-digit",
          year: "2-digit",
        })}
      </td>
      <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground overflow-hidden">
        <CategoryDropdown
          t={t}
          updateTransaction={updateTransaction}
          triggerClassName="flex items-center gap-1.5 min-w-0 max-w-full hover:text-foreground transition-colors focus:outline-none cursor-pointer"
          iconClassName="h-3.5 w-3.5"
        />
      </td>
      <td className="px-4 py-3 font-mono text-[12px] truncate text-foreground/80" title={t.description}>
        {t.description}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-right font-mono text-[13px] num-display whitespace-nowrap",
          amountTone(t),
        )}
      >
        {amountSign(t)}
        {formatCurrency(t.amount, t.currency || "USD")}
      </td>
      <td className="px-4 py-3 w-20 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              document.dispatchEvent(new CustomEvent("open-add-entry", {
                detail: {
                  mode: "ledger",
                  editData: {
                    id: t._id,
                    amount: t.amount,
                    currency: t.currency || "USD",
                    description: t.description,
                    category: t.category,
                    type: t.type,
                    date: new Date(t.date).toISOString().slice(0, 10),
                  } satisfies EditData,
                },
              }));
            }}
          >
            <Pencil className="h-3 w-3" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteTransaction({ id: t._id as Id<"transactions"> });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </td>
    </motion.tr>
  );
}
