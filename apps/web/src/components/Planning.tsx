import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  PauseCircle,
  PlayCircle,
  Send,
  Wallet,
  Pencil,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatAmountOnly, formatCurrency, getCurrencySymbol } from "@/lib/currencyUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/categoryUtils";
import { useDecryptedPlanned } from "@/hooks/useDecryptedPlanned";
import { useDecryptedRecurring } from "@/hooks/useDecryptedRecurring";
import { AddPlanned } from "@/components/AddPlanned";
import { AddRecurring } from "@/components/AddRecurring";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Tip } from "@/components/ui/Tip";
import { DAY_MS, dayKey, recurringOccurrencesBetween } from "@/lib/planningUtils";
import type { EditData } from "@/components/AddTransaction";

type HorizonDays = 30 | 60 | 90 | 180 | 365 | number;

type CashflowEvent = {
  key: string;
  source: "planned" | "recurring";
  sourceId: string;
  date: number;
  type: "income" | "expense";
  amount: number;
  currency: string;
  category: string;
  description: string;
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
} as const;

const fmt = (n: number, currencyCode: string) =>
  formatAmountOnly(Math.abs(n), currencyCode);

function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sameDayOrAfter(a: number, b: number) {
  return dayKey(a) >= dayKey(b);
}

function toDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function openEdit(mode: "planned" | "recurring" | "ledger", editData: EditData) {
  document.dispatchEvent(new CustomEvent("open-add-entry", { detail: { mode, editData } }));
}

