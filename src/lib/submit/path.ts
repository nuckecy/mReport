// Helpers for building Storage object keys + per-month dates.
//
// Pure functions, no DB or Supabase client dependencies — fully unit-testable.

import type { Report } from "@/lib/parser";

/**
 * The first day of the report's month, formatted as YYYY-MM-DD. This is
 * what we store in `mreport_reports.report_month` so two submissions for
 * the same month collide on a unique (parish_id, report_month) lookup.
 *
 * Returns null if the report didn't get a month/year detected.
 */
export function reportMonthDate(report: Report): string | null {
  const m = report.source.monthIndex;
  const y = report.source.year;
  if (m == null || y == null) return null;
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-01`;
}

/** "October 2025" → "2025-10" for the storage key. */
export function reportMonthSlug(report: Report): string | null {
  const m = report.source.monthIndex;
  const y = report.source.year;
  if (m == null || y == null) return null;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Build the Storage object key for an uploaded report.
 *   <tenant_id>/<parish_id>/<YYYY-MM>.xlsx
 *
 * Returns null if the month couldn't be determined — callers should
 * refuse to submit in that case.
 */
export function storageKey(tenantId: string, parishId: string, report: Report): string | null {
  const slug = reportMonthSlug(report);
  if (!slug) return null;
  return `${tenantId}/${parishId}/${slug}.xlsx`;
}

/** Decode a base64 payload to raw bytes. Works in Node and browser runtimes. */
export function decodeBase64ToBytes(b64: string): Uint8Array {
  // Node 18+ has Buffer; Edge runtime has atob. The server action runs in
  // Node (middleware constraint) so Buffer is the simpler path.
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
