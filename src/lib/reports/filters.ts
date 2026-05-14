// Pure helpers for parsing the /admin/reports query string into typed
// filters. Lives separate from `queries.ts` so unit tests don't pull in
// Drizzle.

export interface ReportFilters {
  parishId?: string | null;
  /** YYYY-MM ("2025-10") — resolved to the first-of-month date in queries.ts. */
  month?: string | null;
  status?: "submitted" | "amended" | "superseded" | null;
}

/**
 * Parse loose query-string values into a typed ReportFilters object.
 * Anything that doesn't pass shape validation gets dropped silently — we
 * don't want a malformed URL to throw on a Server Component render.
 */
export function parseReportFilters(input: {
  parish?: unknown;
  month?: unknown;
  status?: unknown;
}): ReportFilters {
  const parishId =
    typeof input.parish === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.parish)
      ? input.parish
      : null;
  const month =
    typeof input.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)
      ? input.month
      : null;
  const status =
    input.status === "submitted" || input.status === "amended" || input.status === "superseded"
      ? input.status
      : null;
  return { parishId, month, status };
}

/** Convert a "2025-10" slug into a YYYY-MM-01 first-of-month date string. */
export function monthSlugToDate(slug: string): string {
  return `${slug}-01`;
}
