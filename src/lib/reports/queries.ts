// Read-side queries for the admin reports list + detail pages.
//
// All queries scoped by `tenantId`. The caller must have already passed
// `requireAdmin()` — this module doesn't enforce auth.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { coreUsers } from "@/lib/db/schema/core";
import {
  mreportAuditLog,
  mreportParishes,
  mreportRegions,
  mreportReports,
  mreportReportLines,
} from "@/lib/db/schema/mreport";
import { monthSlugToDate, type ReportFilters } from "./filters";

// Re-export so existing imports from "@/lib/reports/queries" keep working.
export { parseReportFilters } from "./filters";
export type { ReportFilters } from "./filters";

// ── Row shapes for the list view ─────────────────────────────────────

export interface ReportRow {
  id: string;
  reportMonth: string; // YYYY-MM-DD (always the first of the month)
  parishId: string;
  parishName: string;
  regionId: string;
  regionName: string;
  pastorName: string | null;
  totalIncome: string | null; // numeric → string
  totalOffering: string | null;
  totalTithe: string | null;
  totalThanksgiving: string | null;
  totalOthers: string | null;
  attendanceAvg: string | null;
  submittedAt: Date;
  submittedById: string;
  submittedByName: string | null;
  submittedByEmail: string;
  status: "submitted" | "amended" | "superseded";
  amendmentNote: string | null;
}

const DEFAULT_LIMIT = 50;

export async function listReports(
  tenantId: string,
  filters: ReportFilters = {},
  limit: number = DEFAULT_LIMIT,
): Promise<ReportRow[]> {
  const where = [eq(mreportReports.tenant_id, tenantId)];
  if (filters.parishId) where.push(eq(mreportReports.parish_id, filters.parishId));
  if (filters.month) where.push(eq(mreportReports.report_month, monthSlugToDate(filters.month)));
  if (filters.status) where.push(eq(mreportReports.status, filters.status));

  const rows = await db
    .select({
      id: mreportReports.id,
      reportMonth: mreportReports.report_month,
      parishId: mreportReports.parish_id,
      parishName: mreportParishes.name,
      regionId: mreportParishes.region_id,
      regionName: mreportRegions.name,
      pastorName: mreportReports.pastor_name,
      totalIncome: mreportReports.total_income,
      totalOffering: mreportReports.total_offering,
      totalTithe: mreportReports.total_tithe,
      totalThanksgiving: mreportReports.total_thanksgiving,
      totalOthers: mreportReports.total_others,
      attendanceAvg: mreportReports.attendance_avg,
      submittedAt: mreportReports.submitted_at,
      submittedById: mreportReports.submitted_by,
      submittedByName: coreUsers.name,
      submittedByEmail: coreUsers.email,
      status: mreportReports.status,
      amendmentNote: mreportReports.amendment_note,
    })
    .from(mreportReports)
    .innerJoin(mreportParishes, eq(mreportParishes.id, mreportReports.parish_id))
    .innerJoin(mreportRegions, eq(mreportRegions.id, mreportParishes.region_id))
    .innerJoin(coreUsers, eq(coreUsers.id, mreportReports.submitted_by))
    .where(and(...where))
    .orderBy(desc(mreportReports.submitted_at))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    reportMonth: r.reportMonth as string,
    submittedAt: r.submittedAt as Date,
  }));
}

// ── Detail-page row shapes ───────────────────────────────────────────

export interface ReportDetail extends ReportRow {
  rawJson: unknown;
  sourceFile: string | null;
  supersededById: string | null;
}

