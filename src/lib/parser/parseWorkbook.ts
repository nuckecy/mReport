// parseWorkbook — top-level orchestrator. Mirrors _prototype/index.html
// §2.11 + §4 (sanity checks). Reads a single sheet (sheet 0) and assembles
// the complete Report object that the validation + UI layers consume.

import type { WorkBook } from "xlsx";
import { NUM, round2 } from "./num";
import { valueForHeaderLabel, findEmailInSheet, findMobileInSheet } from "./cells";
import { detectMonthYear, ymd } from "./dates";
import {
  STAT_FIELDS,
  extractPerDateRows,
  extractPerDateStatistics,
  extractWeeklyTotals,
  readActualRemittance,
  readEnteredStatTotals,
  readGrandTotalRow,
  readMonthlyAverageDemographics,
  readMonthlyAverageTotal,
  type PerDateRow,
  type PerDateStatRow,
  type StatKey,
} from "./extract";
import { detectTemplateValidity, type TemplateValidity } from "./template-validity";

// ── Report shape ──────────────────────────────────────────────────────

export interface Report {
  source: {
    sheet: string;
    parish: string | null;
    pastor: string | null;
    mobile: string | null;
    email: string | null;
    reportMonth: string;
    monthIndex: number | null;
    year: number | null;
  };
  parishRecords: {
    averageAttendance: number | null;
    totalOffering: number;
    totalTithe: number;
    totalThanksgiving: number;
    totalOthers: number;
    sum: number;
  };
  perDate: PerDateRow[];
  monthlyValidation: MonthlyValidation;
  weeklyTotals: WeeklyTotal[];
  allocationReconciliation: AllocationReconciliation;
  sanityChecks: SanityCheck[];
  templateValidity: TemplateValidity;
  statistics: {
    perDate: PerDateStatRow[];
    validation: StatisticsValidation[];
  };
  regionalRemittance: SectionValues<"offering5" | "tithe20" | "total">;
  parishOperations: SectionValues<"tithe55" | "offering95" | "thanksgiving30" | "total">;
  parishPastorAllowance: SectionValues<"tithe20" | "thanksgiving70" | "total">;
  provincialRemittance: SectionValues<"tithe5">;
  others: { totalOthers: number; allocationRule: null };
  coverage: {
    offering: { rules: string; coveragePct: number };
    tithe: { rules: string; coveragePct: number };
    thanksgiving: { rules: string; coveragePct: number };
    others: { rules: string; coveragePct: number };
  };
}

export interface SanityCheck {
  id:
    | "no-negatives"
    | "row1-complete"
    | "sundays-consecutive"
    | "dates-in-month"
    | "no-empty-sundays";
  label: string;
  level: "ok" | "warn" | "fail";
  detail: string | null;
}

export interface MonthlyValidationEntry {
  reported: number | null;
  recomputed: number;
  validated: boolean | null;
}

export interface MonthlyValidation {
  offering: MonthlyValidationEntry;
  tithe: MonthlyValidationEntry;
  thanksgiving: MonthlyValidationEntry;
  others: MonthlyValidationEntry;
  sum: MonthlyValidationEntry;
  averageAttendance: MonthlyValidationEntry;
  averageMen: MonthlyValidationEntry;
  averageWomen: MonthlyValidationEntry;
  averageChildren: MonthlyValidationEntry;
}

export interface WeeklyTotal {
  weekIndex: number;
  enteredTotal: number | null;
  recomputedTotal: number;
  contributingRows: number;
  validated: boolean | null;
}

export interface AllocationReconciliation {
  totalIncome: number;
  others: number;
  expectedAllocations: number;
  enteredAllocations: number;
  delta: number;
  validated: boolean;
}

export interface StatisticsValidation {
  key: StatKey;
  label: string;
  reported: number | null;
  recomputed: number;
  cellAddress: string | null;
  validated: boolean | null;
  hasAnyValue: boolean;
}

type SectionValues<K extends string> = {
  calculated: Record<K, number>;
  actual: Record<K, number | null>;
};

// ── Master parser ─────────────────────────────────────────────────────

