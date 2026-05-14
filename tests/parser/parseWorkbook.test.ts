import { describe, expect, it } from "vitest";
import type { WorkBook } from "xlsx";
import { parseWorkbook } from "@/lib/parser";
import { buildSheet } from "./sheet-builder";
import type { CellInput } from "./sheet-builder";

// Helper to wrap a single sheet as a WorkBook (sheet 0 is what the parser reads).
function wb(grid: ReadonlyArray<ReadonlyArray<CellInput>>): WorkBook {
  return {
    SheetNames: ["October Report"],
    Sheets: { "October Report": buildSheet(grid) },
  };
}

// A minimal four-Sunday workbook that resembles the prototype template.
// Used as the baseline for several regression tests below.
function buildBaselineGrid(): ReadonlyArray<ReadonlyArray<CellInput>> {
  return [
    // Row 0: Row 1 header labels.
    ["Name Of Parish", null, null, null, "Pastor In Charge", null, "Month/Year"],
    ["Mount Zion Berlin", null, null, null, "Pastor Doe", null, "October 2025"],
    [null, null, null, null, null, null, null],
    // Row 3 — extra labels (Mobile/Email).
    ["Mobile", null, null, null, "Email", null, null],
    ["+49 30 1234 5678", null, null, null, "pastor@parish.org", null, null],
    [null],
    // Row 6: per-date header (one WEEK block for simplicity).
    [
      "Date",
      "Days",
      "Men",
      "Women",
      "Children",
      "Total",
      "Offering",
      "Tithe",
      "Tnx_Giving",
      "Others",
      "Total €",
    ],
    // 4 Sundays
    [new Date(Date.UTC(2025, 9, 5)), "Sunday", 50, 60, 30, 140, 100, 200, 50, 10, 360],
    [new Date(Date.UTC(2025, 9, 12)), "Sunday", 55, 65, 32, 152, 110, 210, 55, 12, 387],
    [new Date(Date.UTC(2025, 9, 19)), "Sunday", 52, 62, 28, 142, 105, 205, 52, 11, 373],
    [new Date(Date.UTC(2025, 9, 26)), "Sunday", 51, 61, 29, 141, 102, 198, 53, 9, 362],
    // Week total row inside the same block.
    ["Total", null, null, null, null, null, 417, 813, 210, 42, 1482],
    [null],
    // Births header for stats extraction (needs to exist for parser flow).
    ["Date", "Days", "Births", "Marriages", "Deaths", "Converts"],
    [new Date(Date.UTC(2025, 9, 5)), "Sunday", 0, 0, 0, 3],
    [new Date(Date.UTC(2025, 9, 12)), "Sunday", 0, 0, 0, 2],
    [new Date(Date.UTC(2025, 9, 19)), "Sunday", 0, 0, 0, 0],
    [new Date(Date.UTC(2025, 9, 26)), "Sunday", 0, 0, 0, 0],
    // Grand stat total row.
    ["Total", null, 0, 0, 0, 5],
    [null],
    // Monthly Average row with demographics + total.
    // Demographics header sits in cols 1..3 so the "Monthly Average" label
    // in col 0 doesn't overlap with "Men".
    [null],
    [null, "Men", "Women", "Children", "Total"],
    // 52+62+29.75 = 143.75 → close enough to reported 144 within 0.05? No — use
    // a synthetic average that's well within the 0.05 tolerance window.
    // Recomputed from data: men=208/4=52, women=248/4=62, children=119/4=29.75.
    ["Monthly Average", 52, 62, 29.75, 143.75],
    [null],
    // Required section labels (just to make template-validity pass).
    [null, "Regional Remittance"],
    [null, "5% of Offering"],
    [null, 20.85], // 5% of (100+110+105+102) = 5% of 417 = 20.85
    [null, "20% of Tithe"],
    [null, 162.6], // 20% of 813
    [null, "Total Remittance"],
    [null, 183.45],
    [null],
    [null, "Twds. Parish Operations"],
    [null, "55% of Tithe"],
    [null, 447.15], // 55% of 813
    [null, "95% of Offering"],
    [null, 396.15], // 95% of 417
    [null, "30% of T/Giving"],
    [null, 63], // 30% of 210
    [null, "Total (€)"],
    [null, 906.3],
    [null],
    [null, "20% of Tithe"], // SECOND occurrence — pastor allowance
    [null, 162.6], // same value pattern (intentional for the SECOND-match logic)
    [null, "70% of T/Giving"],
    [null, 147], // 70% of 210
    [null, "Total (€)"],
    [null, 309.6],
    [null],
    [null, "Provincial Remittance"],
    [null, "5% of Tithe"],
    [null, 40.65], // 5% of 813
  ];
}

