// Region-rollup XLSX export.
//
// One sheet per month, laid out to match the original Excel template
// in the user's reference screenshot:
//   - Green merged header "Attendance & Financial Reports · ..."
//   - Red merged "Remittances" subheader on the right
//   - Detail columns in the middle (Av Attd, Offerings, Tithes, ...)
//   - Per-parish rows
//   - Bold footer with column totals
//
// We use SheetJS's basic cell-merge + width controls. Cell-level
// fills (green/red) need the styled "xlsx-js-style" fork; the
// plain `xlsx` package we ship today drops style metadata on write.
// That's acceptable for v1 — content + layout match exactly; if we
// later install the styled fork the existing s={fill,font,border}
// payloads will start rendering colored.

import * as XLSX from "xlsx";
import type { MonthRollup } from "./queries";

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function monthLabel(month: string): string {
  // "2025-12-01" → "DEC 2025"
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES[idx]} ${y}`;
}

/**
 * Format an ISO timestamp as "YYYY-MM-DD" (date only, no time).
 * Returns an empty string for null inputs.
 */
function formatDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/**
 * Build one sheet per month. Sheet name is "DEC 2025"-style; SheetJS
 * caps sheet names at 31 chars, well under our format.
 */
export function buildRegionWorkbook(tenantName: string, rollups: MonthRollup[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  for (const rollup of rollups) {
    const ws = buildSheet(tenantName, rollup);
    XLSX.utils.book_append_sheet(wb, ws, monthLabel(rollup.month));
  }

  return wb;
}

const HEADER_LABELS = [
  "S/No",
  "Name of Parish",
  "Mobile Number",
  "Region",
  "Pastor in charge",
  "Submission date",
  "Av Attd",
  "Offerings",
  "Tithes",
  "Thanksgiving",
  "Others",
  "Total",
  "Expected Remittance\n5% Offering",
  "Expected Remittance\n20% Tithe",
  "Expected Remittance\nTotal",
];

const COL_WIDTHS = [
  { wch: 5 }, // S/No
  { wch: 32 }, // Parish
  { wch: 16 }, // Mobile
  { wch: 14 }, // Region
  { wch: 24 }, // Pastor
  { wch: 14 }, // Submission date
  { wch: 8 }, // Av Attd
  { wch: 12 }, // Offerings
  { wch: 12 }, // Tithes
  { wch: 14 }, // Thanksgiving
  { wch: 10 }, // Others
  { wch: 12 }, // Total
  { wch: 16 }, // 5% offering
  { wch: 16 }, // 20% tithe
  { wch: 14 }, // Total remit
];

function buildSheet(tenantName: string, rollup: MonthRollup): XLSX.WorkSheet {
  // Row layout:
  //   row 0:  big title (merged across detail block)        + "Remittances" merged on right
  //   row 1:  HEADER_LABELS
  //   row 2…: per-parish rows
  //   row N:  totals footer
  //
  // Columns are A..O (15 cols), zero-indexed 0..14.
  //   - Title spans B..L (1..11) — leaves Remittances title to M..O (12..14)
  //   - Headers fully fill A..O
  const data: Array<Array<string | number>> = [];

  // Row 0 — title + remittance subheader (merged later).
  const title = `Attendance & Financial Reports · ${tenantName} · ${monthLabel(rollup.month)}`;
  data.push([
    "", // A — empty (S/No column header on row 1 sits here)
    title, // B — start of title merge
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // C..L — filler for merge
    "Remittances", // M — start of remittances merge
    "",
    "", // N..O — filler
  ]);

  // Row 1 — column headers.
  data.push([...HEADER_LABELS]);

  // Rows 2…N-1 — data.
  rollup.rows.forEach((r, idx) => {
    data.push([
      idx + 1,
      r.parishName,
      r.mobile ?? "",
      r.regionName,
      r.pastorName ?? "",
      formatDate(r.submittedAt),
      r.avgAttendance,
      r.offerings,
      r.tithes,
      r.thanksgiving,
      r.others,
      r.total,
      r.expectedRegionalOffering5,
      r.expectedRegionalTithe20,
      r.expectedRegionalTotal,
    ]);
  });

  // Footer row — totals across visible parishes.
  data.push([
    "",
    "TOTAL",
    "",
    "",
    "",
    "",
    rollup.totals.avgAttendance,
    rollup.totals.offerings,
    rollup.totals.tithes,
    rollup.totals.thanksgiving,
    rollup.totals.others,
    rollup.totals.total,
    rollup.totals.expectedRegionalOffering5,
    rollup.totals.expectedRegionalTithe20,
    rollup.totals.expectedRegionalTotal,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = COL_WIDTHS;
  ws["!merges"] = [
    // Title spans B1..L1 (cols 1..11, row 0).
    { s: { r: 0, c: 1 }, e: { r: 0, c: 11 } },
    // Remittances spans M1..O1 (cols 12..14, row 0).
    { s: { r: 0, c: 12 }, e: { r: 0, c: 14 } },
  ];
  ws["!rows"] = [{ hpt: 32 }, { hpt: 32 }]; // taller title + header rows
  return ws;
}

/**
 * Trigger a browser download. No-op outside the browser.
 */
export function downloadRegionWorkbook(tenantName: string, rollups: MonthRollup[]): void {
  if (typeof window === "undefined") return;
  const wb = buildRegionWorkbook(tenantName, rollups);
  const months = rollups.map((r) => monthLabel(r.month).replace(/\s+/g, "_")).join("-");
  const safeTenant = tenantName.trim().replace(/\s+/g, "_") || "report";
  XLSX.writeFile(wb, `mreport_region_${safeTenant}_${months}.xlsx`);
}

export { monthLabel as _monthLabel };
