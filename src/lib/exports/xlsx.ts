// Browser-side .xlsx download. Builds a multi-sheet workbook (Summary,
// Per-Date Detail, Weekly Totals, Allocation, Statistics, Sanity) and
// writes it via SheetJS.
//
// Ported from _prototype/index.html §8. Sheet order and column widths
// match the prototype so admins reviewing exports see a familiar shape.

import * as XLSX from "xlsx";
import type { Report } from "@/lib/parser";
import { reportFilename } from "./json";

function validationLabel(v: boolean | null): string {
  if (v == null) return "n/a";
  return v ? "Validated" : "Not validated";
}

function matchLabel(calc: number | null | undefined, actual: number | null | undefined): string {
  if (actual == null || calc == null) return "missing";
  return Math.abs(calc - actual) < 0.01 ? "Validated" : "Not validated";
}

/**
 * Build an XLSX workbook from a Report. Returns the SheetJS WorkBook so
 * callers can choose to write it directly (`XLSX.writeFile`) or attach it
 * elsewhere (e.g., email body in a future iteration).
 */
export function buildReportWorkbook(r: Report): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ── Summary sheet ──────────────────────────────────────────────────
  const summary: Array<Array<string | number | null>> = [
    ["mReport — Parish Summary"],
    [],
    ["Parish Info"],
    ["Name of Parish", r.source.parish ?? ""],
    ["Month of the Report", r.source.reportMonth],
    ["Name of Pastor", r.source.pastor ?? ""],
    ["Mobile", r.source.mobile ?? ""],
    ["Email", r.source.email ?? ""],
    [],
    ["Parish Records"],
    ["Average Attendance", r.parishRecords.averageAttendance],
    ["Total Offering", r.parishRecords.totalOffering],
    ["Total Tithe", r.parishRecords.totalTithe],
    ["Total Thanksgiving", r.parishRecords.totalThanksgiving],
    ["Total of Others", r.parishRecords.totalOthers],
    ["Sum", r.parishRecords.sum],
    [],
    ["Regional Remittance", "Calculated", "Actual", "Match"],
    [
      "5% of Offering",
      r.regionalRemittance.calculated.offering5,
      r.regionalRemittance.actual.offering5,
      matchLabel(r.regionalRemittance.calculated.offering5, r.regionalRemittance.actual.offering5),
    ],
    [
      "20% of Tithe",
      r.regionalRemittance.calculated.tithe20,
      r.regionalRemittance.actual.tithe20,
      matchLabel(r.regionalRemittance.calculated.tithe20, r.regionalRemittance.actual.tithe20),
    ],
    [
      "Total Regional Remittance",
      r.regionalRemittance.calculated.total,
      r.regionalRemittance.actual.total,
      matchLabel(r.regionalRemittance.calculated.total, r.regionalRemittance.actual.total),
    ],
    [],
    ["Parish Operations", "Calculated", "Actual", "Match"],
    [
      "55% of Tithe",
      r.parishOperations.calculated.tithe55,
      r.parishOperations.actual.tithe55,
      matchLabel(r.parishOperations.calculated.tithe55, r.parishOperations.actual.tithe55),
    ],
    [
      "95% of Offering",
      r.parishOperations.calculated.offering95,
      r.parishOperations.actual.offering95,
      matchLabel(r.parishOperations.calculated.offering95, r.parishOperations.actual.offering95),
    ],
    [
      "30% of Thanksgiving",
      r.parishOperations.calculated.thanksgiving30,
      r.parishOperations.actual.thanksgiving30,
      matchLabel(
        r.parishOperations.calculated.thanksgiving30,
        r.parishOperations.actual.thanksgiving30,
      ),
    ],
    [
      "Total Parish Operations",
      r.parishOperations.calculated.total,
      r.parishOperations.actual.total,
      matchLabel(r.parishOperations.calculated.total, r.parishOperations.actual.total),
    ],
    [],
    ["Parish Pastor Allowance", "Calculated", "Actual", "Match"],
    [
      "20% of Tithe",
      r.parishPastorAllowance.calculated.tithe20,
      r.parishPastorAllowance.actual.tithe20,
      matchLabel(
        r.parishPastorAllowance.calculated.tithe20,
        r.parishPastorAllowance.actual.tithe20,
      ),
    ],
    [
      "70% of Thanksgiving",
      r.parishPastorAllowance.calculated.thanksgiving70,
      r.parishPastorAllowance.actual.thanksgiving70,
      matchLabel(
        r.parishPastorAllowance.calculated.thanksgiving70,
        r.parishPastorAllowance.actual.thanksgiving70,
      ),
    ],
    [
      "Total Parish Pastor Allowance",
      r.parishPastorAllowance.calculated.total,
      r.parishPastorAllowance.actual.total,
      matchLabel(r.parishPastorAllowance.calculated.total, r.parishPastorAllowance.actual.total),
    ],
    [],
    ["Provincial Remittance", "Calculated", "Actual", "Match"],
    [
      "5% of Tithe",
      r.provincialRemittance.calculated.tithe5,
      r.provincialRemittance.actual.tithe5,
      matchLabel(r.provincialRemittance.calculated.tithe5, r.provincialRemittance.actual.tithe5),
    ],
    [],
    ["Others"],
    ["Total Others", r.others.totalOthers],
    [],
    ["Row 2 Validation (re-summed from per-date)", "Reported", "Re-summed", "Match"],
    [
      "Average Attendance",
      r.monthlyValidation.averageAttendance.reported,
      r.monthlyValidation.averageAttendance.recomputed,
      validationLabel(r.monthlyValidation.averageAttendance.validated),
    ],
    [
      "Total Offering",
      r.monthlyValidation.offering.reported,
      r.monthlyValidation.offering.recomputed,
      validationLabel(r.monthlyValidation.offering.validated),
    ],
    [
      "Total Tithe",
      r.monthlyValidation.tithe.reported,
      r.monthlyValidation.tithe.recomputed,
      validationLabel(r.monthlyValidation.tithe.validated),
    ],
    [
      "Total Thanksgiving",
      r.monthlyValidation.thanksgiving.reported,
      r.monthlyValidation.thanksgiving.recomputed,
      validationLabel(r.monthlyValidation.thanksgiving.validated),
    ],
    [
      "Total Others",
      r.monthlyValidation.others.reported,
      r.monthlyValidation.others.recomputed,
      validationLabel(r.monthlyValidation.others.validated),
    ],
    [
      "Sum",
      r.monthlyValidation.sum.reported,
      r.monthlyValidation.sum.recomputed,
      validationLabel(r.monthlyValidation.sum.validated),
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Per-Date Detail sheet ──────────────────────────────────────────
  const detailRows: Array<Array<string | number | null>> = [
    [
      "Date",
      "Day",
      "Men",
      "Women",
      "Children",
      "Att. Reported",
      "Att. Calculated",
      "Att. Match",
      "Offering",
      "Tithe",
      "Thanksgiving",
      "Others",
      "€ Reported",
      "€ Calculated",
      "€ Match",
    ],
    ...r.perDate.map((d) => [
      d.date ?? "",
      d.day || "",
      d.attendance.men,
      d.attendance.women,
      d.attendance.children,
      d.attendance.totalReported ?? "",
      d.attendance.totalCalculated,
      validationLabel(d.attendance.validated),
      d.money.offering,
      d.money.tithe,
      d.money.thanksgiving,
      d.money.others,
      d.money.totalReported ?? "",
      d.money.totalCalculated,
      validationLabel(d.money.validated),
    ]),
  ];
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 6 },
    { wch: 7 },
    { wch: 9 },
    { wch: 13 },
    { wch: 14 },
    { wch: 11 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 13 },
    { wch: 11 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Per-Date Detail");

  // ── Weekly Totals sheet ────────────────────────────────────────────
  if (r.weeklyTotals.length) {
    const weeklyRows: Array<Array<string | number | null>> = [
      ["Week", "Entered € Total", "Re-summed", "Δ", "Match"],
      ...r.weeklyTotals.map((w) => [
        `WEEK ${w.weekIndex}`,
        w.enteredTotal ?? "",
        w.recomputedTotal,
        w.enteredTotal != null ? Math.abs(w.enteredTotal - w.recomputedTotal) : "",
        validationLabel(w.validated),
      ]),
    ];
    const wsW = XLSX.utils.aoa_to_sheet(weeklyRows);
    wsW["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsW, "Weekly Totals");
  }

  // ── Allocation Reconciliation sheet ────────────────────────────────
  const a = r.allocationReconciliation;
  const allocRows: Array<Array<string | number | null>> = [
    ["Allocation Reconciliation"],
    [],
    ["Total monetary income", a.totalIncome],
    ["Others (no allocation rule)", a.others],
    ["Expected allocations (Total − Others)", a.expectedAllocations],
    ["Sum of entered remittances", a.enteredAllocations],
    ["Δ (entered − expected)", a.delta],
    ["Match", validationLabel(a.validated)],
  ];
  const wsA = XLSX.utils.aoa_to_sheet(allocRows);
  wsA["!cols"] = [{ wch: 38 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Allocation");

  // ── Statistics sheet (always include all 12 fields) ─────────────────
  if (r.statistics.validation.length) {
    const statRows: Array<Array<string | number | null>> = [
      ["Field", "Per-date sum", "Reported total", "Match"],
      ...r.statistics.validation.map((s) => [
        s.label,
        s.recomputed,
        s.reported ?? "",
        validationLabel(s.validated),
      ]),
    ];
    const wsS = XLSX.utils.aoa_to_sheet(statRows);
    wsS["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsS, "Statistics");
  }

  // ── Sanity sheet ────────────────────────────────────────────────────
  if (r.sanityChecks.length) {
    const sanityRows: Array<Array<string | number | null>> = [
      ["Check", "Level", "Detail"],
      ...r.sanityChecks.map((c) => [c.label, c.level, c.detail ?? ""]),
    ];
    const wsCS = XLSX.utils.aoa_to_sheet(sanityRows);
    wsCS["!cols"] = [{ wch: 40 }, { wch: 8 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsCS, "Sanity");
  }

  return wb;
}

/**
 * Trigger a client-side .xlsx download. No-op outside the browser.
 */
export function downloadReportXLSX(r: Report): void {
  if (typeof window === "undefined") return;
  const wb = buildReportWorkbook(r);
  XLSX.writeFile(wb, reportFilename(r, "xlsx"));
}
