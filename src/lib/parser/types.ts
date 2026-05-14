/**
 * Type contracts for the parser layer. The full Report shape mirrors the JSON
 * export documented in `_prototype/EXTRACTED-SPEC.md` §9.
 *
 * Implementation arrives Day 4 — porting `parseWorkbook` and helpers from the
 * prototype, broken into typed modules.
 */

export type SeverityLevel = "ok" | "warn" | "fail";
export type FailureSubType =
  | "forgot-to-total"
  | "wrong-arithmetic"
  | "wrong-allocation"
  | "missing-entry"
  | "template-defect";

export interface SourceInfo {
  sheet: string;
  parish: string | null;
  pastor: string | null;
  mobile: string | null;
  email: string | null;
  reportMonth: string;
  monthIndex: number | null;
  year: number | null;
}

export interface ParishRecords {
  averageAttendance: number | null;
  totalOffering: number;
  totalTithe: number;
  totalThanksgiving: number;
  totalOthers: number;
  sum: number;
}

export interface PerDateRow {
  row: number;
  day: string;
  date: string | null;
  hasAttendance: boolean;
  hasMoney: boolean;
  attendance: {
    men: number;
    women: number;
    children: number;
    totalReported: number | null;
    totalCalculated: number;
    validated: boolean | null;
  };
  money: {
    offering: number;
    tithe: number;
    thanksgiving: number;
    others: number;
    totalReported: number | null;
    totalCalculated: number;
    validated: boolean | null;
  };
}

// More types added as parser modules land.
export interface Report {
  source: SourceInfo;
  parishRecords: ParishRecords;
  perDate: PerDateRow[];
  // … placeholder; full shape filled in alongside the parser port.
}
