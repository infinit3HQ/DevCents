import { createContext, useContext, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type ExchangeRates = {
  [currencyCode: string]: number;
};

interface CurrencyContextType {
  baseCurrency: string;
  setBaseCurrency: (code: string) => Promise<void>;
  convertAmount: (amount: number, fromCurrency: string) => number;
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
    // Fetch latest exchange rates with USD as the implicit base for API response
    async function fetchRates() {
      try {
        const res = await fetch("https://api.fxratesapi.com/latest");
        const data = await res.json();
        if (data && data.rates) {
          setRates({
            USD: data.rates.USD || 1,
            LKR: data.rates.LKR,
            JPY: data.rates.JPY,
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

  const convertAmount = (amount: number, fromCurrency: string) => {
    if (!ratesLoaded || !rates[fromCurrency] || !rates[baseCurrency]) {
      return amount; // Just return un-converted if loading or missing
    }
    if (fromCurrency === baseCurrency) {
      return amount;
    }

    // Convert logic: amount * (targetRate / sourceRate)
    const amountInUSD = amount / rates[fromCurrency];
    return amountInUSD * rates[baseCurrency];
  };

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        setBaseCurrency: handleSetBaseCurrency,
        convertAmount,
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
