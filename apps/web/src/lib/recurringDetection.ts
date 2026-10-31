import { merchantKey } from "@devcents/shared/categoryRules";
import { isTransferCategory, normalizeCategory } from "@devcents/shared/categories";

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

type Tx = {
  _id: string;
  date: number;
  amount: number;
  currency?: string;
  type: "income" | "expense";
  category: string;
  description: string;
};

type RecurringLike = {
  description: string;
  type: "income" | "expense";
  active?: boolean;
};

export type RecurringSuggestion = {
  key: string; // stable id for dismissing: type|merchant|currency
  merchant: string;
  description: string; // most recent description
  type: "income" | "expense";
  category: string;
  cadence: Cadence;
  amount: number; // median
  currency: string;
  count: number;
  lastDate: number;
  nextDate: number;
};

const DAY = 24 * 60 * 60 * 1000;

const CADENCES: Array<{ cadence: Cadence; days: number; tolerance: number; minCount: number }> = [
  { cadence: "weekly", days: 7, tolerance: 1.5, minCount: 4 },
  { cadence: "biweekly", days: 14, tolerance: 2.5, minCount: 3 },
  { cadence: "monthly", days: 30.44, tolerance: 4, minCount: 3 },
  { cadence: "yearly", days: 365.25, tolerance: 12, minCount: 2 },
];

// Share of intervals / amounts that must fit the pattern.
const REGULARITY = 0.75;
const AMOUNT_TOLERANCE = 0.2;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function addCadence(ms: number, cadence: Cadence): number {
  const d = new Date(ms);
  if (cadence === "weekly") return ms + 7 * DAY;
  if (cadence === "biweekly") return ms + 14 * DAY;
  if (cadence === "monthly") return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12).getTime();
  return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), 12).getTime();
}

/**
 * Finds merchants that repeat on a regular schedule with similar amounts and
 * aren't already set up as recurring items. Transfers are ignored.
 */
export function detectRecurring(
  transactions: ReadonlyArray<Tx>,
  existing: ReadonlyArray<RecurringLike>,
  now: number = Date.now(),
  dismissed: ReadonlySet<string> = new Set(),
): RecurringSuggestion[] {
  const covered = new Set(
    existing
      .filter((r) => r.active !== false)
      .map((r) => `${r.type}|${merchantKey(r.description)}`),
  );

  const groups = new Map<string, Tx[]>();
  for (const t of transactions) {
    if (isTransferCategory(t.category, t.type)) continue;
    const merchant = merchantKey(t.description);
    if (!merchant) continue;
    const key = `${t.type}|${merchant}|${(t.currency || "USD").toUpperCase()}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (dismissed.has(key)) continue;
    const [type, merchant, currency] = key.split("|") as ["income" | "expense", string, string];
    if (covered.has(`${type}|${merchant}`)) continue;

    // One entry per day, oldest first.
    const byDay = new Map<number, Tx>();
    for (const t of list) byDay.set(Math.floor(t.date / DAY), t);
    const txs = [...byDay.values()].sort((a, b) => a.date - b.date);
    if (txs.length < 2) continue;

    const intervals = txs.slice(1).map((t, i) => (t.date - txs[i].date) / DAY);
    const typical = median(intervals);
    const match = CADENCES.find(
      (c) => txs.length >= c.minCount && Math.abs(typical - c.days) <= c.tolerance,
    );
    if (!match) continue;

    const regular = intervals.filter((d) => Math.abs(d - match.days) <= match.tolerance * 1.5).length;
    if (regular / intervals.length < REGULARITY) continue;

    const amounts = txs.map((t) => t.amount);
    const typicalAmount = median(amounts);
    if (typicalAmount <= 0) continue;
    const similar = amounts.filter((a) => Math.abs(a - typicalAmount) / typicalAmount <= AMOUNT_TOLERANCE).length;
    if (similar / amounts.length < REGULARITY) continue;

    // Still active: last one within 1.5 periods.
    const last = txs[txs.length - 1];
    if (now - last.date > match.days * 1.5 * DAY) continue;

    out.push({
      key,
      merchant,
      description: last.description,
      type,
      category: normalizeCategory(last.category, type),
      cadence: match.cadence,
      amount: Math.round(typicalAmount * 100) / 100,
      currency,
      count: txs.length,
      lastDate: last.date,
      nextDate: addCadence(last.date, match.cadence),
    });
  }

  return out.sort((a, b) => b.count - a.count);
}
