import { describe, expect, it } from "vitest";
import {
  learnRule,
  matchRule,
  merchantKey,
  parseRules,
  serializeRules,
  MAX_CATEGORY_RULES,
} from "@devcents/shared/categoryRules";

describe("merchantKey", () => {
  it("keeps the first two meaningful words", () => {
    expect(merchantKey("Keells Super Colombo 03")).toBe("keells super");
    expect(merchantKey("POS PURCHASE AEON NISHIARAI TOKYO JP")).toBe("aeon nishiarai");
    expect(merchantKey("Dialog Axiata")).toBe("dialog axiata");
    expect(merchantKey("12345 / #")).toBe("");
  });
});

describe("learnRule / matchRule", () => {
  it("returns the learned category for the same merchant", () => {
    const rules = learnRule({}, "Keells Super Colombo 03", "groceries", "expense", 1);
    expect(matchRule(rules, "KEELLS SUPER KANDY", "expense")).toBe("groceries");
  });

  it("ignores rules for the other entry type", () => {
    const rules = learnRule({}, "Upwork Global", "freelance", "income", 1);
    expect(matchRule(rules, "Upwork Global", "expense")).toBeNull();
  });

  it("falls back to the first word when all rules agree", () => {
    let rules = learnRule({}, "AEON NISHIARAI TOKYO", "groceries", "expense", 1);
    expect(matchRule(rules, "AEON MALL KASHIWA", "expense")).toBe("groceries");
    rules = learnRule(rules, "AEON CINEMA", "entertainment", "expense", 2);
    expect(matchRule(rules, "AEON MALL KASHIWA", "expense")).toBeNull();
  });

  it("caps the rule count by dropping the oldest", () => {
    let rules = {};
    for (let i = 0; i < MAX_CATEGORY_RULES + 5; i++) {
      rules = learnRule(rules, `Shop ${String.fromCharCode(97 + (i % 26))}${i.toString(36)}x`, "shopping", "expense", i);
    }
    expect(Object.keys(rules).length).toBeLessThanOrEqual(MAX_CATEGORY_RULES);
  });

  it("round-trips through serialize/parse and tolerates garbage", () => {
    const rules = learnRule({}, "Keells Super", "groceries", "expense", 1);
    expect(parseRules(serializeRules(rules))).toEqual(rules);
    expect(parseRules("not json")).toEqual({});
    expect(parseRules('{"x":{"c":1}}')).toEqual({});
  });
});
