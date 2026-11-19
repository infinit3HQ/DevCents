import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, PiggyBank, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmountOnly } from "@/lib/currencyUtils";
import type { WalletBalances } from "@/lib/walletBalances";

export type PeriodStats = { income: number; expenses: number; net: number };

interface DashboardSummaryProps {
  userName: string;
  wallets: WalletBalances | null;
  totalBase: number;
  baseCurrency: string;
  month: PeriodStats | null;
  monthLabel: string;
  /** Entries left out of the totals because their amount couldn't be read. */
  hiddenCount?: number;
  vaultLocked?: boolean;
}

const fmt = (n: number, code: string) => formatAmountOnly(Math.abs(n), code);

function NetWorth({ wallets, totalBase, baseCurrency }: Pick<DashboardSummaryProps, "wallets" | "totalBase" | "baseCurrency">) {
  if (!wallets) {
    return <div className="mt-2 h-12 w-56 bg-muted animate-pulse" aria-label="Loading net worth" />;
  }
  const entries = Object.entries(wallets).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return (
      <p className="mt-2 font-sans text-sm text-muted-foreground">
        No transactions yet. Add your first one with <span className="text-primary">New</span>.
      </p>
    );
  }
  const multiCurrency = entries.length > 1 || entries[0][0] !== baseCurrency;

  return (
    <>
      <p
        className={cn(
          "mt-1 font-mono text-4xl sm:text-5xl lg:text-6xl num-display",
          totalBase < 0 ? "text-destructive" : "text-foreground",
        )}
      >
        {totalBase < 0 ? "-" : ""}
        {fmt(totalBase, baseCurrency)}
        <span className="ml-2 text-xs tracking-widest text-muted-foreground">{baseCurrency}</span>
      </p>
      {multiCurrency && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
          {entries.map(([ccy, balance]) => (
            <span key={ccy} className="text-muted-foreground">
              {ccy}{" "}
              <span className={cn("num-display", balance < 0 ? "text-destructive" : "text-foreground")}>
                {balance < 0 ? "-" : ""}
                {fmt(balance, ccy)}
              </span>
            </span>
          ))}
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            · total at today’s rates
          </span>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  currency,
  Icon,
  tone,
  note,
  bordered,
}: {
  label: string;
  value: number | null;
  currency: string;
  Icon: LucideIcon;
  tone: "primary" | "destructive" | "muted";
  note?: string;
  bordered?: boolean;
}) {
  const toneText = { primary: "text-primary", destructive: "text-destructive", muted: "text-muted-foreground" }[tone];
  const toneBar = { primary: "bg-primary/40", destructive: "bg-destructive/50", muted: "bg-muted-foreground/50" }[tone];
  return (
    <div className={cn("relative px-4 sm:px-6 py-3 sm:py-4", bordered && "border-r border-border")}>
      <div className={cn("absolute left-0 top-3 bottom-3 w-px", toneBar)} />
      <p className={cn("flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider sm:tracking-[0.2em] whitespace-nowrap", toneText)}>
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      {value === null ? (
        <div className="mt-2 h-7 w-24 bg-muted animate-pulse" />
      ) : (
        <p className="mt-1 font-mono text-base sm:text-2xl lg:text-3xl num-display text-foreground">
          {value < 0 ? "-" : ""}
          {fmt(value, currency)}
        </p>
      )}
      {note && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Net worth plus this month's income, spending and savings. */
function HiddenEntriesNotice({ count, locked }: { count: number; locked: boolean }) {
  if (count === 0) return null;
  const noun = count === 1 ? "entry" : "entries";
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[11px] text-amber-400">
      <span>
        {locked
          ? `${count} encrypted ${noun} locked and not counted in these totals.`
          : `${count} ${noun} couldn't be decrypted and aren't counted in these totals.`}
      </span>
      {locked && (
        <button
          type="button"
          onClick={() => document.dispatchEvent(new CustomEvent("open-unlock"))}
          className="underline underline-offset-2 hover:text-amber-300"
        >
          Unlock
        </button>
      )}
    </div>
  );
}

export function DashboardSummary({
  userName,
  wallets,
  totalBase,
  baseCurrency,
  month,
  monthLabel,
  hiddenCount = 0,
  vaultLocked = false,
}: DashboardSummaryProps) {
  const savingsRate =
    month && month.income > 0 ? Math.round((month.net / month.income) * 100) : null;

  return (
    <>
      <section className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none bg-[radial-gradient(ellipse,color-mix(in_oklch,var(--color-primary),transparent_94%)_0%,transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 px-4 sm:px-6 py-5 sm:py-7"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="status-dot" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">session::</span>
            <span className="font-mono text-[10px] text-primary">{userName}@devcents</span>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">net worth</p>
          <NetWorth wallets={wallets} totalBase={totalBase} baseCurrency={baseCurrency} />
          <HiddenEntriesNotice count={hiddenCount} locked={vaultLocked} />
        </motion.div>
      </section>

      <div className="grid grid-cols-3 border-b border-border shrink-0">
        <Stat label={`income · ${monthLabel}`} value={month?.income ?? null} currency={baseCurrency} Icon={ArrowUpRight} tone="primary" bordered />
        <Stat label={`spent · ${monthLabel}`} value={month?.expenses ?? null} currency={baseCurrency} Icon={ArrowDownRight} tone="destructive" bordered />
        <Stat
          label={`saved · ${monthLabel}`}
          value={month?.net ?? null}
          currency={baseCurrency}
          Icon={PiggyBank}
          tone="muted"
          note={savingsRate !== null ? `${savingsRate}% of income` : undefined}
        />
      </div>
    </>
  );
}
