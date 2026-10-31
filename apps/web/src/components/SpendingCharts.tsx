import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatAmountOnly, getCurrencySymbol } from "@/lib/currencyUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS, getCategoryLabel, isTransferCategory, normalizeCategory } from "@/lib/categoryUtils";
import { cn } from "@/lib/utils";
import { useLedgerFilter } from "@/contexts/LedgerFilterContext";
import { CategoryBudgets } from "@/components/CategoryBudgets";
import { DAY_MS } from "@/lib/planningUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerField } from "@/components/ui/date-picker-field";
import type { LucideIcon } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "0px",
  color: "var(--color-popover-foreground)",
  fontSize: "10px",
  fontFamily: "var(--font-mono)",
  boxShadow:
    "4px 4px 0px 0px color-mix(in oklch, var(--color-foreground), transparent 99%)",
  padding: "8px 12px",
};

type TimePeriod = "day" | "week" | "month" | "custom" | "all";

type CategorySlice = {
  key: string;
  name: string;
  value: number;
  /** Spend in the matching slice of the previous period; null for "all". */
  prev: number | null;
  fill: string;
  Icon: LucideIcon;
};

type DisplaySlice = CategorySlice & { members?: CategorySlice[] };

const SMALL_SLICE_PCT = 2;
const SMALL_GROUP_KEY = "__small";
const SMALL_GROUP_COLOR = "#4b5563";

function ChangeBadge({ value, prev, prevLabel, formatPrev }: { value: number; prev: number | null; prevLabel: string | null; formatPrev: (n: number) => string }) {
  if (prev === null || !prevLabel) return null;
  let text: string;
  let tone: string;
  if (prev <= 0) {
    text = value > 0 ? "new" : "–";
    tone = "text-muted-foreground";
  } else {
    const pct = ((value - prev) / prev) * 100;
    if (Math.abs(pct) < 1) {
      text = "±0%";
      tone = "text-muted-foreground";
    } else {
      // Spending more is bad (red), spending less is good (green).
      text = `${pct > 0 ? "▲" : "▼"}${Math.min(Math.round(Math.abs(pct)), 999)}%`;
      tone = pct > 0 ? "text-destructive/80" : "text-primary/80";
    }
  }
  return (
    <span className={cn("w-12 text-right tabular-nums shrink-0", tone)} title={`${prevLabel}: ${formatPrev(prev)}`}>
      {text}
    </span>
  );
}

function LegendRow({
  entry,
  index,
  total,
  currencySymbol,
  baseCurrency,
  prevLabel,
  active,
  dimmed,
  expanded,
  onClick,
}: {
  entry: DisplaySlice;
  index: number;
  total: number;
  currencySymbol: string;
  baseCurrency: string;
  prevLabel: string | null;
  active: boolean;
  dimmed: boolean;
  /** Set for the expandable "smaller categories" row. */
  expanded?: boolean;
  onClick: () => void;
}) {
  const rawPct = total > 0 ? (entry.value / total) * 100 : 0;
  const pctLabel = rawPct > 0 && rawPct < 1 ? "<1" : String(Math.round(rawPct));
  const amount = `${currencySymbol}${formatAmountOnly(entry.value, baseCurrency)}`;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: dimmed ? 0.45 : 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.03 }}
      onClick={onClick}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      className={cn(
        "w-full flex items-center gap-2 font-mono text-[10px] group min-w-0 px-1.5 py-1.5 text-left transition-colors border-l-2",
        active ? "bg-primary/10 border-l-primary" : "border-l-transparent hover:bg-muted/40",
      )}
      title={`${entry.name}: ${amount}`}
    >
      <div className="w-2.5 h-2.5 shrink-0 transition-transform group-hover:scale-125" style={{ background: entry.fill }} />
      <entry.Icon className="h-3 w-3 shrink-0" style={{ color: entry.fill }} />
      <span className="uppercase tracking-wider text-muted-foreground truncate group-hover:text-foreground">
        {entry.name}
      </span>
      {expanded !== undefined && <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" />}
      <span className="ml-auto tabular-nums text-muted-foreground/70 shrink-0 hidden @xs:inline">{amount}</span>
      <ChangeBadge
        value={entry.value}
        prev={entry.prev}
        prevLabel={prevLabel}
        formatPrev={(n) => `${currencySymbol}${formatAmountOnly(n, baseCurrency)}`}
      />
      <span className="w-9 text-right tabular-nums text-foreground/70 shrink-0">{pctLabel}%</span>
    </motion.button>
  );
}

