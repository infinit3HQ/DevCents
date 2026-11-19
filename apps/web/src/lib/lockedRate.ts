/** USD-relative exchange rates: 1 USD = rates[code] units of `code`. */
export type UsdRates = Readonly<Record<string, number>>;

/**
 * Convert a transaction amount into the base currency, preferring the
 * USD rate locked on the transaction when it was recorded. Without a
 * locked rate it falls back to today's rate, so historical totals don't
 * drift with the market and every view (summary, charts) agrees.
 */
export function toBaseAtLockedRate(
  amount: number,
  currency: string,
  lockedRateToUSD: number | undefined,
  baseCurrency: string,
  rates: UsdRates,
): number {
  const baseFx = rates[baseCurrency];
  const hasLocked = lockedRateToUSD !== undefined && lockedRateToUSD > 0;

  if (hasLocked) {
    const usd = amount * lockedRateToUSD;
    return baseFx ? usd * baseFx : usd;
  }
  if (currency === baseCurrency) return amount;

  const fromFx = rates[currency];
  if (!fromFx || !baseFx) return amount;
  return (amount / fromFx) * baseFx;
}
