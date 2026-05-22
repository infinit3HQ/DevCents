import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  computeWalletBalances,
  type WalletBalances,
  type WalletInputTx,
} from "@/lib/walletBalances";

type ExchangeRates = {
  [currencyCode: string]: number;
};

interface CurrencyContextType {
  baseCurrency: string;
  setBaseCurrency: (code: string) => Promise<void>;
  /**
   * Convert an amount from `fromCurrency` to the user's current base
   * currency using the latest fxratesapi snapshot. This is for live /
   * "approximate" displays only — historical-locked numbers are produced
   * by `computeBalances` instead, which never re-prices through today's
   * rates.
   */
  convertAmount: (amount: number, fromCurrency: string) => number;
  /**
   * Walk a transaction history chronologically and return per-wallet
   * native-currency balances with greedy spillover. Returns null until
   * the live rates fallback table is loaded so we don't silently miss
   * spillover decisions for currencies a date doesn't have rates for.
   */
  computeBalances: (txs: ReadonlyArray<WalletInputTx>) => WalletBalances | null;
  rates: ExchangeRates;
  ratesLoaded: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined,
);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const baseCurrency = useQuery(api.settings.getCurrency) || "USD";
  const updateCurrency = useMutation(api.settings.setCurrency);
  const [rates, setRates] = useState<ExchangeRates>({});
  const [ratesLoaded, setRatesLoaded] = useState(false);

  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch("https://api.fxratesapi.com/latest");
        const data = await res.json();
        if (data && data.rates) {
          // The API returns rates relative to USD but does not always include
          // USD itself in the map. Force USD: 1 so USD->X conversion works.
          setRates({
            ...data.rates,
            USD: data.rates.USD || 1,
          });
          setRatesLoaded(true);
        }
      } catch (err) {
        console.error("Failed to fetch exchange rates", err);
        // Fallback rates if API fails
        setRates({ USD: 1, LKR: 300, JPY: 150 });
        setRatesLoaded(true);
      }
    }
    fetchRates();
  }, []);

  const handleSetBaseCurrency = async (code: string) => {
    await updateCurrency({ currency: code });
  };

  const convertAmount = useCallback(
    (amount: number, fromCurrency: string) => {
      if (!ratesLoaded || !rates[fromCurrency] || !rates[baseCurrency]) {
        return amount;
      }
      if (fromCurrency === baseCurrency) return amount;
      const amountInUSD = amount / rates[fromCurrency];
      return amountInUSD * rates[baseCurrency];
    },
    [rates, ratesLoaded, baseCurrency],
  );

  const computeBalances = useCallback(
    (txs: ReadonlyArray<WalletInputTx>): WalletBalances | null => {
      if (!ratesLoaded) return null;
      return computeWalletBalances(txs, { liveRates: rates });
    },
    [rates, ratesLoaded],
  );

  const value = useMemo<CurrencyContextType>(
    () => ({
      baseCurrency,
      setBaseCurrency: handleSetBaseCurrency,
      convertAmount,
      computeBalances,
      rates,
      ratesLoaded,
    }),
    // handleSetBaseCurrency is stable enough; rest must be tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseCurrency, convertAmount, computeBalances, rates, ratesLoaded],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
