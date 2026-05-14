// Server-action input + result types for the report submission flow.
// Kept in their own module so we can unit-test the helpers (parsing,
// duplicate detection) without instantiating the Drizzle client.

import { z } from "zod";

/**
 * Wire format used between the upload UI and the server action.
 *
 * - `report` is the full Report object the parser produced — we ship the
 *   whole thing so the server doesn't need to re-parse the .xlsx.
 * - `fileBase64` carries the original .xlsx bytes (after auto-fixes).
 *   Base64 is used because Server Actions accept JSON-serializable input;
 *   FormData with binary blobs works too, but base64 keeps the action
 *   typed end-to-end. 10 MB ceiling matches the Storage bucket.
 * - `amendmentNote` is required iff the parish already has a report for
 *   the same month — the server checks and re-validates.
 *
 * Zod is the runtime guard. The action calls `.safeParse(input)` first.
 */
export const SubmitReportInputSchema = z.object({
  report: z.unknown(),
  fileBase64: z.string().min(1, "Missing the original file payload."),
  filename: z.string().min(1, "Missing the original filename.").max(255),
  amendmentNote: z.string().max(2000).optional(),
});

export type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;

/**
 * Tagged-union result. Callers branch on `status`.
 *
 * `needs_amendment_note` is the only non-error "soft" failure — the UI
 * collects the note and re-submits. Everything else is a hard failure
 * (validation, RLS, parish-not-found, etc.).
 */
export type SubmitReportResult =
  | { status: "success"; reportId: string; storagePath: string }
  | { status: "needs_amendment_note"; existingReportId: string; existingMonth: string }
  | { status: "error"; reason: SubmitErrorReason; message: string };

export type SubmitErrorReason =
  | "invalid_input"
  | "not_authenticated"
  | "no_role"
  | "parish_mismatch"
  | "parish_not_found"
  | "month_unknown"
  | "template_invalid"
  | "storage_failed"
  | "db_failed";
