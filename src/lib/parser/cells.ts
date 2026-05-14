// Cell-lookup primitives for SheetJS worksheets.
//
// Ported from _prototype/index.html §2.1. Every parser routine that
// "find the X cell" goes through one of these. Type annotations make
// the contracts explicit, but the runtime semantics are byte-for-byte
// what the prototype shipped.

import * as XLSX from "xlsx";
import type { WorkSheet, CellObject } from "xlsx";

/**
 * Result of a cell lookup. `value` is the raw cell value (preserves
 * Date instances, numbers, strings); `raw` is the trimmed string form
 * for caller-side matching.
 */
export interface CellHit {
  r: number;
  c: number;
  value: NonNullable<CellObject["v"]>;
  raw: string;
}

export interface FindCellOptions {
  /** Inclusive row bounds. Default: full sheet range. */
  startR?: number;
  endR?: number;
}

function getSheetRange(sheet: WorkSheet): XLSX.Range | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  return XLSX.utils.decode_range(ref);
}

function getCell(sheet: WorkSheet, r: number, c: number): CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r, c })] as CellObject | undefined;
}

/**
 * Find the FIRST cell whose value matches `pattern`. String patterns use
 * case-insensitive substring match; RegExp patterns test directly.
 *
 * NOTE the substring-vs-equality difference from `findAllCells` (see below).
 */
export function findCell(
  sheet: WorkSheet,
  pattern: string | RegExp,
  opts: FindCellOptions = {},
): CellHit | null {
  const range = getSheetRange(sheet);
  if (!range) return null;
  const isRe = pattern instanceof RegExp;
  const startR = opts.startR ?? range.s.r;
  const endR = opts.endR ?? range.e.r;
  for (let r = startR; r <= endR; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim();
      if (!s) continue;
      const match = isRe
        ? (pattern as RegExp).test(s)
        : s.toLowerCase().includes(String(pattern).toLowerCase());
      if (match) {
        return { r, c, value: cell.v as NonNullable<CellObject["v"]>, raw: s };
      }
    }
  }
  return null;
}

/**
 * Find ALL cells matching `pattern`, in document order.
 *
 * IMPORTANT: when `pattern` is a string, this uses EQUALITY (case-insensitive),
 * not substring. That's a behavioral difference from `findCell` and is
 * relied on by `extractPerDateRows` / `extractWeeklyTotals` — searching for
 * `"offering"` should match `"Offering"` headers but not `"95% of Offering"`.
 */
export function findAllCells(sheet: WorkSheet, pattern: string | RegExp): CellHit[] {
  const range = getSheetRange(sheet);
  if (!range) return [];
  const isRe = pattern instanceof RegExp;
  const out: CellHit[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim();
      if (!s) continue;
      const match = isRe
        ? (pattern as RegExp).test(s)
        : s.toLowerCase() === String(pattern).toLowerCase();
      if (match) {
        out.push({ r, c, value: cell.v as NonNullable<CellObject["v"]>, raw: s });
      }
    }
  }
  return out;
}

/**
 * Find a label, then walk RIGHT collecting the next non-empty cell.
 *
 * KNOWN LIMITATION (spec §11.1, §11.14): if other labels sit on the same row
 * with empty cells between them (e.g. F3="Name Of Parish" and K3="Pastor In
 * Charge"), this returns the NEXT label as the value. Use `valueForHeaderLabel`
 * for any header-row field where the value lives BELOW the label.
 */
export function valueRightOf(
  sheet: WorkSheet,
  label: string | RegExp,
  opts: FindCellOptions = {},
): CellObject["v"] | null {
  const hit = findCell(sheet, label, opts);
  if (!hit) return null;
  const range = getSheetRange(sheet);
  if (!range) return null;
  for (let c = hit.c + 1; c <= range.e.c; c++) {
    const cell = getCell(sheet, hit.r, c);
    if (cell && cell.v != null && String(cell.v).trim() !== "") {
      return cell.v;
    }
  }
  return null;
}

/**
 * Resolve a header-row label's value: prefer the cell DIRECTLY BELOW it,
 * fall back to right-walking only if below is empty.
 *
 * This is the fix for the parish-name-as-pastor-name bug (spec §11.1).
 * Use for parish, pastor, mobile, email, month/year — anything in Row 1.
 */
export function valueForHeaderLabel(
  sheet: WorkSheet,
  label: string | RegExp,
): CellObject["v"] | null {
  const hit = findCell(sheet, label);
  if (!hit) return null;
  const below = getCell(sheet, hit.r + 1, hit.c);
  if (below && below.v != null && String(below.v).trim() !== "") {
    return below.v;
  }
  return valueRightOf(sheet, label);
}

/**
 * Scan every cell for a string matching `pattern`. Returns the first
 * trimmed match, or null. Used as a final fallback for fields whose
 * label may not exist in a given template variant (email, mobile).
 */
export function scanSheetFor(sheet: WorkSheet, pattern: RegExp): string | null {
  const range = getSheetRange(sheet);
  if (!range) return null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim();
      if (!s) continue;
      if (pattern.test(s)) return s;
    }
  }
  return null;
}

/** Email shape fallback. */
export function findEmailInSheet(sheet: WorkSheet): string | null {
  return scanSheetFor(sheet, /^[\w.+-]+@[\w-]+\.[\w.-]+$/);
}

/**
 * Mobile-number heuristic. Phone-shaped strings only:
 *  - characters limited to digits, `+`, space, `-`, `(`, `)`, `.`
 *  - ≥7 digits total
 *  - must contain at least one formatting char (space/dash/+/paren/dot)
 *    OR have ≥9 digits — guards against matching short numeric cells
 *    like attendance counts.
 */
export function findMobileInSheet(sheet: WorkSheet): string | null {
  const range = getSheetRange(sheet);
  if (!range) return null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim();
      if (!s) continue;
      if (!/^[+\d\s\-().]+$/.test(s)) continue;
      const digitCount = (s.match(/\d/g) ?? []).length;
      if (digitCount < 7) continue;
      const looksFormatted = /[\s\-+().]/.test(s);
      if (!looksFormatted && digitCount < 9) continue;
      return s;
    }
  }
  return null;
}

// Re-export sheet helpers under explicit names so the rest of the parser
// doesn't repeat the encode/decode dance.
export { XLSX };
export const encodeCell = XLSX.utils.encode_cell;
export const decodeRange = XLSX.utils.decode_range;
export { getCell, getSheetRange };