const TIME_PERIODS: { id: TimePeriod; label: string }[] = [
  { id: "day", label: "today" },
  { id: "week", label: "week" },
  { id: "month", label: "month" },
  { id: "all", label: "all" },
];

function getStartOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function toDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SpendingChartsProps {
  mode?: "all" | "category" | "monthly";
}

export function SpendingCharts({ mode = "all" }: SpendingChartsProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInput(d.getTime());
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInput(Date.now()));
  
  const [smallExpanded, setSmallExpanded] = useState(false);
  const { filter: ledgerFilter, setFilter: setLedgerFilter } = useLedgerFilter();
  const transactions = useDecryptedTransactions();
  const { baseCurrency, convertAmount } = useCurrency();
  const currencySymbol = getCurrencySymbol(baseCurrency);

  // Current period plus the matching slice of the previous period, so
  // "this month so far" compares against the same number of days last month.
  const range = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    if (timePeriod === "day") {
      const start = getStartOfDay(now);
      const prevStart = new Date(y, m, d - 1).getTime();
      return { start, end: Infinity, prevStart, prevEnd: prevStart + (nowMs - start), label: "today", prevLabel: "yesterday" };
    }
    if (timePeriod === "week") {
      const day = now.getDay();
      const monday = d - day + (day === 0 ? -6 : 1);
      const start = new Date(y, m, monday).getTime();
      const prevStart = new Date(y, m, monday - 7).getTime();
      return { start, end: Infinity, prevStart, prevEnd: prevStart + (nowMs - start), label: "this week", prevLabel: "last week" };
    }
    if (timePeriod === "month") {
      const start = new Date(y, m, 1).getTime();
      const prevStart = new Date(y, m - 1, 1).getTime();
      const prevEnd = Math.min(prevStart + (nowMs - start), start - 1);
      return { start, end: Infinity, prevStart, prevEnd, label: "this month", prevLabel: "last month" };
    }
    if (timePeriod === "custom") {
      const start = getStartOfDay(new Date(customStart));
      const end = getStartOfDay(new Date(customEnd)) + DAY_MS - 1;
      const length = end - start + 1;
      return { start, end, prevStart: start - length, prevEnd: start - 1, label: "selected range", prevLabel: "previous range" };
    }
    return { start: 0, end: Infinity, prevStart: null, prevEnd: null, label: "all time", prevLabel: null };
  }, [timePeriod, customStart, customEnd]);

  const filteredTransactions = useMemo(() => {
    if (!transactions?.length) return [];
    return transactions.filter((t) => t.date >= range.start && t.date <= range.end);
  }, [transactions, range]);

  const prevByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    if (!transactions?.length || range.prevStart === null || range.prevEnd === null) return out;
    for (const t of transactions) {
      if (t.type !== "expense" || t.date < range.prevStart || t.date > range.prevEnd) continue;
      if (isTransferCategory(t.category, t.type)) continue;
      const key = normalizeCategory(t.category, "expense");
      out[key] = (out[key] ?? 0) + convertAmount(t.amount, t.currency || "USD");
    }
    return out;
  }, [transactions, range, convertAmount]);

  const categoryData = useMemo((): CategorySlice[] => {
    if (!filteredTransactions?.length) return [];
    const byCategory: Record<string, number> = {};
    for (const t of filteredTransactions) {
      if (t.type === "expense" && !isTransferCategory(t.category, t.type)) {
        const converted = convertAmount(t.amount, t.currency || "USD");
        // Merge legacy free-text values ("Food and Dining") into one slice.
        const key = normalizeCategory(t.category, "expense");
        byCategory[key] = (byCategory[key] ?? 0) + converted;
      }
    }
    const hasPrev = range.prevStart !== null;
    return Object.entries(byCategory)
      .map(([key, value]) => ({
        name: getCategoryLabel(key, "expense"),
        key,
        value: Math.round(value * 100) / 100,
        prev: hasPrev ? Math.round((prevByCategory[key] ?? 0) * 100) / 100 : null,
        fill: CATEGORY_COLORS[key] ?? CATEGORY_COLORS.other,
        Icon: (CATEGORY_ICONS[key] ?? CATEGORY_ICONS.other) as LucideIcon,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, convertAmount, prevByCategory, range.prevStart]);

  const totalExpenses = categoryData.reduce((s, d) => s + d.value, 0);

  // Fold categories under SMALL_SLICE_PCT into one expandable row, but only
  // when there are at least two of them (folding one row saves nothing).
  const displayData = useMemo((): DisplaySlice[] => {
    if (totalExpenses <= 0) return categoryData;
    const small = categoryData.filter((c) => (c.value / totalExpenses) * 100 < SMALL_SLICE_PCT);
    if (small.length < 2) return categoryData;
    const big = categoryData.filter((c) => !small.includes(c));
    const value = small.reduce((s, c) => s + c.value, 0);
    const prev = small.every((c) => c.prev === null) ? null : small.reduce((s, c) => s + (c.prev ?? 0), 0);
    return [
      ...big,
      {
        key: SMALL_GROUP_KEY,
        name: `${small.length} smaller categories`,
        value: Math.round(value * 100) / 100,
        prev,
        fill: SMALL_GROUP_COLOR,
        Icon: Layers as LucideIcon,
        members: small,
      },
    ];
  }, [categoryData, totalExpenses]);

  const selectCategory = (key: string) => {
    if (ledgerFilter?.category === key && ledgerFilter.type === "expense") {
      setLedgerFilter(null);
      return;
    }
    setLedgerFilter({
      category: key,
      type: "expense",
      start: range.start,
      end: range.end,
      periodLabel: range.label,
    });
  };

  const monthlyData = useMemo(() => {
    if (!filteredTransactions?.length) return [];
    const byMonth: Record<string, { income: number; expenses: number }> = {};
    for (const t of filteredTransactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
      if (isTransferCategory(t.category, t.type)) continue;

      const converted = convertAmount(t.amount, t.currency || "USD");
      if (t.type === "income") byMonth[key].income += converted;
      else byMonth[key].expenses += converted;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => {
        const [year, m] = month.split("-");
        const label = new Date(parseInt(year), parseInt(m) - 1).toLocaleString(
          "default",
          { month: "short" },
        );
        return {
          name: `${label}'${year.slice(2)}`,
          income: Math.round(data.income * 100) / 100,
          expenses: Math.round(data.expenses * 100) / 100,
        };
      });
  }, [filteredTransactions, convertAmount, baseCurrency]);

  if (!transactions?.length)
    return (
      <div className="py-16 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span className="text-primary">{currencySymbol}</span> no data — add
        transactions
      </div>
    );

  const activeKey =
    ledgerFilter?.type === "expense" && ledgerFilter.start === range.start && ledgerFilter.end === range.end
      ? ledgerFilter.category
      : null;

  const handleSliceClick = (entry: DisplaySlice) => {
    if (entry.key === SMALL_GROUP_KEY) setSmallExpanded((v) => !v);
    else selectCategory(entry.key);
  };

  const showCategory = mode === "all" || mode === "category";
  const showMonthly = mode === "all" || mode === "monthly";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="space-y-5"
    >
      {/* Time Period Filter */}
      {showCategory && (
        <div className="flex items-center gap-2">
          <div className="flex items-center flex-1 border border-border bg-background/40">
            {TIME_PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setTimePeriod(p.id)}
                className={[
                  "flex-1 h-9 px-3 border-r last:border-r-0 border-border",
                  "font-mono text-[10px] uppercase tracking-widest transition-colors",
                  timePeriod === p.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                ].join(" ")}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className={[
                  "h-9 w-9 border border-border flex items-center justify-center transition-colors",
                  timePeriod === "custom"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                ].join(" ")}
              >
                <CalendarRange className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto p-4 border border-border bg-card rounded-none"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                // custom_range
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
                    from
                  </p>
                  <DatePickerField
                    value={customStart}
                    onChange={(v) => {
                      setCustomStart(v);
                      setTimePeriod("custom");
                    }}
                    label="Start date"
                    className="rounded-none"
                  />
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
                    to
                  </p>
                  <DatePickerField
                    value={customEnd}
                    onChange={(v) => {
                      setCustomEnd(v);
                      setTimePeriod("custom");
                    }}
                    label="End date"
                    className="rounded-none"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* No data for period */}
      {showCategory && categoryData.length === 0 && (
        <div className="py-12 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground border border-border bg-card">
          no expenses for this period
        </div>
      )}

      {/* Category Pie */}
      {showCategory && categoryData.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="p-5 border border-border bg-card"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
            // spending_by_category
          </p>

          {/* ── Horizontal spending breakdown bar ── */}
          <div className="mb-5">
            <div className="h-2.5 w-full flex overflow-hidden">
              {displayData.map((entry, i) => {
                const pct = totalExpenses > 0 ? (entry.value / totalExpenses) * 100 : 0;
                return (
                  <motion.button
                    type="button"
                    key={entry.key}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                    onClick={() => handleSliceClick(entry)}
                    className={cn(
                      "h-full transition-opacity hover:opacity-80 cursor-pointer",
                      activeKey && activeKey !== entry.key && "opacity-30",
                    )}
                    style={{ backgroundColor: entry.fill, minWidth: pct > 0 ? "3px" : 0 }}
                    title={`${entry.name}: ${pct.toFixed(1)}%`}
                    aria-label={`${entry.name} ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Pie chart ── */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={600}
                >
                  {displayData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.fill}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                      opacity={activeKey && activeKey !== entry.key ? 0.3 : 1}
                      onClick={() => handleSliceClick(entry)}
                      className="hover:opacity-80 transition-opacity duration-200 cursor-pointer outline-none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: "var(--color-foreground)" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: number, _name: string) => {
                    return [
                      `${currencySymbol}${formatAmountOnly(v ?? 0, baseCurrency)}`,
                      _name,
                    ];
                  }) as any}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
              <div className="text-center w-full">
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                  total
                </p>
                <p 
                  className={cn(
                    "font-mono num-display text-foreground leading-none tracking-tight",
                    totalExpenses >= 1000000 ? "text-base" : "text-lg"
                  )}
                  title={`${currencySymbol}${formatAmountOnly(totalExpenses, baseCurrency)}`}
                >
                  {totalExpenses >= 10000000 ? (
                    // Use compact notation for extremely large values (10M+)
                    new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                      style: 'currency',
                      currency: baseCurrency || 'USD'
                    }).format(totalExpenses)
                  ) : (
                    `${currencySymbol}${formatAmountOnly(totalExpenses, baseCurrency)}`
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Legend ── */}
          <div className="flex items-center justify-between gap-3 mt-4 mb-2 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <span>click a category to filter the ledger</span>
            {range.prevLabel && <span className="shrink-0">change vs {range.prevLabel}</span>}
          </div>
          <div className="@container">
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-6 gap-y-0.5">
              {displayData.map((e, i) => {
                const isGroup = e.key === SMALL_GROUP_KEY;
                return (
                  <div key={e.key} className={cn(isGroup && "@3xl:col-span-2")}>
                    <LegendRow
                      entry={e}
                      index={i}
                      total={totalExpenses}
                      currencySymbol={currencySymbol}
                      baseCurrency={baseCurrency}
                      prevLabel={range.prevLabel}
                      active={activeKey === e.key}
                      dimmed={!!activeKey && activeKey !== e.key && !(isGroup && e.members?.some((m) => m.key === activeKey))}
                      expanded={isGroup ? smallExpanded : undefined}
                      onClick={() => handleSliceClick(e)}
                    />
                    {isGroup && smallExpanded && (
                      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-6 gap-y-0.5 pl-5 border-l border-border/60 ml-1 mb-1">
                        {e.members!.map((m, j) => (
                          <LegendRow
                            key={m.key}
                            entry={m}
                            index={j}
                            total={totalExpenses}
                            currencySymbol={currencySymbol}
                            baseCurrency={baseCurrency}
                            prevLabel={range.prevLabel}
                            active={activeKey === m.key}
                            dimmed={!!activeKey && activeKey !== m.key}
                            onClick={() => selectCategory(m.key)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {showCategory && <CategoryBudgets />}

      {/* Monthly Overview */}
      {showMonthly && monthlyData.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-5 border border-border bg-card"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
            // monthly_overview
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={3} barCategoryGap="32%">
              <CartesianGrid
                strokeDasharray="2 2"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${currencySymbol}${formatAmountOnly(v, baseCurrency)}`}
                dx={-4}
                width={52}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: any) => [
                  `${currencySymbol}${formatAmountOnly(Number(v) ?? 0, baseCurrency)}`,
                ]}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  color: "var(--color-muted-foreground)",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  paddingTop: "8px",
                  letterSpacing: "0.1em",
                }}
              />
              <Bar
                dataKey="income"
                fill="var(--color-primary)"
                radius={[2, 2, 0, 0]}
                name="income"
                className="hover:opacity-80 transition-opacity duration-200 cursor-pointer"
              />
              <Bar
                dataKey="expenses"
                fill="var(--color-destructive)"
                radius={[2, 2, 0, 0]}
                name="expenses"
                className="hover:opacity-80 transition-opacity duration-200 cursor-pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </motion.div>
  );
}
