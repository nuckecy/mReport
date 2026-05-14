"use server";

// Report submission server action.
//
// FLOW
//   1. AuthN/AuthZ via `requireAuth` — pinned to appSlug=mreport, so
//      RLS-level checks still execute downstream.
//   2. Parse + validate the input with Zod.
//   3. Re-derive the canonical `report_month` from the report's detected
//      month/year — never trust the client's serialized version.
//   4. Resolve the parish_id by case-insensitive parish-name lookup
//      against `mreport_parishes`. Refuse if the file's parish doesn't
//      match the user's scope (preparer / parish_admin).
//   5. Check for a duplicate (parish_id, report_month) — if one exists
//      AND no amendmentNote was supplied, return `needs_amendment_note`
//      so the UI can collect the note and retry.
//   6. Upload the .xlsx to Storage at `<tenant>/<parish>/<YYYY-MM>.xlsx`.
//      Storage RLS enforces tenant membership at the bucket level.
//   7. Insert `mreport_reports` (status='submitted' or 'amended') +
//      `mreport_report_lines` (one row per dated per-date entry).
//   8. If this is an amendment, mark any prior submission for the same
//      (parish_id, report_month) as `superseded`.
//   9. Write `mreport_audit_log` entries: one for the upload + one for
//      the submit (or amend).
//
// All DB writes happen inside a single Drizzle transaction so partial
// state is impossible.

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  mreportAuditLog,
  mreportParishes,
  mreportReportLines,
  mreportReports,
} from "@/lib/db/schema/mreport";
import { requireAuth } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Report } from "@/lib/parser";
import { SubmitReportInputSchema, type SubmitReportInput, type SubmitReportResult } from "./types";
import { decodeBase64ToBytes, reportMonthDate, storageKey } from "./path";

const STORAGE_BUCKET = "mreport-reports";

