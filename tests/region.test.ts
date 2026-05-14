import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sumTotals } from "@/lib/region/totals";
import { _monthLabel, buildRegionWorkbook } from "@/lib/region/xlsx";

// Mirror of RegionRollupRow so we don't import from queries.ts (which
// pulls in the Drizzle client and a DATABASE_URL requirement).
interface RegionRollupRow {
  parishId: string;
  parishName: string;
  regionName: string;
  pastorName: string | null;
  mobile: string | null;
  submittedAt: string | null;
  reportMonth: string;
  avgAttendance: number;
  offerings: number;
  tithes: number;
  thanksgiving: number;
  others: number;
  total: number;
  expectedRegionalOffering5: number;
  expectedRegionalTithe20: number;
  expectedRegionalTotal: number;
  submitted: boolean;
}

// Build a fake row with sane defaults; tests override what they care about.
function fakeRow(over: Partial<RegionRollupRow> = {}): RegionRollupRow {
  return {
    parishId: "p1",
    parishName: "Test Parish",
    regionName: "Region",
    pastorName: "Pastor X",
    mobile: "+49 30 1234 5678",
    submittedAt: "2025-12-01T10:00:00.000Z",
    reportMonth: "2025-12-01",
    avgAttendance: 0,
    offerings: 0,
    tithes: 0,
    thanksgiving: 0,
    others: 0,
    total: 0,
    expectedRegionalOffering5: 0,
    expectedRegionalTithe20: 0,
    expectedRegionalTotal: 0,
    submitted: true,
    ...over,
  };
}

describe("sumTotals", () => {
  it("returns zero totals for an empty array", () => {
    const t = sumTotals([]);
    expect(t.offerings).toBe(0);
    expect(t.tithes).toBe(0);
    expect(t.total).toBe(0);
    expect(t.expectedRegionalTotal).toBe(0);
  });

  it("sums numeric columns row-wise", () => {
    const rows = [
      fakeRow({ avgAttendance: 8, offerings: 68.65, tithes: 659.87, total: 964.72 }),
      fakeRow({ avgAttendance: 62, offerings: 839.23, tithes: 4067.8, total: 4967.23 }),
    ];
    const t = sumTotals(rows);
    expect(t.avgAttendance).toBe(70);
    expect(t.offerings).toBe(907.88);
    expect(t.tithes).toBe(4727.67);
    expect(t.total).toBe(5931.95);
  });

  it("rounds to 2 decimals to avoid float drift", () => {
    const rows = [fakeRow({ offerings: 0.1 }), fakeRow({ offerings: 0.2 })];
    expect(sumTotals(rows).offerings).toBe(0.3);
  });

  it("propagates expected-remittance subtotals", () => {
    const rows = [
      fakeRow({
        expectedRegionalOffering5: 3.43,
        expectedRegionalTithe20: 131.97,
        expectedRegionalTotal: 135.4,
      }),
      fakeRow({
        expectedRegionalOffering5: 41.96,
        expectedRegionalTithe20: 813.56,
        expectedRegionalTotal: 855.52,
      }),
    ];
    const t = sumTotals(rows);
    expect(t.expectedRegionalOffering5).toBe(45.39);
    expect(t.expectedRegionalTithe20).toBe(945.53);
    expect(t.expectedRegionalTotal).toBe(990.92);
  });
});

describe("_monthLabel", () => {
  it("formats YYYY-MM-01 as 'MON YYYY' (export-style)", () => {
    expect(_monthLabel("2025-12-01")).toBe("DEC 2025");
    expect(_monthLabel("2025-01-01")).toBe("JAN 2025");
    expect(_monthLabel("2026-07-01")).toBe("JUL 2026");
  });

  it("falls back to raw string for malformed input", () => {
    expect(_monthLabel("garbage")).toBe("garbage");
    expect(_monthLabel("2025-13-01")).toBe("2025-13-01");
  });
});

describe("buildRegionWorkbook", () => {
  it("creates one sheet per month, named MON YYYY", () => {
    const rollups = [
      {
        month: "2025-12-01",
        rows: [
          fakeRow({ parishName: "God's Grace Parish, Kiel", offerings: 68.65, total: 964.72 }),
        ],
        totals: sumTotals([fakeRow({ offerings: 68.65, total: 964.72 })]),
      },
      {
        month: "2025-11-01",
        rows: [fakeRow({ parishName: "Tabernacle of Meeting", offerings: 839.23 })],
        totals: sumTotals([fakeRow({ offerings: 839.23 })]),
      },
    ];
    const wb = buildRegionWorkbook("Demo Church", rollups);
    expect(wb.SheetNames).toEqual(["DEC 2025", "NOV 2025"]);
  });

  it("the title row spans the detail columns and includes the tenant + month", () => {
    const rollups = [
      {
        month: "2025-12-01",
        rows: [fakeRow({ parishName: "Mount Zion" })],
        totals: sumTotals([fakeRow()]),
      },
    ];
    const wb = buildRegionWorkbook("Demo Church", rollups);
    const ws = wb.Sheets["DEC 2025"]!;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    // Row 0 has the title in col B (index 1).
    expect(rowAsStrings(grid[0])).toContain(
      "Attendance & Financial Reports · Demo Church · DEC 2025",
    );
    // Row 0 also has "Remittances" in col M (index 12).
    expect(grid[0]?.[12]).toBe("Remittances");
    // Row 1 has column headers including the canonical "S/No" + "Total".
    const headers = rowAsStrings(grid[1]);
    expect(headers).toContain("S/No");
    expect(headers).toContain("Name of Parish");
    expect(headers).toContain("Total");
  });

  it("renders a footer row labeled TOTAL with the column sums", () => {
    const rows = [
      fakeRow({ offerings: 100, tithes: 200, total: 300 }),
      fakeRow({ offerings: 50, tithes: 75, total: 125 }),
    ];
    const totals = sumTotals(rows);
    const wb = buildRegionWorkbook("Demo Church", [{ month: "2025-12-01", rows, totals }]);
    const ws = wb.Sheets["DEC 2025"]!;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    // Title (row 0) + headers (row 1) + 2 data rows + footer = grid.length 5
    expect(grid.length).toBe(5);
    const footer = grid[4]!;
    expect(footer[1]).toBe("TOTAL");
    // Offerings sum is in col 7 (0-indexed).
    expect(footer[7]).toBe(150);
    // Total sum in col 11.
    expect(footer[11]).toBe(425);
  });
});

function rowAsStrings(row: unknown): string[] {
  if (!Array.isArray(row)) return [];
  return row.map((v) => (v == null ? "" : String(v)));
}
