export function formatCurrency(value: number | undefined | null) {
  if (value == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | undefined | null) {
  if (value == null) return "0.00%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export function formatPips(value: number | undefined | null) {
  if (value == null) return "0.0";
  return value.toFixed(1);
}

export function formatNumber(value: number | undefined | null, decimals = 2) {
  if (value == null) return "0";
  return value.toFixed(decimals);
}

export function formatPrice(value: number | undefined | null, pair: string) {
  if (value == null) return "0.00000";
  // JPY pairs usually have 3 decimals, others 5
  const decimals = pair.includes("JPY") ? 3 : 5;
  return value.toFixed(decimals);
}
