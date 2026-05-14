// Test-only helper: build a SheetJS WorkSheet from a 2D grid.
//
// Lets us exercise the parser primitives without needing real .xlsx fixtures.
// Each cell can be either a primitive (string/number/Date/null) — the type
// is inferred — or a `{ v, t, w, ... }` object for full control over Excel
// data type metadata.

import * as XLSX from "xlsx";
import type { CellObject, WorkSheet } from "xlsx";

export type CellInput = string | number | boolean | Date | null | undefined | Partial<CellObject>;

/**
 * Build a worksheet from a 2D array. Index [r][c] maps to the cell at row r,
 * column c (both 0-based — A1 = [0][0]).
 */
export function buildSheet(grid: ReadonlyArray<ReadonlyArray<CellInput>>): WorkSheet {
  const sheet: WorkSheet = {};
  let maxR = 0;
  let maxC = 0;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      const value = row[c];
      if (value === null || value === undefined) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      sheet[addr] = toCellObject(value);
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  });
  return sheet;
}

function toCellObject(input: CellInput): CellObject {
  if (input === null || input === undefined) {
    return { t: "z" };
  }
  if (typeof input === "string") return { t: "s", v: input };
  if (typeof input === "number") return { t: "n", v: input };
  if (typeof input === "boolean") return { t: "b", v: input };
  if (input instanceof Date) return { t: "d", v: input };
  // Pre-built cell object.
  if (typeof input === "object") {
    return { t: input.t ?? "s", ...input } as CellObject;
  }
  return { t: "z" };
}
