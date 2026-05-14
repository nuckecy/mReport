// Numeric coercion helpers.
//
// Ported verbatim from _prototype/index.html (NUM + round2). These behaviors
// are referenced across the parser and validation layers — anything that
// reads a cell value goes through NUM.

/**
 * Coerce an arbitrary cell value to a number.
 *
 * Rules (mirrored from the prototype):
 *  - null / undefined / "" → 0
 *  - already a number → as-is
 *  - string → parseFloat after stripping non-numeric chars (keeps `.` and `-`)
 *  - anything unparseable → 0 (NaN guard)
 *
 * NEVER throws. The parser deals with messy spreadsheet input — silent
 * coercion to 0 is the documented behavior.
 */
export function NUM(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Round to two decimal places. Used wherever monetary values are summed,
 * to avoid floating-point noise like 0.1 + 0.2 = 0.30000000000000004.
 *
 * Note: this does NOT change values inside the per-date rows — averages
 * stay at full precision so the 0.05 tolerance check works correctly
 * (see spec §11.9). Only call this on already-aggregated monetary sums.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
