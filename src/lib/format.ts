/**
 * Number/date formatters used across the UI. Same semantics as the prototype
 * helpers documented in `_prototype/EXTRACTED-SPEC.md` §5.
 *
 *   fmt       — money, always 2 decimals (e.g. 1,070.00)
 *   fmtInt    — integer with locale grouping
 *   fmtCount  — integer; rounds before display (5.4 → 5, 5.5 → 6)
 *   fmtSmart  — show no trailing zeros for integers, otherwise up to 2 decimals
 */

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

export function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString();
}

export function fmtSmart(n: number | null | undefined): string {
  if (n == null) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return Number.isInteger(num)
    ? num.toLocaleString()
    : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** YYYY-MM-DD → "April 11" (full month name, no zero-padding). */
export function formatLongDate(yyyymmdd: string | null | undefined): string | null {
  if (!yyyymmdd) return null;
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return yyyymmdd;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}