export async function submitReportAction(input: SubmitReportInput): Promise<SubmitReportResult> {
  // 1. Auth.
  const session = await requireAuth();

  // 2. Input shape.
  const parsed = SubmitReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      reason: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid submission payload.",
    };
  }
  const { fileBase64, filename, amendmentNote } = parsed.data;
  // The action validates the wire shape but the parser-derived `report`
  // structure is too deep to be worth duplicating in Zod. We cast here
  // because the client never sees this type — they only see the JSON
  // round-trip. We treat downstream reads as untrusted and check fields.
  const report = parsed.data.report as Report;

  // 3. Re-derive month from the report, never trust the client's
  //    `report_month` string.
  if (report.source.monthIndex == null || report.source.year == null) {
    return {
      status: "error",
      reason: "month_unknown",
      message: "Could not detect the report month from the file.",
    };
  }
  const reportMonth = reportMonthDate(report);
  if (!reportMonth) {
    return {
      status: "error",
      reason: "month_unknown",
      message: "Could not detect the report month from the file.",
    };
  }

  // 4. Refuse outdated-template files.
  if (!report.templateValidity.valid) {
    return {
      status: "error",
      reason: "template_invalid",
      message: "The file uses an outdated template; re-export and try again.",
    };
  }

  // 5. Resolve parish.
  const parishName = report.source.parish?.trim();
  if (!parishName) {
    return {
      status: "error",
      reason: "parish_not_found",
      message: "The file doesn't name a parish — fill in Row 1 and try again.",
    };
  }
  const parishRows = await db
    .select({ id: mreportParishes.id, name: mreportParishes.name })
    .from(mreportParishes)
    .where(eq(mreportParishes.tenant_id, session.tenantId))
    .limit(50);
  const parish = parishRows.find((p) => p.name.trim().toLowerCase() === parishName.toLowerCase());
  if (!parish) {
    return {
      status: "error",
      reason: "parish_not_found",
      message: `No parish named "${parishName}" exists in this workspace. Contact your admin.`,
    };
  }

  // 6. Parish-mismatch — enforce for scoped roles. super_admin /
  //    regional_admin / platform_admin can submit any parish.
  if (
    session.scope?.parishName &&
    session.role !== "super_admin" &&
    session.role !== "platform_admin" &&
    session.role !== "regional_admin" &&
    session.scope.parishName.trim().toLowerCase() !== parishName.toLowerCase()
  ) {
    return {
      status: "error",
      reason: "parish_mismatch",
      message: `Your account is scoped to ${session.scope.parishName}, but the file is for ${parishName}.`,
    };
  }

  // 7. Duplicate detection.
  const existing = await db
    .select({
      id: mreportReports.id,
      status: mreportReports.status,
      report_month: mreportReports.report_month,
    })
    .from(mreportReports)
    .where(
      and(
        eq(mreportReports.tenant_id, session.tenantId),
        eq(mreportReports.parish_id, parish.id),
        eq(mreportReports.report_month, reportMonth),
      ),
    )
    .limit(5);
  // Look for an existing live submission (anything not already superseded).
  const liveExisting = existing.find((r) => r.status !== "superseded");
  const isAmendment = !!liveExisting;
  if (isAmendment && !amendmentNote?.trim()) {
    return {
      status: "needs_amendment_note",
      existingReportId: liveExisting!.id,
      existingMonth: reportMonth,
    };
  }

  // 8. Storage upload. Path: <tenant>/<parish>/<YYYY-MM>.xlsx.
  const key = storageKey(session.tenantId, parish.id, report);
  if (!key) {
    return {
      status: "error",
      reason: "month_unknown",
      message: "Could not derive a storage path for this month.",
    };
  }
  const bytes = decodeBase64ToBytes(fileBase64);

  const supabase = await createSupabaseServerClient();
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(key, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true, // amendments overwrite the previous .xlsx for that month
    cacheControl: "0",
  });
  if (uploadError) {
    return {
      status: "error",
      reason: "storage_failed",
      message: `Couldn't save the file to storage: ${uploadError.message}`,
    };
  }

  // 9. Pull request-context bits for the audit log.
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 200) ?? null;

  // 10. Transactional inserts.
  let newReportId: string;
  try {
    newReportId = await db.transaction(async (tx) => {
      // Mark prior live submissions as superseded (only on amendment).
      if (isAmendment) {
        await tx
          .update(mreportReports)
          .set({ status: "superseded", updated_at: new Date() })
          .where(
            and(
              eq(mreportReports.tenant_id, session.tenantId),
              eq(mreportReports.parish_id, parish.id),
              eq(mreportReports.report_month, reportMonth),
            ),
          );
      }

      // Insert the report header.
      const [inserted] = await tx
        .insert(mreportReports)
        .values({
          tenant_id: session.tenantId,
          parish_id: parish.id,
          report_month: reportMonth,
          pastor_name: report.source.pastor ?? null,
          attendance_avg: numericOrNull(report.parishRecords.averageAttendance),
          total_offering: numericOrNull(report.parishRecords.totalOffering),
          total_tithe: numericOrNull(report.parishRecords.totalTithe),
          total_thanksgiving: numericOrNull(report.parishRecords.totalThanksgiving),
          total_others: numericOrNull(report.parishRecords.totalOthers),
          total_income: numericOrNull(report.parishRecords.sum),
          submitted_by: session.userId,
          status: isAmendment ? "amended" : "submitted",
          amendment_note: isAmendment ? amendmentNote!.trim() : null,
          superseded_by: null,
          raw_json: report as unknown as Record<string, unknown>,
          source_file: filename,
        })
        .returning({ id: mreportReports.id });
      if (!inserted) throw new Error("Insert returned no rows");

      const reportId = inserted.id;

      // Insert per-date lines for every dated entry.
      const lineRows = report.perDate
        .filter((d) => d.date)
        .map((d) => {
          const stats = findStatsForDate(report, d.date);
          return {
            report_id: reportId,
            tenant_id: session.tenantId,
            entry_date: d.date as string,
            day_label: d.day || null,
            men: Math.round(d.attendance.men),
            women: Math.round(d.attendance.women),
            children: Math.round(d.attendance.children),
            attendance_total: d.attendance.totalReported ?? null,
            offering: String(d.money.offering),
            tithe: String(d.money.tithe),
            thanksgiving: String(d.money.thanksgiving),
            others: String(d.money.others),
            money_total: d.money.totalReported != null ? String(d.money.totalReported) : null,
            births: stats.births,
            marriages: stats.marriages,
            deaths: stats.deaths,
            converts: stats.converts,
            baptisms: stats.baptisms,
            workers: stats.workers,
            ministers: stats.ministers,
            disciplinary: stats.disciplinary,
            new_parishes: stats.newParishes,
            new_nations: stats.newNations,
            church_dedication: stats.churchDedication,
            projects: stats.projects,
          };
        });
      if (lineRows.length) {
        await tx.insert(mreportReportLines).values(lineRows);
      }

      // Audit log — one entry for the storage upload, one for the submit.
      await tx.insert(mreportAuditLog).values([
        {
          tenant_id: session.tenantId,
          actor_id: session.userId,
          actor_email_masked: maskEmail(session.email),
          action: "report.file_uploaded",
          target_type: "mreport_reports",
          target_id: reportId,
          ip,
          user_agent_summary: userAgent,
          metadata: {
            storage_bucket: STORAGE_BUCKET,
            storage_path: key,
            filename,
            parish_id: parish.id,
            report_month: reportMonth,
          },
        },
        {
          tenant_id: session.tenantId,
          actor_id: session.userId,
          actor_email_masked: maskEmail(session.email),
          action: isAmendment ? "report.amended" : "report.submitted",
          target_type: "mreport_reports",
          target_id: reportId,
          ip,
          user_agent_summary: userAgent,
          metadata: {
            parish_id: parish.id,
            report_month: reportMonth,
            amendment_note: isAmendment ? amendmentNote!.trim() : null,
          },
        },
      ]);

      return reportId;
    });
  } catch (err) {
    return {
      status: "error",
      reason: "db_failed",
      message: err instanceof Error ? `Database error: ${err.message}` : "Database error.",
    };
  }

  return { status: "success", reportId: newReportId, storagePath: key };
}

// ── helpers ──────────────────────────────────────────────────────────

function numericOrNull(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return String(n);
}

/**
 * Mask an email for audit-log storage. We keep the first 2 chars + the
 * domain so an admin reviewing logs has enough context to identify the
 * actor without persisting the full PII string.
 *
 *   "alice@example.org" → "al***@example.org"
 */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, 2) + "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

function findStatsForDate(report: Report, date: string | null) {
  const empty = {
    births: 0,
    marriages: 0,
    deaths: 0,
    converts: 0,
    baptisms: 0,
    workers: 0,
    ministers: 0,
    disciplinary: 0,
    newParishes: 0,
    newNations: 0,
    churchDedication: 0,
    projects: 0,
  };
  if (!date) return empty;
  const row = report.statistics.perDate.find((s) => s.date === date);
  if (!row) return empty;
  return row.stats;
}
