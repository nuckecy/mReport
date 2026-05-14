import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { reportFilename } from "@/lib/exports/json";
import { buildReportWorkbook } from "@/lib/exports/xlsx";
import type { Report } from "@/lib/parser";

// Minimal Report-shaped fixture sufficient for the export builders.
// Anything they don't read is omitted via `as unknown as Report`.
function fakeReport(): Report {
  return {
    source: {
      sheet: "Sheet1",
      parish: "Mount Zion Berlin",
      pastor: "Pastor Doe",
      mobile: "+49 30 1234 5678",
      email: "pastor@parish.org",
      reportMonth: "October 2025",
      monthIndex: 9,
      year: 2025,
    },
    parishRecords: {
      averageAttendance: 143.75,
      totalOffering: 417,
      totalTithe: 813,
      totalThanksgiving: 210,
      totalOthers: 42,
      sum: 1482,
    },
    perDate: [
      {
        row: 7,
        day: "Sunday",
        date: "2025-10-05",
        attendance: {
          men: 50,
          women: 60,
          children: 30,
          totalReported: 140,
          totalCalculated: 140,
          validated: true,
        },
        money: {
          offering: 100,
          tithe: 200,
          thanksgiving: 50,
          others: 10,
          totalReported: 360,
          totalCalculated: 360,
          validated: true,
        },
        hasAttendance: true,
        hasMoney: true,
      },
    ],
    monthlyValidation: {
      offering: { reported: 417, recomputed: 417, validated: true },
      tithe: { reported: 813, recomputed: 813, validated: true },
      thanksgiving: { reported: 210, recomputed: 210, validated: true },
      others: { reported: 42, recomputed: 42, validated: true },
      sum: { reported: 1482, recomputed: 1482, validated: true },
      averageAttendance: { reported: 143.75, recomputed: 143.75, validated: true },
      averageMen: { reported: null, recomputed: 0, validated: null },
      averageWomen: { reported: null, recomputed: 0, validated: null },
      averageChildren: { reported: null, recomputed: 0, validated: null },
    },
    weeklyTotals: [
      {
        weekIndex: 1,
        enteredTotal: 360,
        recomputedTotal: 360,
        contributingRows: 1,
        validated: true,
      },
    ],
    allocationReconciliation: {
      totalIncome: 1482,
      others: 42,
      expectedAllocations: 1440,
      enteredAllocations: 1440,
      delta: 0,
      validated: true,
    },
    sanityChecks: [{ id: "no-negatives", label: "No negative values", level: "ok", detail: null }],
    templateValidity: { valid: true, structuralIssues: [], formulaIssues: [], issues: [] },
    statistics: {
      perDate: [],
      validation: [
        {
          key: "converts",
          label: "Converts",
          reported: 5,
          recomputed: 5,
          cellAddress: "P48",
          validated: true,
          hasAnyValue: true,
        },
      ],
    },
    regionalRemittance: {
      calculated: { offering5: 20.85, tithe20: 162.6, total: 183.45 },
      actual: { offering5: 20.85, tithe20: 162.6, total: 183.45 },
    },
    parishOperations: {
      calculated: { tithe55: 447.15, offering95: 396.15, thanksgiving30: 63, total: 906.3 },
      actual: { tithe55: 447.15, offering95: 396.15, thanksgiving30: 63, total: 906.3 },
    },
    parishPastorAllowance: {
      calculated: { tithe20: 162.6, thanksgiving70: 147, total: 309.6 },
      actual: { tithe20: 162.6, thanksgiving70: 147, total: 309.6 },
    },
    provincialRemittance: { calculated: { tithe5: 40.65 }, actual: { tithe5: 40.65 } },
    others: { totalOthers: 42, allocationRule: null },
    coverage: {
      offering: { rules: "", coveragePct: 100 },
      tithe: { rules: "", coveragePct: 100 },
      thanksgiving: { rules: "", coveragePct: 100 },
      others: { rules: "", coveragePct: 0 },
    },
  };
}

describe("reportFilename", () => {
  it("uses parish + month, underscored", () => {
    expect(reportFilename(fakeReport(), "json")).toBe(
      "mreport_Mount_Zion_Berlin_October_2025.json",
    );
    expect(reportFilename(fakeReport(), "xlsx")).toBe(
      "mreport_Mount_Zion_Berlin_October_2025.xlsx",
    );
  });

  it("falls back when parish or month are missing", () => {
    const r = fakeReport();
    r.source.parish = null;
    r.source.reportMonth = "Unknown";
    expect(reportFilename(r, "json")).toBe("mreport_report_Unknown.json");
  });
});

describe("buildReportWorkbook", () => {
  it("produces the canonical sheet set", () => {
    const wb = buildReportWorkbook(fakeReport());
    expect(wb.SheetNames).toEqual([
      "Summary",
      "Per-Date Detail",
      "Weekly Totals",
      "Allocation",
      "Statistics",
      "Sanity",
    ]);
  });

  it("Summary sheet leads with the title row", () => {
    const wb = buildReportWorkbook(fakeReport());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Summary"]!, { header: 1 }) as unknown[][];
    expect(rows[0]?.[0]).toBe("mReport — Parish Summary");
  });

  it("Per-Date sheet includes one row per dated entry plus the header", () => {
    const wb = buildReportWorkbook(fakeReport());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Per-Date Detail"]!, {
      header: 1,
    }) as unknown[][];
    // 1 header row + 1 data row = 2.
    expect(rows.length).toBe(2);
    expect(rows[1]?.[0]).toBe("2025-10-05");
  });
});
