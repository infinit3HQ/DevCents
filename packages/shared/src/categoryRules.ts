/**
 * Learned "merchant → category" rules.
 *
 * When a user re-categorizes an entry by hand, we remember the choice keyed by
 * a short merchant key derived from the description ("Keells Super Colombo 03"
 * → "keells super"). Future entries with the same key get that category.
 *
 * The rules contain merchant names, so callers store them as one encrypted
 * blob (see `serializeRules` / `parseRules`). Pure module, no dependencies.
 */

import type { Category, EntryType } from "./categories.js";

export type CategoryRule = {
  /** Canonical category slug */
  c: Category;
  /** Entry type the rule applies to */
  t: EntryType;
  /** Last updated, ms since epoch */
  u: number;
};

export type CategoryRules = Record<string, CategoryRule>;

export const MAX_CATEGORY_RULES = 500;

// Words that carry no merchant identity in bank/card descriptions.
const NOISE_WORDS = new Set([
  "pos", "purchase", "payment", "pymt", "pmt", "txn", "trx", "ref", "debit",
  "card", "visa", "mastercard", "online", "the", "at", "to", "from", "for",
  "and", "of", "in", "on", "via", "inv", "invoice", "no", "id", "ltd", "pvt",
  "plc", "inc", "llc", "co", "transfer", "trf", "ft", "ib", "cash",
]);

/**
 * Short, stable key for a description: the first two meaningful words,
 * lowercased, letters only. Returns "" when nothing usable remains.
 */
export function merchantKey(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !NOISE_WORDS.has(w));
  return words.slice(0, 2).join(" ");
}

/** Returns the learned category for a description, or null. */
export function matchRule(
  rules: CategoryRules | null | undefined,
  description: string,
  type: EntryType,
): Category | null {
  if (!rules) return null;
  const key = merchantKey(description);
  if (!key) return null;

  const exact = rules[key];
  if (exact && exact.t === type) return exact.c;

  // Fall back to the first word ("aeon mall" → rules learned for "aeon …"),
  // but only when it's distinctive and every matching rule agrees.
  const first = key.split(" ")[0];
  if (first.length < 4) return null;
  let found: Category | null = null;
  for (const [k, rule] of Object.entries(rules)) {
    if (rule.t !== type || k.split(" ")[0] !== first) continue;
    if (found && found !== rule.c) return null;
    found = rule.c;
  }
  return found;
}

/** Returns a new rules object with the choice recorded (capped by recency). */
export function learnRule(
  rules: CategoryRules | null | undefined,
  description: string,
  category: Category,
  type: EntryType,
  now: number = Date.now(),
): CategoryRules {
  const key = merchantKey(description);
  const next: CategoryRules = { ...(rules ?? {}) };
  if (!key) return next;
  next[key] = { c: category, t: type, u: now };

  const keys = Object.keys(next);
  if (keys.length > MAX_CATEGORY_RULES) {
    keys
      .sort((a, b) => next[a].u - next[b].u)
      .slice(0, keys.length - MAX_CATEGORY_RULES)
      .forEach((k) => delete next[k]);
  }
  return next;
}

export function forgetRule(rules: CategoryRules, key: string): CategoryRules {
  const next = { ...rules };
  delete next[key];
  return next;
}

export function serializeRules(rules: CategoryRules): string {
  return JSON.stringify(rules);
}

/** Tolerant parse: bad or missing data yields an empty rule set. */
export function parseRules(json: string | null | undefined): CategoryRules {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: CategoryRules = {};
    for (const [k, r] of Object.entries(raw as Record<string, unknown>)) {
      const rule = r as Partial<CategoryRule>;
      if (
        typeof rule?.c === "string" &&
        (rule.t === "income" || rule.t === "expense") &&
        typeof rule.u === "number"
      ) {
        out[k] = rule as CategoryRule;
      }
    }
    return out;
  } catch {
    return {};
  }
}
