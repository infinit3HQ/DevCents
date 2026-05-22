import { useUser } from "@clerk/tanstack-react-start";
import { useMemo, useState, type ElementType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ReceiptText,
  BarChart3,
  CalendarClock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { TransactionList } from "@/components/TransactionList";
import { SpendingCharts } from "@/components/SpendingCharts";
import { MobileNav } from "@/components/MobileNav";
import { Planning } from "@/components/Planning";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatAmountOnly } from "@/lib/currencyUtils";

type MobileTab = "overview" | "transactions" | "planning" | "analytics";
type DesktopLeftPane = "analytics_category" | "analytics_monthly" | "planning";

const TABS: { id: MobileTab; label: string; icon: ElementType }[] = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "transactions", label: "Ledger", icon: ReceiptText },
  { id: "planning", label: "Plan", icon: CalendarClock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const fmt = (n: number, currencyCode: string) =>
  formatAmountOnly(Math.abs(n), currencyCode);

const Tag = ({
  children,
  color = "green",
}: {
  children: React.ReactNode;
  color?: "green" | "red" | "muted";
}) => {
  const styles = {
    green: "border-primary/25 bg-primary/10 text-primary",
    red: "border-destructive/25 bg-destructive/10 text-destructive",
    muted: "border-border bg-transparent text-muted-foreground",
  }[color];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border",
        styles,
      )}
    >
      {children}
    </span>
  );
};

