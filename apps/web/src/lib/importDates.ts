import { parseLocalDateInputToNoonMs } from "./planningUtils";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a date cell from an imported file as a local calendar day pinned to
 * noon. `new Date("2026-11-01")` is UTC midnight, which is Oct 31 west of
 * UTC; noon keeps the day stable across time zones and DST.
 */
export function parseImportDateToLocalNoon(raw: string): number | null {
  const value = raw.trim();
  const iso = ISO_DAY.exec(value);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const check = new Date(y, m - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
    return parseLocalDateInputToNoonMs(value);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(12, 0, 0, 0);
  return parsed.getTime();
}

/** YYYY-MM-DD in local time, the day key the rate lookup expects. */
function localDayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type RateFetcher = (args: { date: string; currency: string }) => Promise<number>;

/**
 * Lock a USD rate for each row's own day so imported history doesn't drift
 * with today's exchange rates. Fetches each (day, currency) pair once.
 */
export async function lockRatesForRows(
  rows: ReadonlyArray<{ date: number; currency: string }>,
  fetchRate: RateFetcher,
): Promise<number[]> {
  const cache = new Map<string, Promise<number>>();
  const lookup = (date: string, currency: string) => {
    const key = `${date}|${currency}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        fetchRate({ date, currency }).then((rate) => {
          if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
            throw new Error(`No valid ${currency}/USD rate for ${date}`);
          }
          return rate;
        }),
      );
    }
    return cache.get(key)!;
  };
  return Promise.all(
    rows.map((r) => (r.currency === "USD" ? 1 : lookup(localDayKey(r.date), r.currency))),
  );
}
