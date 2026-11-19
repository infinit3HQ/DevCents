import { describe, expect, it, vi } from "vitest";
import { lockRatesForRows, parseImportDateToLocalNoon } from "./importDates";

describe("parseImportDateToLocalNoon", () => {
  it("reads YYYY-MM-DD as a local calendar day, not UTC midnight", () => {
    const ms = parseImportDateToLocalNoon("2026-11-01");
    const d = new Date(ms!);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 1, 12]);
  });

  it("pins other recognised formats to local noon on the same day", () => {
    const d = new Date(parseImportDateToLocalNoon("Nov 3, 2026")!);
    expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([10, 3, 12]);
  });

  it("returns null for unparseable input", () => {
    expect(parseImportDateToLocalNoon("not a date")).toBeNull();
    expect(parseImportDateToLocalNoon("2026-13-40")).toBeNull();
  });
});

describe("lockRatesForRows", () => {
  it("fetches one rate per (day, currency) and uses 1 for USD", async () => {
    const fetchRate = vi.fn(async ({ currency }: { date: string; currency: string }) =>
      currency === "EUR" ? 1.08 : 0.0033,
    );
    const day = parseImportDateToLocalNoon("2026-11-01")!;
    const rates = await lockRatesForRows(
      [
        { date: day, currency: "EUR" },
        { date: day, currency: "EUR" },
        { date: day, currency: "LKR" },
        { date: day, currency: "USD" },
      ],
      fetchRate,
    );
    expect(rates).toEqual([1.08, 1.08, 0.0033, 1]);
    expect(fetchRate).toHaveBeenCalledTimes(2);
  });

  it("rejects when a rate is missing or invalid", async () => {
    const day = parseImportDateToLocalNoon("2026-11-01")!;
    await expect(
      lockRatesForRows([{ date: day, currency: "EUR" }], async () => 0),
    ).rejects.toThrow(/EUR/);
  });
});
