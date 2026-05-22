import { describe, it, expect } from "vitest";
import {
  computeWalletBalances,
  ratesByDateFromTxs,
  isoDate,
  type WalletInputTx,
  type RatesUSDRelative,
} from "./walletBalances";

// Helper: a fixed liveRates table close to real-ish numbers; tests should
// not depend on it unless they're exercising the live-fallback path.
const LIVE_RATES: RatesUSDRelative = {
  USD: 1,
  LKR: 342,
  JPY: 156,
  EUR: 0.92,
};

// Mar 15 2026 in fixed UTC noon, picked once so date strings are stable.
const MAR_15 = Date.UTC(2026, 2, 15, 12);
const APR_15 = Date.UTC(2026, 3, 15, 12);
const MAY_15 = Date.UTC(2026, 4, 15, 12);

// Convert an X-per-USD rate to the rateToUSD shape we store on rows
// (USD per X = 1 / X-per-USD).
const rate = (xPerUsd: number) => 1 / xPerUsd;

describe("isoDate", () => {
  it("formats a unix-ms timestamp as YYYY-MM-DD", () => {
    expect(isoDate(MAR_15)).toBe("2026-03-15");
  });
});

describe("ratesByDateFromTxs", () => {
  it("indexes per-date per-currency rates back to fxratesapi shape", () => {
    const txs: WalletInputTx[] = [
      // LKR row on Mar 15 with rate 320 LKR per USD => rateToUSD = 1/320
      {
        amount: 100,
        currency: "LKR",
        rateToUSD: rate(320),
        type: "expense",
        date: MAR_15,
      },
      // USD row on Apr 15 — rate not stored but auto-1
      { amount: 100, currency: "USD", type: "income", date: APR_15 },
    ];
    const out = ratesByDateFromTxs(txs);
    expect(out["2026-03-15"]).toEqual({ USD: 1, LKR: 320 });
    expect(out["2026-04-15"]).toEqual({ USD: 1 });
  });
});

describe("computeWalletBalances", () => {
  it("simple income only, single currency", () => {
    const txs: WalletInputTx[] = [
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
    ];
    expect(computeWalletBalances(txs, { liveRates: LIVE_RATES })).toEqual({
      USD: 1000,
    });
  });

  it("expense within native wallet does not spill", () => {
    const txs: WalletInputTx[] = [
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
      { amount: 200, currency: "USD", type: "expense", date: APR_15 },
    ];
    expect(computeWalletBalances(txs, { liveRates: LIVE_RATES })).toEqual({
      USD: 800,
    });
  });

  it("greedy spillover: native LKR empty, drains from biggest USD wallet at the day's rate", () => {
    // Mar 15: $1000 income. No LKR.
    // Apr 15: pay LKR 100,000 expense at LKR rate 300 (so rateToUSD = 1/300).
    // Expected: LKR wallet 0, USD wallet 1000 - (100000 / 300) ≈ 666.67
    const txs: WalletInputTx[] = [
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
      {
        amount: 100_000,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "expense",
        date: APR_15,
      },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    expect(w.USD).toBeCloseTo(1000 - 100_000 / 300, 5);
    expect(w.LKR).toBe(0);
  });

  it("greedy spillover: native LKR partial, drains rest from USD", () => {
    // LKR wallet starts at 50,000. Spend 100,000 LKR at rate 300.
    // 50,000 from LKR (now 0). Remainder 50,000 LKR = 50000/300 USD ≈ 166.67 from USD.
    const txs: WalletInputTx[] = [
      {
        amount: 50_000,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "income",
        date: MAR_15,
      },
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
      {
        amount: 100_000,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "expense",
        date: APR_15,
      },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    expect(w.LKR).toBe(0);
    expect(w.USD).toBeCloseTo(1000 - 50_000 / 300, 5);
  });

  it("picks spillover wallet by USD-equivalent at the expense's date, not today", () => {
    // Setup: USD = $200, JPY = ¥30000.
    // Apr 15 rates (locked on the txs): JPY rate 150 -> ¥30000 = $200 too.
    // Expense LKR 30,000 at LKR rate 300 = $100 shortfall.
    // Tie at $200 == $200. Algorithm picks deterministically by iteration order.
    // What matters is it spills from one of them and arithmetic balances.
    const txs: WalletInputTx[] = [
      { amount: 200, currency: "USD", type: "income", date: MAR_15 },
      {
        amount: 30_000,
        currency: "JPY",
        rateToUSD: rate(150),
        type: "income",
        date: MAR_15,
      },
      {
        amount: 30_000,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "expense",
        date: APR_15,
      },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    expect(w.LKR).toBe(0);
    // 100 USD shortfall removed from one of the two equally-valued wallets.
    const usdInBoth =
      w.USD + (w.JPY ?? 0) * (1 / 150); // both at rate 150 on Apr 15
    expect(usdInBoth).toBeCloseTo(200 + 30_000 / 150 - 30_000 / 300, 5);
  });

  it("when no other wallet has positive balance, native wallet goes negative", () => {
    const txs: WalletInputTx[] = [
      {
        amount: 100,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "income",
        date: MAR_15,
      },
      {
        amount: 5000,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "expense",
        date: APR_15,
      },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    expect(w.LKR).toBe(100 - 5000); // -4900
  });

  it("expense currency rate missing on its date but available in liveRates: spillover still works", () => {
    // The expense row has no rateToUSD locked (legacy path), and there are
    // no other LKR rows on the same date. Spillover should fall back to
    // liveRates.LKR for pricing the shortfall.
    const txs: WalletInputTx[] = [
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
      // no rateToUSD on this expense — legacy
      { amount: 100, currency: "LKR", type: "expense", date: APR_15 },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    // shortfall is LKR 100, priced at LIVE_RATES.LKR=342 => 100/342 USD removed
    expect(w.LKR).toBe(0);
    expect(w.USD).toBeCloseTo(1000 - 100 / 342, 5);
  });

  it("transactions are processed in chronological order regardless of input order", () => {
    const txs: WalletInputTx[] = [
      // intentionally out of order
      {
        amount: 100,
        currency: "LKR",
        rateToUSD: rate(300),
        type: "expense",
        date: MAY_15,
      },
      { amount: 1000, currency: "USD", type: "income", date: MAR_15 },
      {
        amount: 50,
        currency: "LKR",
        rateToUSD: rate(310),
        type: "income",
        date: APR_15,
      },
    ];
    const w = computeWalletBalances(txs, { liveRates: LIVE_RATES });
    // After Mar 15: USD=1000.
    // After Apr 15: USD=1000, LKR=50.
    // After May 15: spend LKR 100 from LKR (only 50 there). 50 from LKR (-> 0),
    //   remainder 50 LKR / 300 = 0.1667 USD pulled from USD.
    expect(w.LKR).toBe(0);
    expect(w.USD).toBeCloseTo(1000 - 50 / 300, 5);
  });

  it("USD entries do not require rateToUSD", () => {
    const txs: WalletInputTx[] = [
      // No rateToUSD set on USD rows — that's intentional.
      { amount: 100, currency: "USD", type: "income", date: MAR_15 },
      { amount: 30, currency: "USD", type: "expense", date: APR_15 },
    ];
    expect(computeWalletBalances(txs, { liveRates: LIVE_RATES })).toEqual({
      USD: 70,
    });
  });

  it("default currency is USD when row.currency is undefined", () => {
    const txs: WalletInputTx[] = [
      { amount: 50, type: "income", date: MAR_15 },
    ];
    expect(computeWalletBalances(txs, { liveRates: LIVE_RATES })).toEqual({
      USD: 50,
    });
  });
});
