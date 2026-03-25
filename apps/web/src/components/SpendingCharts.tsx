import { useMemo } from "react";
import { motion } from "framer-motion";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencyUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/categoryUtils";
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

interface SpendingChartsProps {
  mode?: "all" | "category" | "monthly";
}

export function SpendingCharts({ mode = "all" }: SpendingChartsProps) {
  const transactions = useDecryptedTransactions();
  const { baseCurrency, convertAmount } = useCurrency();
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const categoryData = useMemo(() => {
    if (!transactions?.length) return [];
    const byCategory: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === "expense") {
        const converted = convertAmount(t.amount, t.currency || "USD");
        byCategory[t.category] = (byCategory[t.category] ?? 0) + converted;
      }
    }
    return Object.entries(byCategory)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        key: name,
        value: Math.round(value * 100) / 100,
        fill: CATEGORY_COLORS[name] ?? CATEGORY_COLORS.other,
        Icon: (CATEGORY_ICONS[name] ?? CATEGORY_ICONS.other) as LucideIcon,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, convertAmount]);

  const monthlyData = useMemo(() => {
    if (!transactions?.length) return [];
    const byMonth: Record<string, { income: number; expenses: number }> = {};
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };

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
  }, [transactions, convertAmount, baseCurrency]);

  if (!transactions?.length)
    return (
      <div className="py-16 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span className="text-primary">{currencySymbol}</span> no data — add
        transactions
      </div>
    );

  const totalExpenses = categoryData.reduce((s, d) => s + d.value, 0);

  const showCategory = mode === "all" || mode === "category";
  const showMonthly = mode === "all" || mode === "monthly";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="space-y-5"
    >
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
              {categoryData.map((entry, i) => {
                const pct = totalExpenses > 0 ? (entry.value / totalExpenses) * 100 : 0;
                return (
                  <motion.div
                    key={entry.key}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                    className="h-full transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ backgroundColor: entry.fill, minWidth: pct > 0 ? "3px" : 0 }}
                    title={`${entry.name}: ${pct.toFixed(1)}%`}
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
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={600}
                >
                  {categoryData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.fill}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                      className="hover:opacity-80 transition-opacity duration-200 cursor-pointer"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: "var(--color-foreground)" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: number, _name: string) => {
                    return [
                      `${currencySymbol}${(v ?? 0).toFixed(2)}`,
                      _name,
                    ];
                  }) as any}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
                  total
                </p>
                <p className="font-mono text-lg num-display text-foreground leading-tight">
                  {currencySymbol}{totalExpenses.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Legend ── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-4">
            {categoryData.map((e, i) => {
              const pct = totalExpenses > 0 ? Math.round((e.value / totalExpenses) * 100) : 0;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04 }}
                  className="flex items-center gap-2 font-mono text-[10px] group cursor-default"
                >
                  <div
                    className="w-2.5 h-2.5 shrink-0 transition-transform group-hover:scale-125"
                    style={{ background: e.fill }}
                  />
                  <span className="text-muted-foreground/80"><e.Icon className="h-3 w-3" style={{ color: e.fill }} /></span>
                  <span className="uppercase tracking-wider text-muted-foreground truncate">
                    {e.name}
                  </span>
                  <span className="ml-auto tabular-nums text-foreground/70 shrink-0">
                    {pct}%
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

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
                tickFormatter={(v) => `${currencySymbol}${v}`}
                dx={-4}
                width={52}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: number | undefined) => [
                  `${currencySymbol}${(v ?? 0).toFixed(2)}`,
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
