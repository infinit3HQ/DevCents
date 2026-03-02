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

// Phosphor-style palette: green → cyan → white gradations
const CAT_COLORS: Record<string, string> = {
  housing: "hsl(142 60% 52%)",
  food: "hsl(162 55% 48%)",
  transportation: "hsl(180 50% 46%)",
  utilities: "hsl(200 48% 50%)",
  entertainment: "hsl(220 40% 55%)",
  shopping: "hsl(240 30% 55%)",
  health: "hsl(130 50% 45%)",
  education: "hsl(100 40% 48%)",
  personal: "hsl(155 45% 50%)",
  other: "hsl(0 0% 40%)",
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(0 0% 8%)",
  border: "1px solid hsl(0 0% 16%)",
  borderRadius: "0px",
  color: "hsl(120 3% 88%)",
  fontSize: "10px",
  fontFamily: "JetBrains Mono, monospace",
  boxShadow: "4px 4px 0px 0px hsl(0 0% 10%)",
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
        const converted = convertAmount(
          t.amount,
          t.currency || "USD",
          baseCurrency,
        );
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

      const converted = convertAmount(
        t.amount,
        t.currency || "USD",
        baseCurrency,
      );
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
        <span style={{ color: "hsl(142 55% 52%)" }}>{currencySymbol}</span> no
        data — add transactions
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
          className="p-5"
          style={{
            border: "1px solid hsl(0 0% 13%)",
            background: "hsl(0 0% 6%)",
          }}
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
                    stroke="hsl(0 0% 5%)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
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
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider"
                style={{ color: "hsl(0 0% 55%)" }}
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
          className="p-5"
          style={{
            border: "1px solid hsl(0 0% 13%)",
            background: "hsl(0 0% 6%)",
          }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
            // monthly_overview
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barGap={3} barCategoryGap="32%">
              <CartesianGrid
                strokeDasharray="2 2"
                stroke="hsl(0 0% 14%)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{
                  fill: "hsl(0 0% 38%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                axisLine={{ stroke: "hsl(0 0% 18%)", strokeWidth: 1 }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{
                  fill: "hsl(0 0% 38%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${currencySymbol}${v}`}
                dx={-4}
                width={52}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number | undefined) => [
                  `${currencySymbol}${(v ?? 0).toFixed(2)}`,
                ]}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  color: "hsl(0 0% 40%)",
                  fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase",
                  paddingTop: "8px",
                  letterSpacing: "0.1em",
                }}
              />
              <Bar
                dataKey="income"
                fill="hsl(142 60% 52%)"
                radius={[2, 2, 0, 0]}
                name="income"
              />
              <Bar
                dataKey="expenses"
                fill="hsl(3 80% 52%)"
                radius={[2, 2, 0, 0]}
                name="expenses"
              />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </motion.div>
  );
}