export function Dashboard() {
  const { user } = useUser();
  const userName = user?.firstName ?? "user";
  const transactions = useDecryptedTransactions();
  const [activeTab, setActiveTab] = useState<MobileTab>("overview");
  const [desktopLeftPane, setDesktopLeftPane] =
    useState<DesktopLeftPane>("analytics_category");
  const { baseCurrency, computeBalances, rates, ratesLoaded } = useCurrency();

  // Per-wallet native balances via the greedy-spillover walk. Stable —
  // doesn't drift when fxratesapi rates move because wallet amounts are
  // in their own currencies.
  const wallets = useMemo(() => {
    if (!transactions) return null;
    return computeBalances(transactions);
  }, [transactions, computeBalances]);

  // Approximate consolidated total in the user's base currency, using
  // today's rates. This is the only number on the page that can drift,
  // and it's clearly labelled as approximate.
  const totalApproxBase = useMemo(() => {
    if (!wallets || !ratesLoaded) return 0;
    const baseFx = rates[baseCurrency] ?? 1;
    let totalUSD = 0;
    for (const [ccy, bal] of Object.entries(wallets)) {
      const r = rates[ccy] ?? 1;
      totalUSD += bal / r;
    }
    return totalUSD * baseFx;
  }, [wallets, rates, ratesLoaded, baseCurrency]);

  // Income / expense / balance summed via per-row locked rateToUSD.
  // Rows that don't have a locked rate (legacy / not yet backfilled)
  // fall back to today's rate so the dashboard never silently swallows
  // them. After the prod backfill ran, every row has rateToUSD set.
  const stats = useMemo(() => {
    if (!transactions || !ratesLoaded)
      return { balance: 0, income: 0, expenses: 0, txCount: 0 };
    const baseFx = rates[baseCurrency] ?? 1;
    let incomeUSD = 0;
    let expenseUSD = 0;
    for (const t of transactions) {
      const locked = t.rateToUSD;
      const valueUSD =
        locked !== undefined && locked > 0
          ? t.amount * locked
          : t.amount / (rates[t.currency || "USD"] || 1);
      if (t.type === "income") incomeUSD += valueUSD;
      else expenseUSD += valueUSD;
    }
    return {
      income: incomeUSD * baseFx,
      expenses: expenseUSD * baseFx,
      balance: (incomeUSD - expenseUSD) * baseFx,
      txCount: transactions.length,
    };
  }, [transactions, rates, ratesLoaded, baseCurrency]);

  return (
    <div className="bg-background text-foreground h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border shrink-0">
          {/* Background dot grid */}
          <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
          {/* Subtle green radial glow at top-right */}
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none bg-[radial-gradient(ellipse,color-mix(in_oklch,var(--color-primary),transparent_94%)_0%,transparent_70%)] opacity-100" />

          <div className="max-w-7xl mx-auto w-full px-5 sm:px-8 py-6 sm:py-8 lg:py-10 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Session line */}
              <div className="flex items-center gap-2 mb-4">
                <span className="status-dot" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  session::
                </span>
                <span className="font-mono text-[10px] text-primary/70">
                  {userName}@devcents
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                {/* Per-wallet net worth */}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
                    net_worth (per wallet, locked rates)
                  </p>
                  {!wallets ? (
                    <div className="font-mono text-2xl text-muted-foreground">…</div>
                  ) : Object.keys(wallets).length === 0 ? (
                    <div className="font-mono text-sm text-muted-foreground">
                      no transactions yet
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-w-md">
                      {Object.entries(wallets)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([ccy, balance]) => (
                          <div
                            key={ccy}
                            className="flex items-baseline justify-between gap-4 border-l-2 border-border/40 pl-3"
                          >
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              {ccy}
                            </span>
                            <span
                              className={cn(
                                "font-mono text-2xl sm:text-3xl num-display tabular-nums",
                                balance < 0
                                  ? "text-destructive"
                                  : "text-foreground",
                              )}
                            >
                              {balance < 0 ? "-" : ""}
                              {fmt(balance, ccy)}
                            </span>
                          </div>
                        ))}
                      <div className="pt-2 mt-1 border-t border-border/30 flex items-baseline justify-between gap-4 pl-3">
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                          ≈ total at today's rate
                        </span>
                        <span className="font-mono text-sm text-muted-foreground tabular-nums">
                          {totalApproxBase < 0 ? "-" : ""}
                          {fmt(totalApproxBase, baseCurrency)}
                          <span className="ml-1.5 text-[9px] uppercase tracking-widest opacity-70">
                            {baseCurrency}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick badges */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Tag color={stats.balance >= 0 ? "green" : "red"}>
                    {stats.balance >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {stats.balance >= 0 ? "+" : "-"}
                    {fmt(stats.balance, baseCurrency)} net
                  </Tag>
                  <Tag color="muted">{stats.txCount} tx</Tag>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="border-b border-border shrink-0"
        >
          <div className="grid grid-cols-3">
            {/* Income */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 relative cursor-default border-r border-border group/stat transition-all duration-200 hover:bg-primary/5">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-primary/40 transition-all duration-200 group-hover/stat:w-[2px] group-hover/stat:bg-primary/70" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                inflow
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                <ArrowUpRight className="h-3 w-3 shrink-0 text-primary" />
                <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest hidden sm:inline text-primary">
                  income
                </span>
              </div>
              <p className="font-mono text-base sm:text-2xl lg:text-3xl num-display text-foreground">
                {fmt(stats.income, baseCurrency)}
              </p>
            </div>

            {/* Expenses */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 relative cursor-default border-r border-border group/stat transition-all duration-200 hover:bg-destructive/5">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-destructive/50 transition-all duration-200 group-hover/stat:w-[2px] group-hover/stat:bg-destructive/70" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                outflow
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                <ArrowDownRight className="h-3 w-3 shrink-0 text-destructive" />
                <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-destructive hidden sm:inline">
                  expenses
                </span>
              </div>
              <p className="font-mono text-base sm:text-2xl lg:text-3xl num-display text-foreground">
                {fmt(stats.expenses, baseCurrency)}
              </p>
            </div>

            {/* Net */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 relative cursor-default group/stat transition-all duration-200 hover:bg-muted/40">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-muted-foreground/50 transition-all duration-200 group-hover/stat:w-[2px] group-hover/stat:bg-muted-foreground/70" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                balance
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                <Wallet className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:inline">
                  net_pos
                </span>
              </div>
              <p
                className={`font-mono text-base sm:text-2xl lg:text-3xl num-display ${stats.balance < 0 ? "text-destructive" : "text-foreground"}`}
              >
                {stats.balance < 0 ? "-" : ""}
                {fmt(stats.balance, baseCurrency)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── MOBILE TABS ─────────────────────────────────────────────── */}
        <div className="md:hidden sticky z-30 border-b border-border bg-background shrink-0">
          <div className="flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-mono uppercase tracking-widest transition-colors border-b",
                    active
                      ? "text-primary border-primary/70"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── MOBILE CONTENT ──────────────────────────────────────────── */}
        <div className="md:hidden grow overflow-y-auto pb-10">
          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
                  // recent_activity
                </p>
                <TransactionList limit={5} compact />
              </motion.div>
            )}
            {activeTab === "transactions" && (
              <motion.div
                key="transactions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <TransactionList />
              </motion.div>
            )}
            {activeTab === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                <SpendingCharts />
              </motion.div>
            )}
            {activeTab === "planning" && (
              <motion.div
                key="planning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-5"
              >
                <Planning currentBalance={stats.balance} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── DESKTOP 2-COL ───────────────────────────────────────────── */}
        <div className="hidden md:flex grow border-b border-border min-h-0 relative">
          <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full pointer-events-none bg-[radial-gradient(ellipse,color-mix(in_oklch,var(--color-primary),transparent_92%)_0%,transparent_70%)]" />
          <div className="absolute -top-20 right-1/3 w-64 h-64 rounded-full pointer-events-none bg-[radial-gradient(ellipse,color-mix(in_oklch,var(--color-primary),transparent_96%)_0%,transparent_70%)]" />
          <div className="grid grid-cols-12 w-full h-full relative z-0">
            {/* Left: Charts (8 cols) */}
            <div className="col-span-8 flex flex-col border-r border-border h-full min-h-0 overflow-hidden">
              {/* Pane header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 bg-card/40 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {desktopLeftPane === "planning"
                      ? "plan.view"
                      : "analytics.view"}
                  </span>
                </div>
                <div className="flex items-center border border-border bg-card">
                  {(["analytics_category", "analytics_monthly", "planning"] as const).map((k) => {
                    const active = desktopLeftPane === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setDesktopLeftPane(k)}
                        className={cn(
                          "h-7 px-3 font-mono text-[10px] uppercase tracking-widest transition-colors border-r border-border last:border-r-0",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                        )}
                      >
                        {k === "analytics_category" ? "categories" : k === "analytics_monthly" ? "monthly" : "plan"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-6 lg:p-8 grow overflow-y-auto">
                {desktopLeftPane === "analytics_category" ? (
                  <SpendingCharts mode="category" />
                ) : desktopLeftPane === "analytics_monthly" ? (
                  <SpendingCharts mode="monthly" />
                ) : (
                  <Planning currentBalance={stats.balance} />
                )}
              </div>
            </div>

            {/* Right: Ledger (4 cols) */}
            <div className="col-span-4 flex flex-col bg-card/60 backdrop-blur-sm h-full min-h-0 overflow-hidden">
              {/* Pane header */}
              <div className="flex items-center justify-between px-4 py-5 sticky z-10 border-b border-border bg-card top-0 shrink-0">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    ledger.recent
                  </span>
                </div>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {stats.txCount}_records
                </span>
              </div>
              <div className="grow overflow-y-auto">
                <TransactionList />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE NAV ──────────────────────────────────────────────── */}
      <div className="md:hidden shrink-0">
        <MobileNav onTabChange={setActiveTab} activeTab={activeTab} />
      </div>
    </div>
  );
}
