/**
 * Number/date formatters used across the UI. Same semantics as the prototype
 * helpers documented in `_prototype/EXTRACTED-SPEC.md` §5.
 *
 *   fmt       — money, EUR with 2 decimals (e.g. €1,070.00) — alias of fmtMoney
 *   fmtMoney  — Intl currency-formatted Euro string
 *   fmtInt    — integer with locale grouping
 *   fmtCount  — integer; rounds before display (5.4 → 5, 5.5 → 6)
 *   fmtSmart  — show no trailing zeros for integers, otherwise up to 2 decimals
 */

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  // Intl currency formatter with EUR. `en-DE` keeps the comma-thousand /
  // dot-decimal pattern the existing UI uses (so we don't suddenly flip
  // 5,500.00 → 5.500,00 — that's a separate locale call when we localise
  // the whole app).
  return Number(n).toLocaleString("en-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Alias retained so existing call sites pick up the EUR formatting. */
export const fmt = fmtMoney;

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

/**
 * Natural-language list join.
 *
 *   ["a"]           → "a"
 *   ["a", "b"]      → "a and b"
 *   ["a", "b", "c"] → "a, b, and c"
 */
export function friendlyJoin(items: string[]): string {
  if (!items || items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
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
