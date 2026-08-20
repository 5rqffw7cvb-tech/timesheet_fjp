export type BillingCurrency = "JPY" | "USD" | "VND";

export const BILLING_CURRENCIES: BillingCurrency[] = ["JPY", "USD", "VND"];

export function normalizeBillingCurrency(v: string | null | undefined): BillingCurrency {
  if (v === "USD" || v === "VND" || v === "JPY") return v;
  return "JPY";
}

export function currencySymbol(currency: BillingCurrency): string {
  if (currency === "USD") return "$";
  if (currency === "VND") return "VND";
  return "¥";
}
