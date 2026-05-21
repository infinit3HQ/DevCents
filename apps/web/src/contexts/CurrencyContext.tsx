import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { dayKey } from "@/lib/planningUtils";

type ExchangeRates = {
  [currencyCode: string]: number;
};

interface ConvertOptions {
  date?: number;
  lockedRate?: number;
  baseCurrencyAtTime?: string;
}

interface CurrencyContextType {
  baseCurrency: string;
  setBaseCurrency: (code: string) => Promise<void>;
  convertAmount: (amount: number, fromCurrency: string, options?: ConvertOptions) => number;
  getHistoricalRate: (date: number, fromCurrency: string, toCurrency: string) => Promise<number>;
  ratesLoaded: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined,
);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const baseCurrency = useQuery(api.settings.getCurrency) || "USD";
  const updateCurrency = useMutation(api.settings.setCurrency);
  const fetchAndSaveRates = useAction(api.exchangeRates.fetchAndSaveRates);
  const [rates, setRates] = useState<ExchangeRates>({});
  const [historicalRates, setHistoricalRates] = useState<{ [date: string]: ExchangeRates }>({});
  const [ratesLoaded, setRatesLoaded] = useState(false);

  useEffect(() => {
    // Fetch latest exchange rates with USD as the implicit base for API response
    async function fetchRates() {
      try {
        const res = await fetch("https://api.fxratesapi.com/latest");
        const data = await res.json();
        if (data && data.rates) {
          setRates(data.rates);
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

  const getHistoricalRate = useCallback(async (date: number, fromCurrency: string, toCurrency: string): Promise<number> => {
    const dKey = dayKey(date);
    let dayRates = historicalRates[dKey];

    if (!dayRates) {
      try {
        const result = await fetchAndSaveRates({ date: dKey });
        if (result) {
          setHistoricalRates(prev => ({ ...prev, [dKey]: result }));
          dayRates = result;
        }
      } catch (err) {
        console.error("Failed to fetch historical rates", err);
        return 1;
      }
    }

    if (!dayRates || !dayRates[fromCurrency] || !dayRates[toCurrency]) {
      return 1;
    }

    // Rate is relative to USD (base of the API)
    // Convert fromCurrency to USD, then USD to toCurrency
    const inUSD = 1 / dayRates[fromCurrency];
    return inUSD * dayRates[toCurrency];
  }, [historicalRates, fetchAndSaveRates]);

  const handleSetBaseCurrency = async (code: string) => {
    await updateCurrency({ currency: code });
  };

  const convertAmount = (amount: number, fromCurrency: string, options?: ConvertOptions) => {
    if (!ratesLoaded || !rates[fromCurrency] || !rates[baseCurrency]) {
      return amount;
    }

    // 1. Handle locked rate
    if (options?.lockedRate !== undefined && options?.baseCurrencyAtTime) {
      if (options.baseCurrencyAtTime === baseCurrency) {
        return amount * options.lockedRate;
      }
      // If the locked rate was relative to a different base currency, 
      // we first convert to that base, then to current base.
      const amountInOldBase = amount * options.lockedRate;
      // Convert old base to current base using LATEST rates (since we don't have historical oldBase->currentBase easily)
      // Actually, if we store everything relative to USD, it's easier.
      // For now, assume lockedRate is relative to baseCurrencyAtTime.
      const oldBaseToUSD = 1 / rates[options.baseCurrencyAtTime];
      const usdToBase = rates[baseCurrency];
      return amountInOldBase * oldBaseToUSD * usdToBase;
    }

    if (fromCurrency === baseCurrency) {
      return amount;
    }

    // 2. Handle historical date (this is synchronous, so it only works if rates are ALREADY loaded)
    // In practice, for historical components, we might need a way to pre-fetch.
    // For now, if date is provided and we have it, use it.
    if (options?.date) {
      const dKey = dayKey(options.date);
      const dayRates = historicalRates[dKey];
      if (dayRates && dayRates[fromCurrency] && dayRates[baseCurrency]) {
        const amountInUSD = amount / dayRates[fromCurrency];
        return amountInUSD * dayRates[baseCurrency];
      }
    }

    // 3. Fallback to latest rates
    const amountInUSD = amount / rates[fromCurrency];
    return amountInUSD * rates[baseCurrency];
  };

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        setBaseCurrency: handleSetBaseCurrency,
        convertAmount,
        getHistoricalRate,
        ratesLoaded,
      }}
    >
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