export function parseWorkbook(wb: WorkBook): Report {
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The workbook contains no sheets.");
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" is missing from the workbook.`);

  // Row 1 — parish / pastor / mobile / email use below-first lookup.
  const parish = toStringOrNull(valueForHeaderLabel(sheet, "Name Of Parish"));
  const pastor = toStringOrNull(valueForHeaderLabel(sheet, "Pastor In Charge"));
  const mobile = toStringOrNull(valueForHeaderLabel(sheet, "Mobile")) ?? findMobileInSheet(sheet);
  const email = toStringOrNull(valueForHeaderLabel(sheet, "Email")) ?? findEmailInSheet(sheet);
  const monthYear = detectMonthYear(sheet);

  const totals = readGrandTotalRow(sheet);
  if (!totals) {
    throw new Error("Could not locate the grand-total row in the report.");
  }

  const avgAttendance = readMonthlyAverageTotal(sheet);
  const avgDemographics = readMonthlyAverageDemographics(sheet);
  const actual = readActualRemittance(sheet);
  const perDate = extractPerDateRows(sheet);
  const weeklyTotalsRaw = extractWeeklyTotals(sheet);
  const perDateStats = extractPerDateStatistics(sheet);
  const enteredStatTotals = readEnteredStatTotals(sheet);

  // Weekly totals: re-sum per-date rows that fall between this week's header and Total.
  const weeklyTotals: WeeklyTotal[] = weeklyTotalsRaw.map((wt) => {
    const rowsInWeek = perDate.filter((d) => d.row > wt.headerRow && d.row < wt.totalRow);
    const recomputed = round2(rowsInWeek.reduce((acc, d) => acc + d.money.totalCalculated, 0));
    return {
      weekIndex: wt.weekIndex,
      enteredTotal: wt.enteredTotal,
      recomputedTotal: recomputed,
      contributingRows: rowsInWeek.length,
      validated: wt.enteredTotal != null ? Math.abs(wt.enteredTotal - recomputed) < 0.01 : null,
    };
  });

  const offering = totals.offering ?? 0;
  const tithe = totals.tithe ?? 0;
  const thanksgiving = totals.thanksgiving ?? 0;
  const others = totals.others ?? 0;

  const calc = {
    regional: {
      offering5: round2(offering * 0.05),
      tithe20: round2(tithe * 0.2),
      total: round2(offering * 0.05 + tithe * 0.2),
    },
    operations: {
      tithe55: round2(tithe * 0.55),
      offering95: round2(offering * 0.95),
      thanksgiving30: round2(thanksgiving * 0.3),
      total: round2(tithe * 0.55 + offering * 0.95 + thanksgiving * 0.3),
    },
    pastorAllow: {
      tithe20: round2(tithe * 0.2),
      thanksgiving70: round2(thanksgiving * 0.7),
      total: round2(tithe * 0.2 + thanksgiving * 0.7),
    },
    provincial: {
      tithe5: round2(tithe * 0.05),
    },
  };

  // Per-date re-sum — used to verify Row 2 monthly totals.
  const reSum = perDate.reduce(
    (acc, r) => ({
      offering: acc.offering + r.money.offering,
      tithe: acc.tithe + r.money.tithe,
      thanksgiving: acc.thanksgiving + r.money.thanksgiving,
      others: acc.others + r.money.others,
      menSum: acc.menSum + r.attendance.men,
      womenSum: acc.womenSum + r.attendance.women,
      childrenSum: acc.childrenSum + r.attendance.children,
      menWomenChildrenSum: acc.menWomenChildrenSum + (r.attendance.totalCalculated || 0),
      attendanceWeeks: acc.attendanceWeeks + (r.hasAttendance ? 1 : 0),
    }),
    {
      offering: 0,
      tithe: 0,
      thanksgiving: 0,
      others: 0,
      menSum: 0,
      womenSum: 0,
      childrenSum: 0,
      menWomenChildrenSum: 0,
      attendanceWeeks: 0,
    },
  );
  reSum.offering = round2(reSum.offering);
  reSum.tithe = round2(reSum.tithe);
  reSum.thanksgiving = round2(reSum.thanksgiving);
  reSum.others = round2(reSum.others);
  const reSumSum = round2(reSum.offering + reSum.tithe + reSum.thanksgiving + reSum.others);

  // Spec §11.9 — averages stay at full precision. DON'T round here.
  const datedWeekCount = perDate.filter((d) => d.date).length;
  const datedDiv = datedWeekCount || 1;
  const averageAttendanceCalculated =
    datedWeekCount > 0 ? reSum.menWomenChildrenSum / datedWeekCount : 0;
  const averageMenCalculated = reSum.menSum / datedDiv;
  const averageWomenCalculated = reSum.womenSum / datedDiv;
  const averageChildrenCalculated = reSum.childrenSum / datedDiv;

  // Allocation reconciliation.
  const enteredAllocations =
    NUM(actual.regional.offering5) +
    NUM(actual.regional.tithe20) +
    NUM(actual.operations.tithe55) +
    NUM(actual.operations.offering95) +
    NUM(actual.operations.thanksgiving30) +
    NUM(actual.pastorAllow.tithe20) +
    NUM(actual.pastorAllow.thanksgiving70) +
    NUM(actual.provincial.tithe5);
  const totalIncome = offering + tithe + thanksgiving + others;
  const expectedAllocations = round2(totalIncome - others);
  const allocationReconciliation: AllocationReconciliation = {
    totalIncome: round2(totalIncome),
    others,
    expectedAllocations,
    enteredAllocations: round2(enteredAllocations),
    delta: round2(enteredAllocations - expectedAllocations),
    validated: Math.abs(enteredAllocations - expectedAllocations) < 0.01,
  };

  // Monthly validation — reported vs. recomputed per-date sum.
  const mkAvg = (
    reported: number | null,
    recomputed: number,
    tol: number,
  ): MonthlyValidationEntry =>
    reported != null
      ? { reported, recomputed, validated: Math.abs(reported - recomputed) < tol }
      : { reported: null, recomputed, validated: null };

  const monthlyValidation: MonthlyValidation = {
    offering: mkAvg(offering, reSum.offering, 0.01),
    tithe: mkAvg(tithe, reSum.tithe, 0.01),
    thanksgiving: mkAvg(thanksgiving, reSum.thanksgiving, 0.01),
    others: mkAvg(others, reSum.others, 0.01),
    sum: {
      reported: round2(offering + tithe + thanksgiving + others),
      recomputed: reSumSum,
      validated: Math.abs(round2(offering + tithe + thanksgiving + others) - reSumSum) < 0.01,
    },
    averageAttendance: mkAvg(
      avgAttendance != null ? NUM(avgAttendance) : null,
      averageAttendanceCalculated,
      0.05,
    ),
    averageMen: mkAvg(avgDemographics.men, averageMenCalculated, 0.05),
    averageWomen: mkAvg(avgDemographics.women, averageWomenCalculated, 0.05),
    averageChildren: mkAvg(avgDemographics.children, averageChildrenCalculated, 0.05),
  };

  // Sanity checks — see spec §4. Order is intentional.
  const sanityChecks = buildSanityChecks(perDate, parish, pastor, monthYear);

  // Statistics validation per stat column.
  const statisticsValidation: StatisticsValidation[] = STAT_FIELDS.map((f) => {
    const recomputed = perDateStats.reduce((a, r) => a + (r.stats[f.key] || 0), 0);
    const reported = enteredStatTotals ? enteredStatTotals.totals[f.key] : null;
    const cellAddress = enteredStatTotals ? enteredStatTotals.addresses[f.key] : null;
    return {
      key: f.key,
      label: f.label,
      reported,
      recomputed,
      cellAddress,
      validated: reported != null ? Math.abs(reported - recomputed) < 0.01 : null,
      hasAnyValue: recomputed > 0 || (reported != null && reported > 0),
    };
  });

  return {
    source: {
      sheet: sheetName,
      parish,
      pastor,
      mobile,
      email,
      reportMonth: monthYear.label,
      monthIndex: monthYear.month,
      year: monthYear.year,
    },
    parishRecords: {
      averageAttendance: avgAttendance,
      totalOffering: offering,
      totalTithe: tithe,
      totalThanksgiving: thanksgiving,
      totalOthers: others,
      sum: round2(offering + tithe + thanksgiving + others),
    },
    perDate,
    monthlyValidation,
    weeklyTotals,
    allocationReconciliation,
    sanityChecks,
    templateValidity: detectTemplateValidity(
      sheet,
      { tithe, offering, thanksgiving, others },
      actual,
    ),
    statistics: { perDate: perDateStats, validation: statisticsValidation },
    regionalRemittance: {
      calculated: calc.regional,
      actual: {
        offering5: actual.regional.offering5,
        tithe20: actual.regional.tithe20,
        total: actual.regional.total,
      },
    },
    parishOperations: {
      calculated: calc.operations,
      actual: {
        tithe55: actual.operations.tithe55,
        offering95: actual.operations.offering95,
        thanksgiving30: actual.operations.thanksgiving30,
        total: actual.operations.total,
      },
    },
    parishPastorAllowance: {
      calculated: calc.pastorAllow,
      actual: {
        tithe20: actual.pastorAllow.tithe20,
        thanksgiving70: actual.pastorAllow.thanksgiving70,
        total: actual.pastorAllow.total,
      },
    },
    provincialRemittance: {
      calculated: calc.provincial,
      actual: { tithe5: actual.provincial.tithe5 },
    },
    others: { totalOthers: others, allocationRule: null },
    coverage: {
      offering: { rules: "5% Regional + 95% Parish Ops", coveragePct: 100 },
      tithe: {
        rules: "20% Regional + 55% Parish Ops + 20% Pastor + 5% Provincial",
        coveragePct: 100,
      },
      thanksgiving: { rules: "30% Parish Ops + 70% Pastor", coveragePct: 100 },
      others: { rules: "no allocation rule defined", coveragePct: 0 },
    },
  };
}