export function Planning({ currentBalance }: { currentBalance: number }) {
  const planned = useDecryptedPlanned();
  const recurring = useDecryptedRecurring();
  const postedOccurrences = useQuery(api.recurring.getPostedOccurrences);
  const { baseCurrency, convertAmount } = useCurrency();
  const currencySymbol = getCurrencySymbol(baseCurrency);

  const removePlanned = useMutation(api.planned.remove);
  const postPlanned = useMutation(api.planned.postToLedger);
  const setPlannedStatus = useMutation(api.planned.setStatus);

  const removeRecurring = useMutation(api.recurring.remove);
  const toggleRecurring = useMutation(api.recurring.toggleActive);
  const postRecurring = useMutation(api.recurring.postOccurrenceToLedger);

  const [horizon, setHorizon] = useState<HorizonDays>(90);

  const [anchorMs] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  });
  const endMs = anchorMs + horizon * DAY_MS;

  const postedOccurrenceKeys = useMemo(() => {
    if (!postedOccurrences) return new Set<string>();
    return new Set(postedOccurrences.map((o) => `${o.recurringId}:${o.date}`));
  }, [postedOccurrences]);

  const events = useMemo(() => {
    if (!planned || !recurring || !postedOccurrences) return undefined as CashflowEvent[] | undefined;

    const evts: CashflowEvent[] = [];

    for (const p of planned) {
      const status = p.status ?? "planned";
      if (status !== "planned") continue;
      if (p.date < anchorMs || p.date > endMs) continue;
      evts.push({
        key: `planned:${p._id}`,
        source: "planned",
        sourceId: p._id,
        date: p.date,
        type: p.type,
        amount: p.amount,
        currency: p.currency || baseCurrency || "USD",
        category: p.category,
        description: p.description,
      });
    }

    for (const r of recurring) {
      if (r.active === false) continue;
      const dates = recurringOccurrencesBetween(
        r.startDate,
        r.cadence,
        anchorMs,
        endMs,
      );
      for (const d of dates) {
        if (!sameDayOrAfter(d, r.startDate)) continue;
        if (postedOccurrenceKeys.has(`${r._id}:${d}`)) continue;
        evts.push({
          key: `recurring:${r._id}:${d}`,
          source: "recurring",
          sourceId: r._id,
          date: d,
          type: r.type,
          amount: r.amount,
          currency: r.currency || baseCurrency || "USD",
          category: r.category,
          description: r.description,
        });
      }
    }

    evts.sort((a, b) => a.date - b.date);
    return evts;
  }, [planned, recurring, baseCurrency, anchorMs, endMs, postedOccurrenceKeys]);

  const summary = useMemo(() => {
    if (!events) return undefined as
      | {
          income: number;
          expenses: number;
          net: number;
          projectedEnd: number;
        }
      | undefined;

    let income = 0;
    let expenses = 0;
    for (const e of events) {
      const converted = convertAmount(e.amount, e.currency || "USD");
      if (e.type === "income") income += converted;
      else expenses += converted;
    }
    const net = income - expenses;
    return {
      income,
      expenses,
      net,
      projectedEnd: currentBalance + net,
    };
  }, [events, convertAmount, currentBalance]);

  const series = useMemo(() => {
    if (!events) return undefined as { name: string; balance: number }[] | undefined;

    const deltaByDay: Record<string, number> = {};
    for (const e of events) {
      const k = dayKey(e.date);
      const converted = convertAmount(e.amount, e.currency || "USD");
      const signed = e.type === "income" ? converted : -converted;
      deltaByDay[k] = (deltaByDay[k] ?? 0) + signed;
    }

    const points: { name: string; balance: number }[] = [];
    let running = currentBalance;

    const start = new Date(anchorMs);
    start.setHours(12, 0, 0, 0);

    for (let i = 0; i <= horizon; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const k = dayKey(d.getTime());
      running += deltaByDay[k] ?? 0;
      const label = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      points.push({ name: label, balance: Math.round(running * 100) / 100 });
    }

    return points;
  }, [events, horizon, convertAmount, currentBalance, anchorMs]);

  const nextRecurringById = useMemo(() => {
    if (!recurring) return {};
    const map: Record<string, number | undefined> = {};
    const horizon365 = anchorMs + 365 * DAY_MS;
    for (const r of recurring) {
      if (r.active === false) continue;
      const dates = recurringOccurrencesBetween(
        r.startDate,
        r.cadence,
        anchorMs,
        horizon365,
      );
      map[r._id] = dates[0];
    }
    return map;
  }, [recurring, anchorMs]);

  if (!planned || !recurring || !postedOccurrences || !events || !summary || !series) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-8 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        <span className="text-primary">$ </span>loading plan matrix...
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
            // forecast_console
          </p>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-xs uppercase tracking-widest text-foreground/80">
              horizon_{horizon}d
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              projected_end:{" "}
              <span
                className={cn(
                  "num-display",
                  summary.projectedEnd >= currentBalance
                    ? "text-primary"
                    : "text-destructive",
                )}
              >
                {summary.projectedEnd < 0 ? "-" : ""}
                {fmt(summary.projectedEnd, baseCurrency)}
              </span>
              <span className="ml-1 uppercase">{baseCurrency}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border bg-card">
            {[30, 60, 90, 180, 365].map((d) => {
              const active = horizon === d;
              return (
                <button
                  key={d}
                  onClick={() => setHorizon(d as HorizonDays)}
                  className={cn(
                    "h-8 px-3 font-mono text-[10px] uppercase tracking-widest transition-colors border-r border-border last:border-r-0",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  {d}d
                </button>
              );
            })}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "h-8 w-8 border border-border flex items-center justify-center transition-colors",
                  ![30, 60, 90, 180, 365].includes(horizon)
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                )}
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
                    value={new Date(anchorMs).toISOString().slice(0, 10)}
                    onChange={() => {}}
                    label="Start date"
                    disabled
                    className="rounded-none"
                  />
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
                    to
                  </p>
                  <DatePickerField
                    value={new Date(endMs).toISOString().slice(0, 10)}
                    onChange={(v) => {
                      const picked = new Date(v + "T12:00:00");
                      const days = Math.round((picked.getTime() - anchorMs) / DAY_MS);
                      if (days > 0) setHorizon(days);
                    }}
                    label="End date"
                    className="rounded-none"
                  />
                </div>
              </div>
              <p className="font-mono text-[8px] text-muted-foreground/60 mt-2">
                {horizon}d selected
              </p>
            </PopoverContent>
          </Popover>

          <AddPlanned />
          <AddRecurring />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "current_balance",
            value: currentBalance,
            icon: Wallet,
            tone: currentBalance >= 0 ? "text-foreground" : "text-destructive",
          },
          {
            label: "incoming",
            value: summary.income,
            icon: ArrowUpRight,
            tone: "text-primary",
          },
          {
            label: "outgoing",
            value: summary.expenses,
            icon: ArrowDownRight,
            tone: "text-destructive",
          },
          {
            label: "projected_end",
            value: summary.projectedEnd,
            icon: summary.projectedEnd >= 0 ? ArrowUpRight : ArrowDownRight,
            tone: summary.projectedEnd >= 0 ? "text-primary" : "text-destructive",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4 border border-border bg-card">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                {s.label}
              </p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 border border-border flex items-center justify-center text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className={cn("font-mono text-lg num-display", s.tone)}>
                  {s.value < 0 ? "-" : ""}
                  {currencySymbol}
                  {fmt(s.value, baseCurrency)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="p-5 border border-border bg-card">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
          // projected_balance_curve
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series}>
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
              interval={Math.ceil(horizon / 6)}
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
              width={62}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((v: number) => [`${currencySymbol}${formatAmountOnly(v ?? 0, baseCurrency)}`, "balance"]) as any}
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming */}
      <div className="p-5 border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              // upcoming_cashflow
            </p>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {events.length}_events
          </span>
        </div>

        {events.length === 0 ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-dashed border-border">
            <span className="text-primary">→ </span>no future entries. add
            planned / recurring items.
          </div>
        ) : (
          <div className="divide-y border-border">
            <AnimatePresence mode="popLayout">
              {events.map((e, i) => {
                const Icon = CATEGORY_ICONS[e.category] ?? CATEGORY_ICONS.other;
                const accent = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.other;
                const tone = e.type === "income" ? "text-primary" : "text-destructive";
                const badgeTone =
                  e.source === "planned"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground";

                return (
                  <motion.div
                    key={e.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.5) }}
                    className="flex items-center gap-3 py-3.5 transition-colors hover:bg-primary/5"
                    style={{ borderLeftWidth: "3px", borderLeftColor: accent, paddingLeft: "12px" }}
                  >
                    <div className="shrink-0">
                      <div
                        className={cn(
                          "w-7 h-7 flex items-center justify-center shrink-0 border",
                          e.type === "income"
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {e.type === "income" ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground opacity-80">
                          {shortDate(e.date)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest border",
                            badgeTone,
                          )}
                        >
                          {e.source === "planned" ? "planned" : "recurring"}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] truncate text-foreground/90 mt-1">
                        {e.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground border-l-2 border-border pl-[5px] flex items-center gap-1">
                          <Icon className="h-3 w-3" style={{ color: accent }} />
                          {e.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("font-mono text-sm num-display", tone)}>
                        {e.type === "income" ? "+" : "-"}
                        {formatCurrency(e.amount, e.currency)}
                      </span>

                      <Tip label="Post to ledger">
                        <button
                          onClick={() => {
                            if (e.source === "planned") {
                              postPlanned({ id: e.sourceId as Id<"planned"> });
                              return;
                            }
                            postRecurring({
                              id: e.sourceId as Id<"recurring">,
                              date: e.date,
                            });
                          }}
                          className="h-8 w-8 border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors flex items-center justify-center"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Manage: Planned */}
      <div className="p-5 border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              // planned_items
            </p>
          </div>
          <AddPlanned
            trigger={
              <button className="h-8 px-3 border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors font-mono text-[10px] uppercase tracking-widest">
                + plan
              </button>
            }
          />
        </div>

        {planned.length === 0 ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-dashed border-border">
            <span className="text-primary">→ </span>no planned items.
          </div>
        ) : (
          <div className="divide-y border-border">
            {planned
              .slice()
              .sort((a, b) => a.date - b.date)
              .map((p) => {
                const accent = CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS.other;
                const Icon = CATEGORY_ICONS[p.category] ?? CATEGORY_ICONS.other;
                const status = p.status ?? "planned";
                return (
                  <div
                    key={p._id}
                    className="flex items-center gap-3 py-3"
                    style={{
                      borderLeftWidth: "3px",
                      borderLeftColor: accent,
                      paddingLeft: "12px",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {shortDate(p.date)}
                        </span>
                        <span
                          className={cn(
                            "font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5",
                            status === "planned"
                              ? "border-primary/25 bg-primary/10 text-primary"
                              : status === "posted"
                                ? "border-border bg-transparent text-muted-foreground"
                                : "border-destructive/25 bg-destructive/10 text-destructive",
                          )}
                        >
                          {status}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] truncate text-foreground/90 mt-1">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Icon className="h-3 w-3" style={{ color: accent }} />
                          {p.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "font-mono text-sm num-display",
                          p.type === "income" ? "text-primary" : "text-destructive",
                        )}
                      >
                        {p.type === "income" ? "+" : "-"}
                        {formatCurrency(p.amount, p.currency || baseCurrency)}
                      </span>

                      {status === "planned" && (
                        <Tip label="Edit">
                          <button
                            onClick={() => openEdit("planned", {
                              id: p._id,
                              amount: p.amount,
                              currency: p.currency || baseCurrency,
                              description: p.description,
                              category: p.category,
                              type: p.type,
                              date: toDateInput(p.date),
                            })}
                            className="h-8 w-8 border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}

                      {status === "planned" && (
                        <Tip label="Post to ledger">
                          <button
                            onClick={() =>
                              postPlanned({ id: p._id as Id<"planned"> })
                            }
                            className="h-8 w-8 border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors flex items-center justify-center"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}

                      {status === "planned" && (
                        <Tip label="Skip">
                          <button
                            onClick={() =>
                              setPlannedStatus({
                                id: p._id as Id<"planned">,
                                status: "skipped",
                              })
                            }
                            className="h-8 w-8 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors flex items-center justify-center"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}

                      <Tip label="Delete">
                        <button
                          onClick={() =>
                            removePlanned({ id: p._id as Id<"planned"> })
                          }
                          className="h-8 w-8 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors flex items-center justify-center"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Manage: Recurring */}
      <div className="p-5 border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              // recurring_items
            </p>
          </div>
          <AddRecurring
            trigger={
              <button className="h-8 px-3 border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors font-mono text-[10px] uppercase tracking-widest">
                + recur
              </button>
            }
          />
        </div>

        {recurring.length === 0 ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-dashed border-border">
            <span className="text-primary">→ </span>no recurring items.
          </div>
        ) : (
          <div className="divide-y border-border">
            {recurring.map((r) => {
              const accent = CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS.other;
              const Icon = CATEGORY_ICONS[r.category] ?? CATEGORY_ICONS.other;
              const next = nextRecurringById[r._id];
              return (
                <div
                  key={r._id}
                  className="flex items-center gap-3 py-3"
                  style={{
                    borderLeftWidth: "3px",
                    borderLeftColor: accent,
                    paddingLeft: "12px",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5",
                          r.active === false
                            ? "border-border bg-transparent text-muted-foreground"
                            : "border-primary/25 bg-primary/10 text-primary",
                        )}
                      >
                        {r.active === false ? "paused" : "active"}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {r.cadence}
                      </span>
                      {next && (
                        <span className="font-mono text-[10px] text-muted-foreground opacity-70">
                          next:{shortDate(next)}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[12px] truncate text-foreground/90 mt-1">
                      {r.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon className="h-3 w-3" style={{ color: accent }} />
                        {r.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "font-mono text-sm num-display",
                        r.type === "income" ? "text-primary" : "text-destructive",
                      )}
                    >
                      {r.type === "income" ? "+" : "-"}
                      {formatCurrency(r.amount, r.currency || baseCurrency)}
                    </span>

                    <Tip label="Edit">
                      <button
                        onClick={() => openEdit("recurring", {
                          id: r._id,
                          amount: r.amount,
                          currency: r.currency || baseCurrency,
                          description: r.description,
                          category: r.category,
                          type: r.type,
                          startDate: toDateInput(r.startDate),
                          cadence: r.cadence,
                        })}
                        className="h-8 w-8 border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </Tip>

                    <Tip label={r.active === false ? "Resume" : "Pause"}>
                      <button
                        onClick={() =>
                          toggleRecurring({
                            id: r._id as Id<"recurring">,
                            active: !(r.active !== false),
                          })
                        }
                        className="h-8 w-8 border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
                      >
                        {r.active === false ? (
                          <PlayCircle className="h-3.5 w-3.5" />
                        ) : (
                          <PauseCircle className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </Tip>

                    {next && r.active !== false && (
                      <Tip label="Post next occurrence">
                        <button
                          onClick={() =>
                            postRecurring({
                              id: r._id as Id<"recurring">,
                              date: next,
                            })
                          }
                          className="h-8 w-8 border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors flex items-center justify-center"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                    )}

                    <Tip label="Delete">
                      <button
                        onClick={() =>
                          removeRecurring({ id: r._id as Id<"recurring"> })
                        }
                        className="h-8 w-8 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
