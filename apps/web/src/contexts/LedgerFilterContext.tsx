import { createContext, useContext } from "react";

/** Narrows the ledger to one category within a date range. */
export type LedgerFilter = {
  category: string; // canonical slug
  type: "income" | "expense";
  start: number; // inclusive, ms
  end: number; // inclusive, ms
  periodLabel: string; // e.g. "this month"
};

type LedgerFilterContextValue = {
  filter: LedgerFilter | null;
  setFilter: (filter: LedgerFilter | null) => void;
};

export const LedgerFilterContext = createContext<LedgerFilterContextValue>({
  filter: null,
  setFilter: () => {},
});

export const useLedgerFilter = () => useContext(LedgerFilterContext);
