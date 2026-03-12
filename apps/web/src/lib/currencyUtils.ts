export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "LKR", label: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
];

export function getCurrencySymbol(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return currency ? currency.symbol : "$";
}

export function formatCurrency(amount: number, code: string): string {
  const decimals = code === "JPY" ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatAmountOnly(amount: number, code: string): string {
  const decimals = code === "JPY" ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
