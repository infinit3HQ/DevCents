import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const STATS = [
  { label: "INFLOW", value: "6,240.00", tone: "text-primary", Icon: ArrowUpRight },
  { label: "OUTFLOW", value: "3,918.42", tone: "text-red-400", Icon: ArrowDownRight },
] as const;

const CATEGORIES = [
  { name: "housing", pct: 42 },
  { name: "food", pct: 21 },
  { name: "transport", pct: 14 },
  { name: "subscriptions", pct: 9 },
  { name: "other", pct: 14 },
] as const;

const LEDGER = [
  { date: "11-19", desc: "Grocery run", cat: "food", amount: "-84.20" },
  { date: "11-18", desc: "Salary", cat: "income", amount: "+3,120.00" },
  { date: "11-17", desc: "Metro card", cat: "transport", amount: "-30.00" },
  { date: "11-15", desc: "Streaming", cat: "subscriptions", amount: "-15.99" },
] as const;

/** Static, data-filled mock of the signed-in dashboard for the hero. */
export function DashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative border border-border bg-card shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] select-none"
    >
      <div className="flex items-center justify-between border-b border-border px-4 h-9">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="status-dot" />
          session::<span className="normal-case tracking-normal text-primary/80">you@devcents</span>
        </div>
        <div className="flex items-center gap-1.5 border border-primary/25 bg-primary/5 px-2 h-5 text-primary font-mono text-[10px] uppercase tracking-widest">
          <ShieldCheck className="h-2.5 w-2.5" /> enc::aes-256
        </div>
      </div>

      <div className="px-5 pt-5 pb-4 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          net_worth
        </p>
        <p className="mt-1 num-display text-4xl md:text-5xl font-medium">
          12,480<span className="text-muted-foreground">.32</span>
          <span className="ml-2 text-xs text-muted-foreground tracking-normal">USD</span>
        </p>
      </div>

      <div className="grid grid-cols-2 border-b border-border">
        {STATS.map(({ label, value, tone, Icon }, i) => (
          <div key={label} className={cn("px-5 py-3", i === 0 && "border-r border-border")}>
            <p className={cn("flex items-center gap-1 font-mono text-[10px] tracking-[0.2em]", tone)}>
              <Icon className="h-3 w-3" /> {label}
            </p>
            <p className="mt-1 num-display text-lg">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-b border-border space-y-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          analytics.categories
        </p>
        {CATEGORIES.map(({ name, pct }, i) => (
          <div key={name} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 font-mono text-[11px]">
            <span className="text-muted-foreground truncate">{name}</span>
            <div className="h-1.5 bg-muted">
              <motion.div
                className="h-full bg-primary"
                style={{ opacity: 1 - i * 0.15 }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, delay: 0.6 + i * 0.08, ease: "easeOut" }}
              />
            </div>
            <span className="text-right num-display">{pct}%</span>
          </div>
        ))}
      </div>

      <ul className="divide-y divide-border font-mono text-[11px]">
        {LEDGER.map((row) => (
          <li key={row.date + row.desc} className="grid grid-cols-[3rem_1fr_auto] gap-3 px-5 py-2">
            <span className="text-muted-foreground">{row.date}</span>
            <span className="truncate">
              {row.desc} <span className="text-muted-foreground">#{row.cat}</span>
            </span>
            <span className={cn("num-display", row.amount.startsWith("+") ? "text-primary" : "")}>
              {row.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
