import { describe, expect, it } from "vitest";
import { detectRecurring } from "./recurringDetection";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 31, 12).getTime();

function monthly(description: string, amount: number, months: number, extra: Partial<{ category: string; type: "income" | "expense"; currency: string }> = {}) {
  return Array.from({ length: months }, (_, i) => ({
    _id: `${description}-${i}`,
    date: new Date(2026, 9 - (months - 1 - i), 5, 12).getTime(),
    amount: amount * (i % 2 ? 1.05 : 1),
    currency: extra.currency ?? "LKR",
    type: extra.type ?? ("expense" as const),
    category: extra.category ?? "utilities",
    description,
  }));
}

describe("detectRecurring", () => {
  it("finds a monthly bill with similar amounts", () => {
    const [s] = detectRecurring(monthly("Dialog Axiata", 500, 5), [], NOW);
    expect(s).toMatchObject({ merchant: "dialog axiata", cadence: "monthly", currency: "LKR", count: 5 });
    expect(new Date(s.nextDate).getMonth()).toBe(10); // November
  });

  it("skips merchants already set up as recurring", () => {
    const out = detectRecurring(monthly("Dialog Axiata", 500, 5), [{ description: "Dialog Axiata bill", type: "expense" }], NOW);
    expect(out).toHaveLength(0);
  });

  it("skips irregular spending and wildly different amounts", () => {
    const irregular = [3, 11, 40, 47, 90].map((d, i) => ({
      _id: String(i), date: NOW - d * DAY, amount: 1200, currency: "LKR",
      type: "expense" as const, category: "groceries", description: "Keells Super",
    }));
    expect(detectRecurring(irregular, [], NOW)).toHaveLength(0);
    const varied = monthly("Keells Super", 1000, 5).map((t, i) => ({ ...t, amount: [800, 4000, 1500, 9000, 300][i] }));
    expect(detectRecurring(varied, [], NOW)).toHaveLength(0);
  });

  it("ignores transfers, stale patterns and dismissed suggestions", () => {
    expect(detectRecurring(monthly("ATM withdrawal", 20000, 5, { category: "transfer" }), [], NOW)).toHaveLength(0);
    expect(detectRecurring(monthly("Dialog Axiata", 500, 5), [], NOW + 120 * DAY)).toHaveLength(0);
    expect(detectRecurring(monthly("Dialog Axiata", 500, 5), [], NOW, new Set(["expense|dialog axiata|LKR"]))).toHaveLength(0);
  });
});
