import { useMemo } from "react";
import { motion } from "framer-motion";
import { useDecryptedTransactions } from "@/hooks/useDecryptedTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencyUtils";
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

// Phosphor-style palette: Monochrome terminal green gradations
const CAT_COLORS: Record<string, string> = {
  housing: "var(--color-primary)",
  food: "var(--color-primary)",
  transportation: "var(--color-primary)",
  utilities: "var(--color-primary)",
  entertainment: "var(--color-primary)",
  shopping: "var(--color-primary)",
  health: "var(--color-primary)",
  education: "var(--color-primary)",
  personal: "var(--color-primary)",
  other: "var(--color-primary)",
};

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

export function SpendingCharts() {
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
        value: Math.round(value * 100) / 100,
        fill: CAT_COLORS[name] ?? CAT_COLORS.other,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="space-y-5"
    >
      {/* Category Pie */}
      {categoryData.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="p-5 border border-border bg-card"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
            // spending_by_category
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
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
                itemStyle={{ color: "var(--color-primary)" }}
                formatter={(v: number | undefined) => [
                  `${currencySymbol}${(v ?? 0).toFixed(2)}`,
                  "amount",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-center">
            {categoryData.map((e, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
              >
                <div className="w-2 h-2" style={{ background: e.fill }} />
                {e.name}
                <span className="opacity-60">
                  {totalExpenses > 0
                    ? Math.round((e.value / totalExpenses) * 100)
                    : 0}
                  %
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Monthly Overview */}
      {monthlyData.length > 0 && (
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
