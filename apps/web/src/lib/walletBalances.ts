// Pure functional core for computing per-currency wallet balances by
// chronological replay of a transaction history, with greedy spillover
// when an expense's native wallet doesn't have enough.
//
// This is the actual bookkeeping reality of a multi-currency user: each
// wallet (USD, LKR, JPY, ...) holds value in its native currency, and an
// expense in currency X is paid out of wallet X first; any shortfall
// "spills" out of the wallet that has the most USD-equivalent value at
// the date of the expense, converted at that day's locked rate.
//
// Inputs are pure; the caller owns the rates table and the transaction
// list. No React, no I/O. Easy to unit-test.

export interface WalletInputTx {
  amount: number;
  currency?: string;
  /**
   * Rate from the entry's `currency` to USD on its `date`, locked at
   * entry/post time. So `amount * rateToUSD === amount in USD`. Always
   * 1.0 for USD entries. Optional for legacy rows that haven't been
   * stamped yet — those fall back to live rates.
   */
  rateToUSD?: number;
  type: "income" | "expense";
  date: number;
}

export type WalletBalances = Record<string, number>;

export type RatesUSDRelative = Record<string, number>;

/** YYYY-MM-DD string from a unix-ms timestamp (UTC for stability). */
export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * From a list of transactions that may carry per-row `rateToUSD`,
 * synthesise a `{ date -> { currency -> rate-USD-per-X } }` index.
 * "rate" here matches fxratesapi shape: rates[X] = X per USD.
 */
export function ratesByDateFromTxs(
  txs: ReadonlyArray<WalletInputTx>,
): Record<string, RatesUSDRelative> {
  const out: Record<string, RatesUSDRelative> = {};
  for (const t of txs) {
    const ccy = t.currency || "USD";
    const day = isoDate(t.date);
    if (!out[day]) out[day] = { USD: 1 };
    if (ccy === "USD") continue;
    if (t.rateToUSD === undefined || !isFinite(t.rateToUSD) || t.rateToUSD <= 0)
      continue;
    // t.rateToUSD = USD per X. rates[X] = X per USD = 1 / t.rateToUSD.
    out[day][ccy] = 1 / t.rateToUSD;
  }
  return out;
}

/**
 * Look up the X-per-USD rate for a currency on a given day, falling back
 * through (1) the date-specific snapshot, (2) the live snapshot, (3) the
 * row's own rateToUSD if it's the same currency. Returns undefined if no
 * rate is available — caller decides what to do.
 */
function rateOn(
  day: string,
  ccy: string,
  byDate: Record<string, RatesUSDRelative>,
  liveRates: RatesUSDRelative,
): number | undefined {
  if (ccy === "USD") return 1;
  const fromDate = byDate[day]?.[ccy];
  if (fromDate && isFinite(fromDate) && fromDate > 0) return fromDate;
  const fromLive = liveRates[ccy];
  if (fromLive && isFinite(fromLive) && fromLive > 0) return fromLive;
  return undefined;
}

export interface ComputeOptions {
  /**
   * X-per-USD rates fetched from fxratesapi /latest. Used only as a
   * fallback when a transaction's date doesn't have a snapshot for
   * a currency we need (e.g., picking which wallet to spill from when
   * the expense's date only has the expense currency's rate).
   */
  liveRates: RatesUSDRelative;
}

/**
 * Walk transactions chronologically and produce final per-currency
 * wallet balances.
 *
 * Greedy spillover semantics for expenses where the native wallet can't
 * cover:
 *   1. Drain native wallet down to 0 (don't take it negative if it's
 *      currently positive).
 *   2. Convert the remaining shortfall to USD at the expense's
 *      date-of-day rate.
 *   3. Among other wallets with strictly positive balance, pick the one
 *      with the largest USD-equivalent at that same date.
 *   4. Deduct the shortfall from the picked wallet, converting USD back
 *      into that wallet's currency at the same date's rate.
 *   5. If no other wallet has a positive balance, the native wallet is
 *      allowed to go negative (this represents "I overdrew my LKR and
 *      have nothing in any other currency to cover it" — visible debt).
 *   6. If a rate we need is missing for the expense's date AND there's
 *      no live fallback, the native wallet is also allowed to go
 *      negative rather than picking a silently-wrong spillover target.
 *
 * No FX assumption ever runs against a date the row didn't actually
 * have rates for — the live-rates fallback is explicit and visible to
 * callers.
 */
export function computeWalletBalances(
  txs: ReadonlyArray<WalletInputTx>,
  opts: ComputeOptions,
): WalletBalances {
  const sorted = [...txs].sort((a, b) => a.date - b.date);
  const byDate = ratesByDateFromTxs(sorted);
  const wallets: WalletBalances = {};

  const ensure = (c: string) => {
    if (!(c in wallets)) wallets[c] = 0;
  };

  for (const t of sorted) {
    const ccy = t.currency || "USD";
    ensure(ccy);

    if (t.type === "income") {
      wallets[ccy] += t.amount;
      continue;
    }

    // expense
    const day = isoDate(t.date);
    const native = wallets[ccy];

    if (native >= t.amount) {
      wallets[ccy] -= t.amount;
      continue;
    }

    const fromNative = Math.max(native, 0);
    const shortfall = t.amount - fromNative;
    wallets[ccy] = native - fromNative; // 0 if was positive; unchanged if already <=0

    const rateExpense = rateOn(day, ccy, byDate, opts.liveRates);
    if (rateExpense === undefined) {
      // Can't price the shortfall in USD safely — let native go negative.
      wallets[ccy] -= shortfall;
      continue;
    }
    const shortfallInUSD = shortfall / rateExpense;

    // Candidates: any other wallet with strictly positive balance.
    const candidates = Object.entries(wallets).filter(
      ([c, bal]) => c !== ccy && bal > 0,
    );

    if (candidates.length === 0) {
      // No spillover source — native goes negative.
      wallets[ccy] -= shortfall;
      continue;
    }

    let bestCcy: string | undefined;
    let bestUSD = -Infinity;
    for (const [c, bal] of candidates) {
      const rC = rateOn(day, c, byDate, opts.liveRates);
      if (rC === undefined) continue;
      const balUSD = bal / rC;
      if (balUSD > bestUSD) {
        bestUSD = balUSD;
        bestCcy = c;
      }
    }

    if (!bestCcy) {
      // Couldn't price any candidate either — fall back to native-goes-negative.
      wallets[ccy] -= shortfall;
      continue;
    }

    const rateBest = rateOn(day, bestCcy, byDate, opts.liveRates)!;
    const shortfallInBest = shortfallInUSD * rateBest;
    wallets[bestCcy] -= shortfallInBest;
  }

  return wallets;
}
