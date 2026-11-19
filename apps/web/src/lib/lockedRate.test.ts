import { describe, expect, it } from "vitest";
import { toBaseAtLockedRate } from "./lockedRate";

const rates = { USD: 1, EUR: 0.9, JPY: 150 };

describe("toBaseAtLockedRate", () => {
  it("uses the rate locked on the transaction when present", () => {
    // 100 EUR locked at 1.08 USD/EUR = 108 USD, regardless of today's rate.
    expect(toBaseAtLockedRate(100, "EUR", 1.08, "USD", rates)).toBeCloseTo(108);
  });

  it("re-prices the locked USD value into a non-USD base with today's base rate", () => {
    expect(toBaseAtLockedRate(100, "EUR", 1.08, "JPY", rates)).toBeCloseTo(108 * 150);
  });

  it("falls back to today's rate when no rate was locked", () => {
    expect(toBaseAtLockedRate(90, "EUR", undefined, "USD", rates)).toBeCloseTo(100);
  });

  it("ignores a zero or negative locked rate", () => {
    expect(toBaseAtLockedRate(90, "EUR", 0, "USD", rates)).toBeCloseTo(100);
  });

  it("returns the amount unchanged when the currency rate is unknown", () => {
    expect(toBaseAtLockedRate(42, "XYZ", undefined, "USD", rates)).toBe(42);
  });
});