export async function getReportById(
  tenantId: string,
  reportId: string,
): Promise<ReportDetail | null> {
  const rows = await db
    .select({
      id: mreportReports.id,
      reportMonth: mreportReports.report_month,
      parishId: mreportReports.parish_id,
      parishName: mreportParishes.name,
      regionId: mreportParishes.region_id,
      regionName: mreportRegions.name,
      pastorName: mreportReports.pastor_name,
      totalIncome: mreportReports.total_income,
      totalOffering: mreportReports.total_offering,
      totalTithe: mreportReports.total_tithe,
      totalThanksgiving: mreportReports.total_thanksgiving,
      totalOthers: mreportReports.total_others,
      attendanceAvg: mreportReports.attendance_avg,
      submittedAt: mreportReports.submitted_at,
      submittedById: mreportReports.submitted_by,
      submittedByName: coreUsers.name,
      submittedByEmail: coreUsers.email,
      status: mreportReports.status,
      amendmentNote: mreportReports.amendment_note,
      rawJson: mreportReports.raw_json,
      sourceFile: mreportReports.source_file,
      supersededById: mreportReports.superseded_by,
    })
    .from(mreportReports)
    .innerJoin(mreportParishes, eq(mreportParishes.id, mreportReports.parish_id))
    .innerJoin(mreportRegions, eq(mreportRegions.id, mreportParishes.region_id))
    .innerJoin(coreUsers, eq(coreUsers.id, mreportReports.submitted_by))
    .where(and(eq(mreportReports.tenant_id, tenantId), eq(mreportReports.id, reportId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    reportMonth: row.reportMonth as string,
    submittedAt: row.submittedAt as Date,
  };
}

export interface ReportLine {
  entryDate: string;
  dayLabel: string | null;
  men: number;
  women: number;
  children: number;
  offering: string;
  tithe: string;
  thanksgiving: string;
  others: string;
  moneyTotal: string | null;
}

export async function listReportLines(reportId: string, tenantId: string): Promise<ReportLine[]> {
  const rows = await db
    .select({
      entryDate: mreportReportLines.entry_date,
      dayLabel: mreportReportLines.day_label,
      men: mreportReportLines.men,
      women: mreportReportLines.women,
      children: mreportReportLines.children,
      offering: mreportReportLines.offering,
      tithe: mreportReportLines.tithe,
      thanksgiving: mreportReportLines.thanksgiving,
      others: mreportReportLines.others,
      moneyTotal: mreportReportLines.money_total,
    })
    .from(mreportReportLines)
    .where(
      and(eq(mreportReportLines.report_id, reportId), eq(mreportReportLines.tenant_id, tenantId)),
    )
    .orderBy(mreportReportLines.entry_date);
  return rows.map((r) => ({ ...r, entryDate: r.entryDate as string }));
}

// ── Audit log for a single report ───────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorEmailMasked: string | null;
  ip: string | null;
  userAgentSummary: string | null;
  metadata: unknown;
  createdAt: Date;
}

export async function listAuditForReport(
  tenantId: string,
  reportId: string,
): Promise<AuditEntry[]> {
  const rows = await db
    .select({
      id: mreportAuditLog.id,
      action: mreportAuditLog.action,
      actorId: mreportAuditLog.actor_id,
      actorEmailMasked: mreportAuditLog.actor_email_masked,
      ip: mreportAuditLog.ip,
      userAgentSummary: mreportAuditLog.user_agent_summary,
      metadata: mreportAuditLog.metadata,
      createdAt: mreportAuditLog.created_at,
    })
    .from(mreportAuditLog)
    .where(
      and(
        eq(mreportAuditLog.tenant_id, tenantId),
        eq(mreportAuditLog.target_type, "mreport_reports"),
        eq(mreportAuditLog.target_id, reportId),
      ),
    )
    .orderBy(desc(mreportAuditLog.created_at));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt as Date,
  }));
}

// ── Filter helpers for the list page UI ──────────────────────────────

export interface ParishOption {
  id: string;
  name: string;
  regionName: string;
}

export async function listParishesForTenant(tenantId: string): Promise<ParishOption[]> {
  const rows = await db
    .select({
      id: mreportParishes.id,
      name: mreportParishes.name,
      regionName: mreportRegions.name,
    })
    .from(mreportParishes)
    .innerJoin(mreportRegions, eq(mreportRegions.id, mreportParishes.region_id))
    .where(eq(mreportParishes.tenant_id, tenantId))
    .orderBy(mreportParishes.name);
  return rows;
}

/**
 * Months that have at least one submission, newest first. Used to
 * populate the month-filter dropdown without scanning every possible
 * month.
 */
export async function listMonthsWithReports(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(${mreportReports.report_month}, 'YYYY-MM')`.as("month"),
    })
    .from(mreportReports)
    .where(eq(mreportReports.tenant_id, tenantId))
    .groupBy(mreportReports.report_month)
    .orderBy(desc(mreportReports.report_month));
  return rows.map((r) => r.month);
}
