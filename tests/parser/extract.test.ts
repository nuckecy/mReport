import { describe, expect, it } from "vitest";
import { extractPerDateRows, readActualRemittance } from "@/lib/parser/extract";
import { buildSheet } from "./sheet-builder";

describe("extractPerDateRows — stop-marker sweep (§11.6)", () => {
  it("stops at 'Total' in ANY column, not just the Days column", () => {
    // The bug: the walker only checked column C (Days). If a template put
    // "Total" in column B, the walker leaked into Monthly Average rows.
    // Here we build a 3-week mini block followed by a "Total" marker in
    // column A (the Date column). The walker must stop there.
    const sheet = buildSheet([
      // Header row (row 0): col 0 Date, col 1 Days, col 2 Men, col 3 Women,
      // col 4 Children, col 5 Total, col 6 Offering, col 7 Tithe,
      // col 8 Tnx_Giving, col 9 Others, col 10 Total (€)
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
      // 3 dated rows
      [new Date(Date.UTC(2025, 9, 5)), "Sunday", 50, 60, 30, 140, 100, 200, 50, 10, 360],
      [new Date(Date.UTC(2025, 9, 12)), "Sunday", 55, 65, 32, 152, 110, 210, 55, 12, 387],
      [new Date(Date.UTC(2025, 9, 19)), "Sunday", 52, 62, 28, 142, 105, 205, 52, 11, 373],
      // Stop marker in column A (Date) — must stop here.
      ["Total", null, null, null, null, null, null, null, null, null, null],
      // This row should NOT be picked up — but if the walker only looked at
      // col 1 it would, because col 1 here is not a stop marker.
      ["Monthly Average", null, 52, 62, 30, 144, null, null, null, null, null],
    ]);

    const rows = extractPerDateRows(sheet);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.date).toBe("2025-10-05");
    expect(rows[2]!.date).toBe("2025-10-19");
  });

  it("validates per-row attendance + money sums", () => {
    const sheet = buildSheet([
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
      [new Date(Date.UTC(2025, 9, 5)), "Sunday", 50, 60, 30, 140, 100, 200, 50, 10, 360],
      [new Date(Date.UTC(2025, 9, 12)), "Sunday", 55, 65, 32, 152, 110, 210, 55, 12, 387],
      ["Total", null, null, null, null, null, null, null, null, null, null],
    ]);
    const rows = extractPerDateRows(sheet);
    expect(rows[0]!.attendance.totalCalculated).toBe(140);
    expect(rows[0]!.attendance.validated).toBe(true);
    expect(rows[0]!.money.totalCalculated).toBe(360);
    expect(rows[0]!.money.validated).toBe(true);
  });

  it("supports DD.MM.YYYY string dates in per-date rows (§11.8)", () => {
    const sheet = buildSheet([
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
      [{ t: "s", v: "05.10.2025" }, "Sunday", 50, 60, 30, 140, 100, 200, 50, 10, 360],
      ["Total", null, null, null, null, null, null, null, null, null, null],
    ]);
    const rows = extractPerDateRows(sheet);
    expect(rows[0]!.date).toBe("2025-10-05");
  });
});

describe("readActualRemittance — 5% vs 55% regression (§11.3)", () => {
  it("reads Provincial 5% as 128.05, not the 55% Parish Ops value", () => {
    // Mount Zion reproducer: both "5% of Tithe" and "55% of Tithe" exist.
    // The bug: substring matching pulled 1408.55 from the 55% row into
    // Provincial's slot. With negative lookbehind it must read 128.05.
    const sheet = buildSheet([
      // Section 1 — Parish Operations 55%
      [null, null, null],
      [null, "55% of Tithe", null],
      [null, 1408.55, null],
      // Section 2 — Provincial 5%
      [null, null, null],
      [null, "5% of Tithe", null],
      [null, 128.05, null],
    ]);
    const r = readActualRemittance(sheet);
    expect(r.provincial.tithe5).toBe(128.05);
    expect(r.operations.tithe55).toBe(1408.55);
  });
});
