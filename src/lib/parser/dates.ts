// Date parsing + month/year detection.
//
// Ported from _prototype/index.html §2.2 + §2.4. The defensive bits — UTC
// re-anchoring, pre-2000 guard, string-date fallback — are the result of
// real bugs documented in spec §11.2, §11.4, §11.5, §11.8.

import type { WorkSheet } from "xlsx";
import { decodeRange, getCell } from "./cells";

/**
 * Convert an Excel cell value to a local-midnight Date.
 *
 *  - Date instance → returned unchanged (caller may need to re-anchor UTC)
 *  - number (Excel serial) → local-midnight Date via day-arithmetic; the
 *    direct `setDate` approach avoids the UTC shift that pushed Sunday
 *    Nov 2 → Sat Nov 1 in negative-offset timezones (spec §11.4).
 *  - string → delegate to `parseStringDate`
 *  - anything else → null
 */
export function excelDateToJS(serial: unknown): Date | null {
  if (serial instanceof Date) return serial;
  if (typeof serial === "number") {
    const days = Math.floor(serial - 25569);
    const d = new Date(1970, 0, 1);
    d.setDate(d.getDate() + days);
    return d;
  }
  if (typeof serial === "string") {
    return parseStringDate(serial);
  }
  return null;
}

/**
 * Parse a date string. Handles, in order:
 *   1. ISO `YYYY-MM-DD`
 *   2. German `DD.MM.YYYY` (the October-2025 old template uses this)
 *   3. European `DD/MM/YYYY` or `MM/DD/YYYY` (assumes DD/MM)
 *   4. Native Date constructor fallback
 *
 * Two-digit years are bumped to 2000+. Returns local-midnight or null.
 */
export function parseStringDate(s: unknown): Date | null {
  if (!s) return null;
  const trimmed = String(s).trim();

  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }

  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as `YYYY-MM-DD` using LOCAL components.
 *
 * Never use `toISOString().slice(0, 10)` here — that shifts in UTC-negative
 * timezones (spec §11.4). Returns null for invalid dates.
 */
export function ymd(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const MONTHS = [
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
] as const;

export interface MonthYearDetection {
  month: number | null;
  year: number | null;
  label: string;
}

/**
 * Detect the report month/year by tallying every date-typed cell, preferring
 * Sundays.
 *
 * Defensive guards (spec §11.2, §11.5, §11.8):
 *  - Only counts cells explicitly typed as dates by Excel/SheetJS.
 *    Earlier versions coerced every numeric cell via excelDateToJS — that
 *    landed births-counts (e.g., `1`) on 1899-12-31 and outvoted the real
 *    Sunday dates with "March 1900".
 *  - SheetJS returns UTC-midnight Dates for serials; we re-anchor to local
 *    components so per-date YYYY-MM-DD strings line up with what the user
 *    expects in their timezone.
 *  - Reject anything before year 2000.
 */
export function detectMonthYear(sheet: WorkSheet): MonthYearDetection {
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const dates: Date[] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell) continue;

      let d: Date | null = null;
      if (cell.t === "d" || cell.v instanceof Date) {
        const raw = cell.v instanceof Date ? cell.v : new Date(cell.v as string | number);
        if (!Number.isNaN(raw.getTime())) {
          d = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
        }
      } else if (
        cell.t === "n" &&
        typeof cell.w === "string" &&
        /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cell.w)
      ) {
        const raw = new Date(cell.w);
        if (!Number.isNaN(raw.getTime())) d = raw;
      } else if (cell.t === "s" && typeof cell.v === "string") {
        const trimmed = cell.v.trim();
        if (
          /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(trimmed) ||
          /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)
        ) {
          d = parseStringDate(cell.v);
        }
      }

      if (d && d.getFullYear() >= 2000) dates.push(d);
    }
  }

  const sundays = dates.filter((d) => d.getDay() === 0);
  const pool = sundays.length ? sundays : dates;
  if (!pool.length) return { month: null, year: null, label: "Unknown" };

  const tally = new Map<string, number>();
  for (const d of pool) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [bestKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const [yearStr, monthStr] = bestKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return { month, year, label: `${MONTHS[month]} ${year}` };
}