// ── Sanity checks ─────────────────────────────────────────────────────

function buildSanityChecks(
  perDate: PerDateRow[],
  parish: string | null,
  pastor: string | null,
  monthYear: { month: number | null; year: number | null; label: string },
): SanityCheck[] {
  const out: SanityCheck[] = [];

  // 1. No negative values.
  const negatives: string[] = [];
  for (const d of perDate) {
    const tag = d.date || `row ${d.row}`;
    if (d.attendance.men < 0) negatives.push(`${tag} attendance.men=${d.attendance.men}`);
    if (d.attendance.women < 0) negatives.push(`${tag} attendance.women=${d.attendance.women}`);
    if (d.attendance.children < 0)
      negatives.push(`${tag} attendance.children=${d.attendance.children}`);
    if (d.money.offering < 0) negatives.push(`${tag} money.offering=${d.money.offering}`);
    if (d.money.tithe < 0) negatives.push(`${tag} money.tithe=${d.money.tithe}`);
    if (d.money.thanksgiving < 0)
      negatives.push(`${tag} money.thanksgiving=${d.money.thanksgiving}`);
    if (d.money.others < 0) negatives.push(`${tag} money.others=${d.money.others}`);
  }
  out.push(
    negatives.length === 0
      ? { id: "no-negatives", label: "No negative values", level: "ok", detail: null }
      : {
          id: "no-negatives",
          label: "Negative values present",
          level: "fail",
          detail: negatives.join("; "),
        },
  );

  // 2. Row 1 fields present.
  const missing: string[] = [];
  if (!parish) missing.push("Name Of Parish");
  if (!pastor) missing.push("Pastor In Charge");
  if (monthYear.month == null) missing.push("Report month (no Sunday dates found)");
  out.push(
    missing.length === 0
      ? {
          id: "row1-complete",
          label: "Row 1 (Parish/Pastor/Month) complete",
          level: "ok",
          detail: null,
        }
      : {
          id: "row1-complete",
          label: "Row 1 fields missing",
          level: "fail",
          detail: missing.join(", "),
        },
  );

  // 3. Sundays consecutive (7-day gaps).
  const sundayRows = perDate
    .filter((d) => d.date && d.day.toLowerCase() === "sunday")
    .map((d) => ({ row: d.row, date: new Date((d.date as string) + "T00:00:00") }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sundayRows.length >= 2) {
    const gaps: string[] = [];
    for (let i = 1; i < sundayRows.length; i++) {
      const dayDiff =
        (sundayRows[i]!.date.getTime() - sundayRows[i - 1]!.date.getTime()) / 86400000;
      if (dayDiff !== 7) {
        gaps.push(`${ymd(sundayRows[i - 1]!.date)} → ${ymd(sundayRows[i]!.date)} (${dayDiff}d)`);
      }
    }
    out.push(
      gaps.length === 0
        ? {
            id: "sundays-consecutive",
            label: "All Sundays are consecutive (7 days apart)",
            level: "ok",
            detail: null,
          }
        : {
            id: "sundays-consecutive",
            label: "Non-consecutive Sundays detected",
            level: "warn",
            detail: gaps.join("; "),
          },
    );
  }

  // 4. All Sundays in detected month.
  if (monthYear.month != null && sundayRows.length > 0) {
    const wrong = sundayRows.filter(
      (s) => s.date.getMonth() !== monthYear.month || s.date.getFullYear() !== monthYear.year,
    );
    out.push(
      wrong.length === 0
        ? {
            id: "dates-in-month",
            label: `All Sundays fall in ${monthYear.label}`,
            level: "ok",
            detail: null,
          }
        : {
            id: "dates-in-month",
            label: `Sundays outside ${monthYear.label}`,
            level: "warn",
            detail: wrong.map((s) => ymd(s.date)).join(", "),
          },
    );
  }

  // 5. No fully-empty Sundays — only flag DATED empty ones (spec §11.7).
  const emptySundays = perDate.filter(
    (d) => d.day.toLowerCase() === "sunday" && !d.hasAttendance && !d.hasMoney && d.date,
  );
  out.push(
    emptySundays.length > 0
      ? {
          id: "no-empty-sundays",
          label: "Some dated Sundays have no values entered",
          level: "warn",
          detail: emptySundays.map((d) => d.date).join(", "),
        }
      : {
          id: "no-empty-sundays",
          label: "Every dated Sunday has values entered",
          level: "ok",
          detail: null,
        },
  );

  return out;
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
