const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });

export const ALL_CURRENCIES: { code: string; label: string; symbol: string }[] =
  Intl.supportedValuesOf("currency").map((code) => {
    const symbol = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? code;

    return {
      code,
      label: displayNames.of(code) ?? code,
      symbol,
    };
  });

/** @deprecated use ALL_CURRENCIES -- remove in v2.0 */
export const SUPPORTED_CURRENCIES = ALL_CURRENCIES;

export function getCurrencySymbol(code: string): string {
  return ALL_CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

function getDecimals(code: string): number {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
  }).resolvedOptions().maximumFractionDigits;
}

export function formatCurrency(amount: number, code: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: getDecimals(code),
    maximumFractionDigits: getDecimals(code),
  }).format(amount);
}

export function formatAmountOnly(amount: number, code: string): string {
  const decimals = getDecimals(code);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
