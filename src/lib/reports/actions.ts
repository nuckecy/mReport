"use server";

// Reports admin server actions.
//
// `createReportFileSignedUrl` returns a short-lived signed URL for the
// original .xlsx that was uploaded with the report. RLS on storage.objects
// gates which tenant can read which path (see 0004_mreport_storage_bucket.sql),
// but signed URLs *bypass* RLS — so we re-check tenant membership here in
// the action before issuing the URL.

import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { mreportAuditLog, mreportReports, mreportParishes } from "@/lib/db/schema/mreport";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportMonthSlug } from "@/lib/submit/path";

const STORAGE_BUCKET = "mreport-reports";
const SIGNED_URL_TTL_SECONDS = 60; // short — admin clicks → downloads immediately

const SignedUrlInputSchema = z.object({
  reportId: z.string().uuid(),
});

export type SignedUrlResult =
  | { status: "success"; url: string }
  | { status: "error"; reason: SignedUrlErrorReason; message: string };

export type SignedUrlErrorReason = "invalid_input" | "not_found" | "storage_failed";

export async function createReportFileSignedUrlAction(input: {
  reportId: string;
}): Promise<SignedUrlResult> {
  const session = await requireAdmin();
  const parsed = SignedUrlInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", reason: "invalid_input", message: "Invalid report id." };
  }
  const { reportId } = parsed.data;

  // Resolve the storage key from the report row. We don't trust the
  // client's idea of the path — re-derive from tenant + parish + month.
  const rows = await db
    .select({
      tenantId: mreportReports.tenant_id,
      parishId: mreportReports.parish_id,
      reportMonth: mreportReports.report_month,
      monthIndex: mreportReports.raw_json,
      parishName: mreportParishes.name,
    })
    .from(mreportReports)
    .innerJoin(mreportParishes, eq(mreportParishes.id, mreportReports.parish_id))
    .where(and(eq(mreportReports.id, reportId), eq(mreportReports.tenant_id, session.tenantId)))
    .limit(1);
  const report = rows[0];
  if (!report) {
    return { status: "error", reason: "not_found", message: "Report not found." };
  }

  // Storage path: <tenant>/<parish>/<YYYY-MM>.xlsx — must match the
  // upload path in submitReport. We re-derive YYYY-MM from the raw JSON
  // we stored (source.monthIndex + source.year). report_month already
  // gives us YYYY-MM-01, so we slice it.
  const monthSlug = (report.reportMonth as string).slice(0, 7); // "YYYY-MM-01" → "YYYY-MM"
  // Sanity check via reportMonthSlug if the raw JSON has source info.
  const raw = report.monthIndex as { source?: { monthIndex?: number; year?: number } } | null;
  if (raw?.source?.monthIndex != null && raw.source.year != null) {
    const derivedSlug = reportMonthSlug({
      source: { monthIndex: raw.source.monthIndex, year: raw.source.year },
    } as Parameters<typeof reportMonthSlug>[0]);
    if (derivedSlug && derivedSlug !== monthSlug) {
      // Two sources disagree — refuse rather than guess.
      return {
        status: "error",
        reason: "not_found",
        message: "Storage path could not be derived consistently for this report.",
      };
    }
  }
  const key = `${report.tenantId}/${report.parishId}/${monthSlug}.xlsx`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS, {
      download: `mreport_${slugify(report.parishName)}_${monthSlug}.xlsx`,
    });
  if (error || !data?.signedUrl) {
    return {
      status: "error",
      reason: "storage_failed",
      message: error?.message ?? "Couldn't sign URL.",
    };
  }

  // Audit the download.
  try {
    const requestHeaders = await headers();
    const ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      null;
    const userAgent = requestHeaders.get("user-agent")?.slice(0, 200) ?? null;
    await db.insert(mreportAuditLog).values({
      tenant_id: session.tenantId,
      actor_id: session.userId,
      actor_email_masked: maskEmail(session.email),
      action: "report.file_downloaded",
      target_type: "mreport_reports",
      target_id: reportId,
      ip,
      user_agent_summary: userAgent,
      metadata: { storage_bucket: STORAGE_BUCKET, storage_path: key },
    });
  } catch {
    // Audit failure shouldn't block the download. Log only.
  }

  return { status: "success", url: data.signedUrl };
}

function slugify(s: string): string {
  return s.trim().replace(/\s+/g, "_");
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, 2) + "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
