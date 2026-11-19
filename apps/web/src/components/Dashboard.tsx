import { useUser } from "@clerk/tanstack-react-start";
import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReceiptText, BarChart3 } from "lucide-react";

import { TransactionList } from "@/components/TransactionList";
import { SpendingCharts } from "@/components/SpendingCharts";
import { DashboardSummary } from "@/components/DashboardSummary";
import { Segmented } from "@/components/ui/segmented";
import { MobileNav } from "@/components/MobileNav";
import { Planning } from "@/components/Planning";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useEncryption } from "@/contexts/EncryptionContext";
import { isTransferCategory } from "@/lib/categoryUtils";
import { LedgerFilterContext, type LedgerFilter } from "@/contexts/LedgerFilterContext";

type MobileTab = "overview" | "transactions" | "planning" | "analytics";
type DesktopLeftPane = "analytics_category" | "analytics_monthly" | "planning";

export function Dashboard() {
  const { user } = useUser();
  const userName = user?.firstName ?? "user";
  const transactions = useDecryptedTransactions();
  const [activeTab, setActiveTab] = useState<MobileTab>("overview");
  const [desktopLeftPane, setDesktopLeftPane] =
    useState<DesktopLeftPane>("analytics_category");
  const { baseCurrency, computeBalances, convertLocked, rates, ratesLoaded } = useCurrency();
  const { isEnabled: isEncryptionOn, isUnlocked: isVaultUnlocked } = useEncryption();
  const [ledgerFilter, setLedgerFilterState] = useState<LedgerFilter | null>(null);
  // Selecting a category in the chart filters the ledger. On mobile the
  // ledger is a separate tab, so jump to it.
  const setLedgerFilter = useCallback((filter: LedgerFilter | null) => {
    setLedgerFilterState(filter);
    if (filter && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setActiveTab("transactions");
    }
  }, []);
  const ledgerFilterValue = useMemo(
    () => ({ filter: ledgerFilter, setFilter: setLedgerFilter }),
    [ledgerFilter, setLedgerFilter],
  );

  // Per-wallet native balances via the greedy-spillover walk. Stable —
  // doesn't drift when fxratesapi rates move because wallet amounts are
  // in their own currencies.
  // Rows whose amount we couldn't decrypt are left out of every total and
  // reported instead, so a locked vault never shows a silently low number.
  const readable = useMemo(
    () => transactions?.filter((t) => !t.undecryptable),
    [transactions],
  );
  const hiddenCount = (transactions?.length ?? 0) - (readable?.length ?? 0);

  const wallets = useMemo(() => {
    if (!readable) return null;
    return computeBalances(readable);
  }, [readable, computeBalances]);

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

  // This month's totals use the rate locked on each row (today's rate as
  // fallback), the same conversion the charts use, so the numbers agree.
  const monthStats = useMemo(() => {
    const totals = { income: 0, expenses: 0, net: 0 };
    if (!readable || !ratesLoaded) return totals;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    for (const t of readable) {
      // Own-money moves (bank → cash) aren't income or spending.
      if (t.date < monthStart || isTransferCategory(t.category, t.type)) continue;
      const value = convertLocked(t.amount, t.currency || "USD", t.rateToUSD);
      if (t.type === "income") totals.income += value;
      else totals.expenses += value;
    }
    return { ...totals, net: totals.income - totals.expenses };
  }, [readable, ratesLoaded, convertLocked]);

  const monthLabel = new Date().toLocaleString("default", { month: "short" }).toLowerCase();

  return (
    <LedgerFilterContext.Provider value={ledgerFilterValue}>
    <div className="bg-background text-foreground h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardSummary
          userName={userName}
          wallets={wallets}
          totalBase={totalApproxBase}
          baseCurrency={baseCurrency}
          month={ratesLoaded && transactions ? monthStats : null}
          monthLabel={monthLabel}
          hiddenCount={hiddenCount}
          vaultLocked={isEncryptionOn && !isVaultUnlocked}
        />

        {/* ── MOBILE CONTENT ──────────────────────────────────────────── */}
        <div className="md:hidden grow overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
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
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
                  // recent activity
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
                <Planning currentBalance={totalApproxBase} />
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
                      ? "plan"
                      : "spending"}
                  </span>
                </div>
                <Segmented
                  label="Left panel"
                  value={desktopLeftPane}
                  onValueChange={setDesktopLeftPane}
                  options={[
                    { value: "analytics_category", label: "categories" },
                    { value: "analytics_monthly", label: "monthly" },
                    { value: "planning", label: "plan" },
                  ]}
                />
              </div>
              <div className="p-6 lg:p-8 grow overflow-y-auto">
                {desktopLeftPane === "analytics_category" ? (
                  <SpendingCharts mode="category" />
                ) : desktopLeftPane === "analytics_monthly" ? (
                  <SpendingCharts mode="monthly" />
                ) : (
                  <Planning currentBalance={totalApproxBase} />
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
                    transactions
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {transactions?.length ?? 0} entries
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
    </LedgerFilterContext.Provider>
  );
}
