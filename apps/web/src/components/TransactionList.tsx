import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowUpRight, ArrowDownRight, LayoutList, CalendarDays, CalendarRange, CalendarSync, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useDecryptedTransactions, type DecryptedTransaction } from "@/hooks/useDecryptedTransactions";
import { Id } from "../../convex/_generated/dataModel";
import { formatCurrency } from "@/lib/currencyUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORIES } from "@/lib/categoryUtils";
import { useCurrency } from "@/contexts/CurrencyContext";
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

export function TransactionList({
  limit,
  compact = false,
}: TransactionListProps) {
  const allTransactions = useDecryptedTransactions();
  const deleteTransaction = useMutation(api.transactions.remove);
  const updateTransaction = useMutation(api.transactions.update);
  const { baseCurrency, convertAmount } = useCurrency();
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const transactions =
    limit && allTransactions
      ? allTransactions.slice(0, limit)
      : allTransactions;

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

  if (transactions.length === 0)
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
      <div className="flex items-center gap-3">
        <div className="w-4 flex justify-center">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground font-medium">{name}</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60">{count}_items</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-3 pr-3 border-r border-border/30">
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
    <div className={cn("pb-20 md:pb-4", compact && "pb-0")}>
      {!limit && <GroupControls />}

      {/* ── MOBILE LIST ─────────────────────────────────────────── */}
      <div className="md:hidden">
        <AnimatePresence mode="popLayout">
          {groupedData ? (
            groupedData.map(([key, group]) => (
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
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
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
                  </motion.div>
                )}
              </div>
            ))
          ) : (
            <div className="border-border">
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
            </div>
          )}
        </AnimatePresence>
      </div>

      <motion.table
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="hidden md:table w-full text-sm text-left border-collapse"
      >
        <thead>
          <tr className="border-b border-border">
            {["date", "category", "description", "amount", ""].map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "px-4 py-2.5 font-mono font-normal text-[9px] uppercase tracking-[0.2em] text-muted-foreground bg-card/50",
                  i === 3 && "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <AnimatePresence mode="popLayout">
          {groupedData ? (
            groupedData.map(([key, group]) => (
              <tbody key={key} className="border-b border-border/50 last:border-b-0">
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
              </tbody>
            ))
          ) : (
            <tbody>
              {transactions.map((t, index) => (
                <TransactionDesktopRow
                  key={t._id}
                  t={t}
                  index={index}
                  deleteTransaction={deleteTransaction}
                  updateTransaction={updateTransaction}
                />
              ))}
            </tbody>
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
      style={{ borderLeftWidth: "3px", borderLeftColor: CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other }}
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
        <div className="flex items-center gap-2 mt-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground border-l-2 border-border pl-[5px] flex items-center gap-1 hover:text-foreground transition-colors focus:outline-none cursor-pointer">
              {(() => { const Icon = CATEGORY_ICONS[t.category] ?? CATEGORY_ICONS.other; return <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other }} />; })()}
              {t.category}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70 min-w-[140px]" align="start">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem
                  key={c.value}
                  onSelect={() => updateTransaction({ id: t._id as Id<"transactions">, category: c.value })}
                  className="cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {(() => { const Icon = CATEGORY_ICONS[c.value] ?? CATEGORY_ICONS.other; return <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[c.value] ?? CATEGORY_COLORS.other }} />; })()}
                    {c.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="font-mono text-[9px] text-muted-foreground opacity-60">
            {new Date(t.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Amount + delete */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            "font-mono text-sm num-display",
            t.type === "income" ? "text-primary" : "text-destructive",
          )}
        >
          {t.type === "income" ? "+" : "-"}
          {formatCurrency(t.amount, t.currency || "USD")}
        </span>
        {!compact && (
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
        )}
      </div>
    </motion.div>
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
      <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 hover:text-foreground transition-colors focus:outline-none cursor-pointer">
            {(() => { const Icon = CATEGORY_ICONS[t.category] ?? CATEGORY_ICONS.other; return <Icon className="h-3.5 w-3.5" style={{ color: CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other }} />; })()}
            {t.category}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-card text-foreground/70 min-w-[140px]" align="start">
            {CATEGORIES.map((c) => (
              <DropdownMenuItem
                key={c.value}
                onSelect={() => updateTransaction({ id: t._id as Id<"transactions">, category: c.value })}
                className="cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {(() => { const Icon = CATEGORY_ICONS[c.value] ?? CATEGORY_ICONS.other; return <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[c.value] ?? CATEGORY_COLORS.other }} />; })()}
                  {c.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
      <td className="px-4 py-3 font-mono text-[12px] truncate max-w-[200px] text-foreground/80">
        {t.description}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-right font-mono text-[13px] num-display",
          t.type === "income" ? "text-primary" : "text-destructive",
        )}
      >
        {t.type === "income" ? "+" : "-"}
        {formatCurrency(t.amount, t.currency || "USD")}
      </td>
      <td className="px-4 py-3 w-10 text-right">
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
      </td>
    </motion.tr>
  );
}