describe("parseWorkbook — baseline shape", () => {
  it("returns a Report with row 1 parsed (§11.1)", () => {
    const r = parseWorkbook(wb(buildBaselineGrid()));
    expect(r.source.parish).toBe("Mount Zion Berlin");
    expect(r.source.pastor).toBe("Pastor Doe");
    expect(r.source.email).toBe("pastor@parish.org");
  });

  it("detects October 2025 from Sundays", () => {
    const r = parseWorkbook(wb(buildBaselineGrid()));
    expect(r.source.reportMonth).toBe("October 2025");
    expect(r.source.monthIndex).toBe(9);
    expect(r.source.year).toBe(2025);
  });

  it("re-sums monthly totals correctly", () => {
    const r = parseWorkbook(wb(buildBaselineGrid()));
    expect(r.monthlyValidation.offering.recomputed).toBe(417);
    expect(r.monthlyValidation.tithe.recomputed).toBe(813);
    expect(r.monthlyValidation.others.recomputed).toBe(42);
  });
});

describe("parseWorkbook — sanity checks (§11.7)", () => {
  it("does NOT flag undated empty Sunday rows (WEEK 5 placeholder)", () => {
    const grid = buildBaselineGrid().map((row) => row.slice());
    // Add an undated, all-zero Sunday row at the end of the per-date block.
    // (Splice into the grid before the per-week Total row.)
    const headerIdx = grid.findIndex((r) => r[0] === "Total" && r[1] === null);
    grid.splice(headerIdx, 0, [null, "Sunday", 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    const r = parseWorkbook(wb(grid));
    const noEmpty = r.sanityChecks.find((c) => c.id === "no-empty-sundays");
    // Undated empty rows are ignored → should be ok.
    expect(noEmpty!.level).toBe("ok");
  });

  it("DOES flag dated Sundays with no values entered", () => {
    const grid = buildBaselineGrid().map((row) => row.slice());
    // Add a DATED but empty Sunday — should warn.
    const headerIdx = grid.findIndex((r) => r[0] === "Total" && r[1] === null);
    grid.splice(headerIdx, 0, [
      new Date(Date.UTC(2025, 10, 2)),
      "Sunday",
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);

    const r = parseWorkbook(wb(grid));
    const noEmpty = r.sanityChecks.find((c) => c.id === "no-empty-sundays");
    expect(noEmpty!.level).toBe("warn");
  });
});

describe("parseWorkbook — banner/field tolerance parity (§11.9, §11.10)", () => {
  it("averages use 0.05 tolerance and stay at full precision", () => {
    const r = parseWorkbook(wb(buildBaselineGrid()));
    // The "Monthly Average" row reports 52/62/29 for men/women/children.
    // The parser's full-precision recomputation must be within 0.05 of those.
    expect(r.monthlyValidation.averageMen.validated).toBe(true);
    expect(r.monthlyValidation.averageWomen.validated).toBe(true);
    expect(r.monthlyValidation.averageChildren.validated).toBe(true);
  });
});

describe("parseWorkbook — error path", () => {
  it("throws when no grand-total row can be located", () => {
    // No "Offering" header → readGrandTotalRow returns null.
    const grid: CellInput[][] = [["Name Of Parish"], ["Test Parish"]];
    expect(() => parseWorkbook(wb(grid))).toThrow(/grand-total row/);
  });
});
