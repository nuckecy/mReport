// Region-rollup queries — cross-parish aggregates for one or more months.
//
// Powers the /admin/region page: one table per requested month showing
// every active parish in the workspace with its submitted totals (or
// zeros if it hasn't submitted yet). Expected remittances are computed
// from canonical rules in code so we don't need to denormalize them in
// the DB.
//
// The caller MUST have already passed `requireAdmin()` — this module
// doesn't enforce auth.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mreportParishes, mreportRegions, mreportReports } from "@/lib/db/schema/mreport";
import { CANONICAL_RULES } from "@/lib/validation/rules";
import { sumTotals, type RollupTotals } from "./totals";

export { sumTotals, type RollupTotals };

export interface RegionRollupRow {
  parishId: string;
  parishName: string;
  regionName: string;
  pastorName: string | null;
  mobile: string | null;
  /** ISO timestamp string or null if no submission for this month. */
  submittedAt: string | null;
  /** YYYY-MM-DD (first of month). Always set; used to identify the row. */
  reportMonth: string;

  // Reported totals (0 when no submission)
  avgAttendance: number;
  offerings: number;
  tithes: number;
  thanksgiving: number;
  others: number;
  total: number;

  // Expected remittances from canonical rules
  expectedRegionalOffering5: number;
  expectedRegionalTithe20: number;
  expectedRegionalTotal: number;

  /** True iff a report exists for this parish + month. */
  submitted: boolean;
}

export interface MonthRollup {
  /** YYYY-MM-01 first-of-month date. */
  month: string;
  rows: RegionRollupRow[];
  totals: RollupTotals;
}

const ZERO_TOTALS: RollupTotals = {
  avgAttendance: 0,
  offerings: 0,
  tithes: 0,
  thanksgiving: 0,
  others: 0,
  total: 0,
  expectedRegionalOffering5: 0,
  expectedRegionalTithe20: 0,
  expectedRegionalTotal: 0,
};

const num = (v: string | number | null | undefined): number =>
  v == null ? 0 : typeof v === "number" ? v : Number(v) || 0;

/**
 * Compute the regional remittance (5% offering + 20% tithe) for a row.
 * Mirrors the canonical rules in `validation/rules.ts` so the export
 * matches what we'd compute in the parser.
 */
function regionalRemittance(offerings: number, tithes: number) {
  const reg = CANONICAL_RULES.regional; // { offering: 0.05, tithe: 0.20 }
  const offering5 = round2(offerings * reg.offering);
  const tithe20 = round2(tithes * reg.tithe);
  const total = round2(offering5 + tithe20);
  return { offering5, tithe20, total };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fetch a roll-up for the given months. Returns one MonthRollup per
 * input month, in the same order, each with one row per active parish.
 *
 * `months` are YYYY-MM strings (e.g. "2025-12"). We expand them to
 * YYYY-MM-01 dates for the DB lookup.
 */
export async function getRegionRollup(tenantId: string, months: string[]): Promise<MonthRollup[]> {
  if (months.length === 0) return [];
  const monthDates = months.map((m) => `${m}-01`);

  // 1. All active parishes for this tenant. We left-join reports per
  //    month so parishes without a submission still appear.
  const parishRows = await db
    .select({
      parishId: mreportParishes.id,
      parishName: mreportParishes.name,
      regionName: mreportRegions.name,
      pastorName: mreportParishes.pastor_name,
      mobile: mreportParishes.mobile,
    })
    .from(mreportParishes)
    .innerJoin(mreportRegions, eq(mreportRegions.id, mreportParishes.region_id))
    .where(and(eq(mreportParishes.tenant_id, tenantId), isNull(mreportParishes.deleted_at)))
    .orderBy(mreportParishes.name);

  if (parishRows.length === 0) {
    return monthDates.map((m) => ({ month: m, rows: [], totals: { ...ZERO_TOTALS } }));
  }

  // 2. For each month, pull the live (non-superseded) reports for
  //    every parish. We do one query per month — N is bounded (max 12
  //    in practice, usually 3) so the round-trips don't matter.
  const monthResults: MonthRollup[] = [];
  for (const monthDate of monthDates) {
    const reports = await db
      .select({
        parishId: mreportReports.parish_id,
        submittedAt: mreportReports.submitted_at,
        pastorName: mreportReports.pastor_name,
        avgAttendance: mreportReports.attendance_avg,
        offerings: mreportReports.total_offering,
        tithes: mreportReports.total_tithe,
        thanksgiving: mreportReports.total_thanksgiving,
        others: mreportReports.total_others,
        total: mreportReports.total_income,
      })
      .from(mreportReports)
      .where(
        and(
          eq(mreportReports.tenant_id, tenantId),
          eq(mreportReports.report_month, monthDate),
          sql`${mreportReports.status} != 'superseded'`,
        ),
      );

    const reportByParish = new Map<string, (typeof reports)[number]>();
    for (const r of reports) {
      reportByParish.set(r.parishId, r);
    }

    const rows: RegionRollupRow[] = parishRows.map((p) => {
      const r = reportByParish.get(p.parishId);
      const offerings = r ? num(r.offerings) : 0;
      const tithes = r ? num(r.tithes) : 0;
      const remit = regionalRemittance(offerings, tithes);
      return {
        parishId: p.parishId,
        parishName: p.parishName,
        regionName: p.regionName,
        // Prefer the parser-derived pastor name if a report exists,
        // otherwise fall back to the parish-level pastor.
        pastorName: r?.pastorName ?? p.pastorName,
        mobile: p.mobile,
        submittedAt: r ? (r.submittedAt as Date).toISOString() : null,
        reportMonth: monthDate,
        avgAttendance: r ? num(r.avgAttendance) : 0,
        offerings,
        tithes,
        thanksgiving: r ? num(r.thanksgiving) : 0,
        others: r ? num(r.others) : 0,
        total: r ? num(r.total) : 0,
        expectedRegionalOffering5: remit.offering5,
        expectedRegionalTithe20: remit.tithe20,
        expectedRegionalTotal: remit.total,
        submitted: !!r,
      };
    });

    monthResults.push({
      month: monthDate,
      rows,
      totals: sumTotals(rows),
    });
  }

  return monthResults;
}

/**
 * Get the most recent N months that the tenant has data for, used as
 * the default month selection on the region page. Falls back to the
 * current month + previous 2 if there's no data yet.
 */
export async function getDefaultMonths(tenantId: string, n: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: mreportReports.report_month })
    .from(mreportReports)
    .where(eq(mreportReports.tenant_id, tenantId))
    .orderBy(sql`${mreportReports.report_month} desc`)
    .limit(n);

  if (rows.length > 0) {
    return rows.map((r) => (r.month as string).slice(0, 7));
  }

  // No data yet — generate the last N months from today.
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** List every month that has at least one submission, newest first. */
export async function listAvailableMonths(tenantId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: mreportReports.report_month })
    .from(mreportReports)
    .where(eq(mreportReports.tenant_id, tenantId))
    .orderBy(sql`${mreportReports.report_month} desc`);
  return rows.map((r) => (r.month as string).slice(0, 7));
}
