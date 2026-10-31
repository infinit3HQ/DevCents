import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption } from "@/contexts/EncryptionContext";
import {
  learnRule,
  matchRule,
  merchantKey,
  parseRules,
  serializeRules,
  type CategoryRules,
} from "@devcents/shared/categoryRules";
import {
  suggestCategory,
  type Category,
  type EntryType,
} from "@devcents/shared/categories";

/**
 * Learned merchant → category rules for the signed-in user.
 *
 * Rules are stored as one blob, encrypted with the user's key when encryption
 * is on. While the vault is locked the rules can't be read or written, so
 * `suggest` falls back to keyword matching and `learn` is a no-op.
 */
export function useCategoryRules() {
  const row = useQuery(api.categoryRules.get);
  const save = useMutation(api.categoryRules.save);
  const { isEnabled, isUnlocked, encryptValue, decryptValue } = useEncryption();
  const [rules, setRules] = useState<CategoryRules | null>(null);
  const rulesRef = useRef<CategoryRules | null>(null);
  rulesRef.current = rules;

  const canUse = !isEnabled || isUnlocked;

  useEffect(() => {
    if (row === undefined) return; // loading
    if (row === null) {
      setRules({});
      return;
    }
    if (row.encrypted && !isUnlocked) {
      setRules(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const json = row.encrypted ? await decryptValue(row.data) : row.data;
        if (!cancelled) setRules(parseRules(json));
      } catch {
        if (!cancelled) setRules({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row, isUnlocked, decryptValue]);

  /** Learned category first, then description keywords. */
  const suggest = useCallback(
    (description: string, type: EntryType): Category => {
      return matchRule(rulesRef.current, description, type) ?? suggestCategory(description, type);
    },
    [],
  );

  const learned = useCallback(
    (description: string, type: EntryType): Category | null =>
      matchRule(rulesRef.current, description, type),
    [],
  );

  /** Records several choices with a single save. */
  const learnMany = useCallback(
    async (choices: Array<{ description: string; category: string; type: EntryType }>) => {
      if (!canUse || rulesRef.current === null) return;
      let next = rulesRef.current;
      let changed = false;
      for (const { description, category, type } of choices) {
        // Whether a withdrawal is your own money or spending depends on who
        // used the cash, not the merchant, so never learn transfers.
        if (category === "transfer") continue;
        const key = merchantKey(description);
        if (!key) continue;
        const existing = next[key];
        if (existing && existing.c === category && existing.t === type) continue;
        next = learnRule(next, description, category as Category, type);
        changed = true;
      }
      if (!changed) return;
      rulesRef.current = next;
      setRules(next);
      const json = serializeRules(next);
      const shouldEncrypt = isEnabled && isUnlocked;
      try {
        await save({
          data: shouldEncrypt ? await encryptValue(json) : json,
          encrypted: shouldEncrypt,
        });
      } catch (err) {
        console.error("Failed to save category rule", err);
      }
    },
    [canUse, isEnabled, isUnlocked, encryptValue, save],
  );

  const learn = useCallback(
    (description: string, category: string, type: EntryType) =>
      learnMany([{ description, category, type }]),
    [learnMany],
  );

  return { rules, ready: rules !== null, suggest, learned, learn, learnMany };
}
