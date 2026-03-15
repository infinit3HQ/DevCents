import type { RecurringCadence } from "@/hooks/useDecryptedRecurring";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function parseLocalDateInputToNoonMs(input: string): number {
  // <input type="date"> yields "YYYY-MM-DD". Using Date.parse treats it as UTC;
  // we intentionally construct a local date and pin it to noon to avoid DST edge cases.
  const [yy, mm, dd] = input.split("-").map((n) => parseInt(n, 10));
  if (!yy || !mm || !dd) return Date.now();
  return new Date(yy, mm - 1, dd, 12, 0, 0, 0).getTime();
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysLocalNoon(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function dateAtLocalNoon(year: number, monthIndex: number, day: number): Date {
  // Clamp day to last day of month.
  const last = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
  const clamped = Math.min(Math.max(day, 1), last);
  return new Date(year, monthIndex, clamped, 12, 0, 0, 0);
}

export function recurringOccurrencesBetween(
  startDateMs: number,
  cadence: RecurringCadence,
  fromMs: number,
  toMs: number,
): number[] {
  if (toMs < fromMs) return [];

  const out: number[] = [];
  const start = new Date(startDateMs);
  start.setHours(12, 0, 0, 0);

  const from = new Date(fromMs);
  from.setHours(12, 0, 0, 0);

  const to = new Date(toMs);
  to.setHours(12, 0, 0, 0);

  if (cadence === "weekly" || cadence === "biweekly") {
    const step = cadence === "weekly" ? 7 : 14;
    const cursor = new Date(start);

    // Jump close to `from` to avoid stepping from the beginning for old schedules.
    const daysDiff = Math.floor((from.getTime() - cursor.getTime()) / DAY_MS);
    if (daysDiff > 0) {
      const jumps = Math.floor(daysDiff / step);
      cursor.setDate(cursor.getDate() + jumps * step);
    }

    while (cursor.getTime() < from.getTime()) {
      cursor.setDate(cursor.getDate() + step);
      cursor.setHours(12, 0, 0, 0);
    }

    while (cursor.getTime() <= to.getTime()) {
      out.push(cursor.getTime());
      cursor.setDate(cursor.getDate() + step);
      cursor.setHours(12, 0, 0, 0);
    }

    return out;
  }

  const targetDay = start.getDate();
  const targetMonth = start.getMonth();

  if (cadence === "monthly") {
    const monthsDiff =
      (from.getFullYear() - start.getFullYear()) * 12 +
      (from.getMonth() - start.getMonth());

    let cursor = dateAtLocalNoon(
      start.getFullYear(),
      start.getMonth() + Math.max(monthsDiff, 0),
      targetDay,
    );
    while (cursor.getTime() < from.getTime()) {
      cursor = dateAtLocalNoon(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        targetDay,
      );
    }

    while (cursor.getTime() <= to.getTime()) {
      out.push(cursor.getTime());
      cursor = dateAtLocalNoon(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        targetDay,
      );
    }
    return out;
  }

  // yearly
  const yearDiff = Math.max(from.getFullYear() - start.getFullYear(), 0);
  let cursor = dateAtLocalNoon(
    start.getFullYear() + yearDiff,
    targetMonth,
    targetDay,
  );
  while (cursor.getTime() < from.getTime()) {
    cursor = dateAtLocalNoon(cursor.getFullYear() + 1, targetMonth, targetDay);
  }
  while (cursor.getTime() <= to.getTime()) {
    out.push(cursor.getTime());
    cursor = dateAtLocalNoon(cursor.getFullYear() + 1, targetMonth, targetDay);
  }
  return out;
}

