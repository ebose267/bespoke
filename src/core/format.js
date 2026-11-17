/** Whole-currency price formatting. Tolerates missing or damaged values. */
export function money(value, symbol = '₦') {
  const n = Number(value);
  return symbol + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-NG');
}
export function percentOff(price, compareAt) {
  const p = Number(price), c = Number(compareAt);
  return c > p && p > 0 ? Math.round((1 - p / c) * 100) : 0;
}
