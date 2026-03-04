import { useUser } from "@clerk/tanstack-react-start";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  ReceiptText,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { TransactionList } from "@/components/TransactionList";
import { SpendingCharts } from "@/components/SpendingCharts";
import { MobileNav } from "@/components/MobileNav";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatAmountOnly } from "@/lib/currencyUtils";

type MobileTab = "overview" | "transactions" | "analytics";

const TABS: { id: MobileTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "transactions", label: "Ledger", icon: ReceiptText },
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
  const { baseCurrency, convertAmount } = useCurrency();

  const stats = useMemo(() => {
    if (!transactions)
      return { balance: 0, income: 0, expenses: 0, txCount: 0 };
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + convertAmount(t.amount, t.currency || "USD"), 0);
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + convertAmount(t.amount, t.currency || "USD"), 0);
    return {
      balance: income - expenses,
      income,
      expenses,
      txCount: transactions.length,
    };
  }, [transactions, convertAmount, baseCurrency]);

  return (
    <div className="bg-background text-foreground min-h-dvh flex flex-col overflow-x-hidden">
      <main className="grow flex flex-col pb-16 md:pb-0">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Background dot grid */}
          <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
          {/* Subtle green radial glow at top-right */}
          <div
            className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
            }}
          />

          <div className="max-w-7xl mx-auto w-full px-5 sm:px-8 py-10 sm:py-14 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Session line */}
              <div className="flex items-center gap-2 mb-6">
                <span className="status-dot" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  session::
                </span>
                <span className="font-mono text-[10px] text-primary/70">
                  {userName}@devcents
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
                {/* Label */}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
                    net_worth
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span
                      className={`font-mono text-5xl sm:text-6xl lg:text-7xl num-display leading-none ${
                        stats.balance < 0
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                      style={
                        stats.balance >= 0
                          ? {
                              textShadow:
                                "0 0 30px hsl(var(--foreground) / 0.08)",
                            }
                          : {}
                      }
                    >
                      {stats.balance < 0 ? "-" : ""}
                      {fmt(stats.balance, baseCurrency)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground uppercase">
                      {baseCurrency}
                    </span>
                  </div>
                </div>

                {/* Quick badges */}
                <div className="flex flex-wrap gap-2">
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
          className="border-b border-border"
        >
          <div className="grid grid-cols-3">
            {/* Income */}
            <div className="px-3 sm:px-6 py-4 sm:py-5 relative cursor-default border-r border-border">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-primary/40" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                inflow
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3">
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
            <div className="px-3 sm:px-6 py-4 sm:py-5 relative cursor-default border-r border-border">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-destructive/50" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                outflow
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3">
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
            <div className="px-3 sm:px-6 py-4 sm:py-5 relative cursor-default">
              <div className="absolute left-0 top-3 bottom-3 w-px bg-muted-foreground/50" />
              <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                balance
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3">
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
        <div
          className="md:hidden sticky z-30 border-b border-border bg-background"
          style={{
            top: "48px",
          }}
        >
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
        <div className="md:hidden grow">
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
          </AnimatePresence>
        </div>

        {/* ── DESKTOP 2-COL ───────────────────────────────────────────── */}
        <div className="hidden md:flex grow border-b border-border">
          <div className="grid grid-cols-12 w-full">
            {/* Left: Charts (8 cols) */}
            <div className="col-span-8 flex flex-col border-r border-border">
              {/* Pane header */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  analytics.view
                </span>
              </div>
              <div className="p-6 lg:p-8 grow overflow-y-auto">
                <SpendingCharts />
              </div>
            </div>

            {/* Right: Ledger (4 cols) */}
            <div className="col-span-4 flex flex-col bg-card">
              {/* Pane header */}
              <div
                className="flex items-center justify-between px-5 py-3 sticky z-10 border-b border-border bg-card"
                style={{
                  top: "48px",
                }}
              >
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
      </main>

      {/* ── MOBILE NAV ──────────────────────────────────────────────── */}
      <div className="md:hidden">
        <MobileNav onTabChange={setActiveTab} activeTab={activeTab} />
      </div>
    </div>
  );
}
