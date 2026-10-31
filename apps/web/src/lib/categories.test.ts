import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  normalizeCategory,
  suggestCategory,
} from "@devcents/shared/categories";

describe("normalizeCategory (category names)", () => {
  const cases: Array<[string, string]> = [
    // Labels seen in the dashboard legend
    ["Other", "other"],
    ["Food", "food"],
    ["Food and Dining", "food"],
    ["FOOD & DINING", "food"],
    ["Groceries", "groceries"],
    ["Grocery Shopping", "groceries"],
    ["Shopping", "shopping"],
    [" shopping ", "shopping"],
    ["Online Shopping", "shopping"],
    ["Rent", "rent"],
    ["Housing", "rent"],
    ["Utilities", "utilities"],
    ["Utilities & Bills", "utilities"],
    ["Home and Living", "home"],
    ["Furniture & Living", "home"],
    ["Home Appliances", "home"],
    ["Home Services", "home"],
    ["Household & Cleaning", "home"],
    ["Tools & Hardware", "home"],
    ["Transport", "transport"],
    ["Health", "health"],
    ["Entertainment", "entertainment"],
    ["Family", "family"],
    ["Loans", "loans"],
    ["Bank Loan Installments", "loans"],
    ["Credit Card Payments", "credit_card"],
    ["credit_card", "credit_card"],
    ["Buying Clothes", "clothing"],
    ["Business Expenses", "other"],
    ["Cash", "other"],
  ];
  it.each(cases)("%s → %s", (raw, expected) => {
    expect(normalizeCategory(raw, "expense")).toBe(expected);
  });

  it("is idempotent for every canonical slug", () => {
    for (const c of EXPENSE_CATEGORIES) expect(normalizeCategory(c.value, "expense")).toBe(c.value);
    for (const c of INCOME_CATEGORIES) expect(normalizeCategory(c.value, "income")).toBe(c.value);
    for (const c of EXPENSE_CATEGORIES) expect(normalizeCategory(c.label, "expense")).toBe(c.value);
    for (const c of INCOME_CATEGORIES) expect(normalizeCategory(c.label, "income")).toBe(c.value);
  });

  it("only treats explicit transfer category names as transfers", () => {
    expect(normalizeCategory("Transfer", "expense")).toBe("transfer");
    expect(normalizeCategory("Self Transfer", "income")).toBe("transfer");
    expect(normalizeCategory("Cash", "expense", "ATM Cash Withdrawal")).toBe("other");
    expect(normalizeCategory("Family", "expense", "Family Support — Transfer")).toBe("family");
    expect(suggestCategory("Family Support — Transfer", "expense")).toBe("other");
  });

  it("respects entry type", () => {
    expect(normalizeCategory("Salary", "income")).toBe("salary");
    expect(normalizeCategory("Freelance", "income")).toBe("freelance");
    expect(normalizeCategory("Food", "income")).toBe("other");
  });

  it("falls back to the description when the name is unknown", () => {
    expect(normalizeCategory("Cash", "expense", "Keells weekly run")).toBe("groceries");
    expect(normalizeCategory("Misc", "expense", "HNB credit card payment")).toBe("credit_card");
    expect(normalizeCategory("", "expense", "Car loan installment")).toBe("loans");
  });
});

describe("suggestCategory (descriptions)", () => {
  const cases: Array<[string, string]> = [
    ["Dinner at Ministry of Crab restaurant", "food"],
    ["Bought vegetables at the supermarket", "groceries"],
    ["Daraz online order", "shopping"],
    ["New jeans and shirt", "clothing"],
    ["Netflix monthly", "subscriptions"],
    ["CEB electricity", "utilities"],
    ["Facebook ads", "other"],
    ["Uber to office", "transport"],
    ["Uber Eats lunch", "food"],
    ["Vehicle leasing installment", "loans"],
  ];
  it.each(cases)("%s → %s", (desc, expected) => {
    expect(suggestCategory(desc, "expense")).toBe(expected);
  });
});
