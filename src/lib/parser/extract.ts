// Section extractors — per-date rows, statistics, weekly totals, grand total,
// monthly averages, and actual remittance.
//
// Ported from _prototype/index.html §2.3 – §2.9. Several spec §11 bug fixes
// live here:
//   §11.3 — percentage substring (negative lookbehind on every % regex)
//   §11.6 — per-date walker stop markers (sweep every column for terminators)
//   §11.9 — averages computed at full precision; rounding deferred to render

import type { WorkSheet } from "xlsx";
import { NUM, round2 } from "./num";
import { decodeRange, encodeCell, findAllCells, findCell, getCell } from "./cells";
import { excelDateToJS, parseStringDate, ymd } from "./dates";

// ── Statistics field map ──────────────────────────────────────────────

export interface StatField {
  key: StatKey;
  label: string;
}

export type StatKey =
  | "births"
  | "marriages"
  | "deaths"
  | "converts"
  | "baptisms"
  | "workers"
  | "ministers"
  | "disciplinary"
  | "newParishes"
  | "newNations"
  | "churchDedication"
  | "projects";

export const STAT_FIELDS: ReadonlyArray<StatField> = [
  { key: "births", label: "Births" },
  { key: "marriages", label: "Marriages" },
  { key: "deaths", label: "Deaths" },
  { key: "converts", label: "Converts" },
  { key: "baptisms", label: "Baptisms" },
  { key: "workers", label: "Workers" },
  { key: "ministers", label: "Ministers" },
  { key: "disciplinary", label: "Disciplinary" },
  { key: "newParishes", label: "New Parishes" },
  { key: "newNations", label: "New Nations" },
  { key: "churchDedication", label: "Church Dedication" },
  { key: "projects", label: "Projects" },
];

export const STAT_LABEL_PATTERNS: Record<StatKey, RegExp> = {
  births: /^births?$/i,
  marriages: /^marriages?$/i,
  deaths: /^deaths?$/i,
  converts: /^converts?$/i,
  baptisms: /^baptisms?$/i,
  workers: /^workers?$/i,
  ministers: /^ministers?$/i,
  // Trailing whitespace tolerated because the source template has a stray space.
  disciplinary: /^disciplinary\s*$/i,
  newParishes: /^new\s*parishes?$/i,
  newNations: /^new\s*nations?$/i,
  churchDedication: /^church\s*dedication$/i,
  projects: /^projects?$/i,
};

// ── Per-date row extraction ───────────────────────────────────────────

export interface PerDateRow {
  row: number;
  day: string;
  date: string | null;
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
  hasAttendance: boolean;
  hasMoney: boolean;
}

type ColMap = Partial<{
  date: number;
  days: number;
  men: number;
  women: number;
  children: number;
  totalAttendance: number;
  offering: number;
  tithe: number;
  thanksgiving: number;
  others: number;
  totalMoney: number;
}>;

function isSectionEndRow(sheet: WorkSheet, r: number, startC: number, endC: number): boolean {
  for (let cc = startC; cc <= endC; cc++) {
    const cv = getCell(sheet, r, cc);
    if (!cv || cv.v == null) continue;
    const s = String(cv.v).trim().toLowerCase();
    if (s === "total" || s === "monthly average" || /^week\s*\d+/i.test(s)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract one entry per dated row across every WEEK block.
 *
 * Columns are mapped by HEADER LABEL (Date/Days/Men/...), never by letter —
 * shifted columns in different templates still parse.
 *
 * The "sweep every column for stop markers" guard (spec §11.6) catches
 * templates that put "Total" in column B instead of C, which otherwise
 * caused the walker to leak into the Monthly Average row.
 */
export function extractPerDateRows(sheet: WorkSheet): PerDateRow[] {
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const headerHits = findAllCells(sheet, /^offering$/i);
  const rows: PerDateRow[] = [];

  for (const hit of headerHits) {
    const cols: ColMap = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, hit.r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim().toLowerCase();
      if (s === "date") cols.date = c;
      else if (s === "days") cols.days = c;
      else if (s === "men") cols.men = c;
      else if (s === "women") cols.women = c;
      else if (s === "children") cols.children = c;
      else if (s === "total") cols.totalAttendance = c;
      else if (s === "offering") cols.offering = c;
      else if (s === "tithe") cols.tithe = c;
      else if (/tnx[_\s]?giving|thanksgiving|tnx giving/.test(s)) cols.thanksgiving = c;
      else if (s === "others") cols.others = c;
      else if (/^total\s*\(?€\)?$/.test(s)) cols.totalMoney = c;
    }

    for (let r = hit.r + 1; r <= Math.min(hit.r + 8, range.e.r); r++) {
      if (isSectionEndRow(sheet, r, range.s.c, range.e.c)) break;

      const dayCell = cols.days != null ? getCell(sheet, r, cols.days) : null;
      const dateCell = cols.date != null ? getCell(sheet, r, cols.date) : null;
      const dayLabel = dayCell && dayCell.v != null ? String(dayCell.v).trim() : "";
      const hasDate = !!(dateCell && dateCell.v != null);
      if (!hasDate && !dayLabel) continue;

      const get = (key: keyof ColMap): unknown => {
        const col = cols[key];
        if (col == null) return null;
        const cell = getCell(sheet, r, col);
        return cell && cell.v != null ? cell.v : null;
      };

      let dateVal: unknown = get("date");
      if (typeof dateVal === "number") {
        const d = excelDateToJS(dateVal);
        if (d) dateVal = d;
      } else if (dateVal instanceof Date) {
        dateVal = new Date(dateVal.getUTCFullYear(), dateVal.getUTCMonth(), dateVal.getUTCDate());
      } else if (typeof dateVal === "string" && dateVal.trim()) {
        const d = parseStringDate(dateVal);
        if (d) dateVal = d;
      }
      const dateLocal =
        dateVal instanceof Date
          ? ymd(dateVal)
          : typeof dateVal === "string" || typeof dateVal === "number"
            ? String(dateVal) || null
            : null;

      const men = NUM(get("men"));
      const women = NUM(get("women"));
      const children = NUM(get("children"));
      const totalAtt = get("totalAttendance");
      const offering = NUM(get("offering"));
      const tithe = NUM(get("tithe"));
      const thanksgiving = NUM(get("thanksgiving"));
      const others = NUM(get("others"));
      const totalMoney = get("totalMoney");

      const allBlank =
        !hasDate &&
        !dayLabel &&
        men + women + children + offering + tithe + thanksgiving + others === 0;
      if (allBlank) continue;

      rows.push({
        row: r,
        day: dayLabel,
        date: dateLocal,
        attendance: {
          men,
          women,
          children,
          totalReported: totalAtt != null ? NUM(totalAtt) : null,
          totalCalculated: men + women + children,
          validated:
            totalAtt != null ? Math.abs(NUM(totalAtt) - (men + women + children)) < 0.01 : null,
        },
        money: {
          offering,
          tithe,
          thanksgiving,
          others,
          totalReported: totalMoney != null ? NUM(totalMoney) : null,
          totalCalculated: round2(offering + tithe + thanksgiving + others),
          validated:
            totalMoney != null
              ? Math.abs(NUM(totalMoney) - (offering + tithe + thanksgiving + others)) < 0.01
              : null,
        },
        hasAttendance: men + women + children > 0,
        hasMoney: offering + tithe + thanksgiving + others > 0,
      });
    }
  }
  return rows;
}

// ── Per-date statistics ───────────────────────────────────────────────

export interface PerDateStatRow {
  row: number;
  date: string | null;
  day: string;
  stats: Record<StatKey, number>;
  hasAny: boolean;
}

export function extractPerDateStatistics(sheet: WorkSheet): PerDateStatRow[] {
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const headerHits = findAllCells(sheet, /^births?$/i);
  const rows: PerDateStatRow[] = [];

  for (const hit of headerHits) {
    const cols: Partial<Record<StatKey, number>> = {};
    let dateCol: number | null = null;
    let daysCol: number | null = null;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, hit.r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim().toLowerCase();
      if (s === "date") dateCol = c;
      else if (s === "days") daysCol = c;
      for (const f of STAT_FIELDS) {
        if (STAT_LABEL_PATTERNS[f.key].test(s)) cols[f.key] = c;
      }
    }

    for (let r = hit.r + 1; r <= Math.min(hit.r + 8, range.e.r); r++) {
      if (isSectionEndRow(sheet, r, range.s.c, range.e.c)) break;

      let dateVal: unknown = dateCol != null ? (getCell(sheet, r, dateCol)?.v ?? null) : null;
      if (typeof dateVal === "number") {
        const d = excelDateToJS(dateVal);
        if (d) dateVal = d;
      } else if (dateVal instanceof Date) {
        dateVal = new Date(dateVal.getUTCFullYear(), dateVal.getUTCMonth(), dateVal.getUTCDate());
      }
      const dateLocal =
        dateVal instanceof Date
          ? ymd(dateVal)
          : typeof dateVal === "string"
            ? dateVal || null
            : null;
      const dayLabel = daysCol != null ? String(getCell(sheet, r, daysCol)?.v ?? "").trim() : "";
      if (!dateLocal && !dayLabel) continue;

      const stats = Object.fromEntries(STAT_FIELDS.map((f) => [f.key, 0])) as Record<
        StatKey,
        number
      >;
      let any = false;
      for (const f of STAT_FIELDS) {
        const col = cols[f.key];
        if (col == null) continue;
        const cell = getCell(sheet, r, col);
        const v = cell && cell.v != null ? NUM(cell.v) : 0;
        stats[f.key] = v;
        if (v !== 0) any = true;
      }

      rows.push({ row: r, date: dateLocal, day: dayLabel, stats, hasAny: any });
    }
  }
  return rows;
}

// ── Entered stat totals (the grand-total row below all weekly blocks) ──

export interface EnteredStatTotals {
  row: number;
  totals: Record<StatKey, number | null>;
  addresses: Record<StatKey, string | null>;
  sheetName: string | null;
}

export function readEnteredStatTotals(sheet: WorkSheet): EnteredStatTotals | null {
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const headerHits = findAllCells(sheet, /^births?$/i);
  if (headerHits.length === 0) return null;
  const lastHeader = headerHits[headerHits.length - 1]!;

  const cols: Partial<Record<StatKey, number>> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = getCell(sheet, lastHeader.r, c);
    if (!cell || cell.v == null) continue;
    const s = String(cell.v).trim().toLowerCase();
    for (const f of STAT_FIELDS) {
      if (STAT_LABEL_PATTERNS[f.key].test(s)) cols[f.key] = c;
    }
  }

  // Skip the per-week Total row by starting ≥6 rows below the last header.
  for (let r = lastHeader.r + 6; r <= range.e.r; r++) {
    let isTotal = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cv = getCell(sheet, r, c);
      if (!cv || cv.v == null) continue;
      if (String(cv.v).trim().toLowerCase() === "total") {
        isTotal = true;
        break;
      }
    }
    if (!isTotal) continue;

    const totals = Object.fromEntries(STAT_FIELDS.map((f) => [f.key, null])) as Record<
      StatKey,
      number | null
    >;
    const addresses = Object.fromEntries(STAT_FIELDS.map((f) => [f.key, null])) as Record<
      StatKey,
      string | null
    >;
    let populated = 0;
    for (const f of STAT_FIELDS) {
      const col = cols[f.key];
      if (col == null) continue;
      const addr = encodeCell({ r, c: col });
      const cell = getCell(sheet, r, col);
      const v = cell && cell.v != null ? NUM(cell.v) : null;
      totals[f.key] = v;
      addresses[f.key] = addr;
      if (v != null) populated++;
    }
    if (populated >= STAT_FIELDS.length / 2) {
      return { row: r, totals, addresses, sheetName: null };
    }
  }
  return null;
}

// ── Weekly totals (one per WEEK block) ────────────────────────────────

export interface WeeklyTotalRaw {
  weekIndex: number;
  totalRow: number;
  headerRow: number;
  enteredTotal: number | null;
}

export function extractWeeklyTotals(sheet: WorkSheet): WeeklyTotalRaw[] {
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const headerHits = findAllCells(sheet, /^offering$/i);
  const out: WeeklyTotalRaw[] = [];

  headerHits.forEach((hit, idx) => {
    let totalMoneyCol: number | null = null;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, hit.r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim().toLowerCase();
      if (/^total\s*\(?€\)?$/.test(s)) totalMoneyCol = c;
    }
    if (totalMoneyCol == null) return;

    for (let r = hit.r + 1; r <= Math.min(hit.r + 8, range.e.r); r++) {
      let isTotal = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cv = getCell(sheet, r, c);
        if (!cv || cv.v == null) continue;
        if (String(cv.v).trim().toLowerCase() === "total") {
          isTotal = true;
          break;
        }
      }
      if (isTotal) {
        const enteredCell = getCell(sheet, r, totalMoneyCol);
        out.push({
          weekIndex: idx + 1,
          totalRow: r,
          headerRow: hit.r,
          enteredTotal: enteredCell && enteredCell.v != null ? NUM(enteredCell.v) : null,
        });
        break;
      }
    }
  });
  return out;
}

// ── Grand total row (monthly Offering/Tithe/Thanksgiving/Others) ──────

export interface GrandTotal {
  row: number;
  offering: number;
  tithe: number;
  thanksgiving: number;
  others: number;
  cols: Partial<Record<"offering" | "tithe" | "thanksgiving" | "others", number>>;
}

export function readGrandTotalRow(sheet: WorkSheet): GrandTotal | null {
  const headerHit = findCell(sheet, "Offering");
  if (!headerHit) return null;
  const range = decodeRange(sheet["!ref"] ?? "A1");
  const cols: GrandTotal["cols"] = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = getCell(sheet, headerHit.r, c);
    if (!cell || cell.v == null) continue;
    const s = String(cell.v).trim().toLowerCase();
    if (s === "offering") cols.offering = c;
    else if (s === "tithe") cols.tithe = c;
    else if (/tnx[_\s]?giving|thanksgiving|tnx giving/.test(s)) cols.thanksgiving = c;
    else if (s === "others") cols.others = c;
  }

  const totalLabels = findAllCells(sheet, /^\s*total\s*$/i);
  let best: { row: number; vals: Record<string, number>; score: number } | null = null;
  for (const lab of totalLabels) {
    const vals: Record<string, number> = {};
    for (const k of Object.keys(cols) as Array<keyof GrandTotal["cols"]>) {
      const c = cols[k];
      if (c == null) {
        vals[k] = 0;
        continue;
      }
      const cell = getCell(sheet, lab.r, c);
      vals[k] = cell ? NUM(cell.v) : 0;
    }
    const score =
      (vals.tithe ?? 0) + (vals.offering ?? 0) + (vals.thanksgiving ?? 0) + (vals.others ?? 0);
    if (!best || score > best.score) best = { row: lab.r, vals, score };
  }
  if (!best) return null;
  return {
    row: best.row,
    offering: best.vals.offering ?? 0,
    tithe: best.vals.tithe ?? 0,
    thanksgiving: best.vals.thanksgiving ?? 0,
    others: best.vals.others ?? 0,
    cols,
  };
}

// ── Monthly average + demographics ────────────────────────────────────

export function readMonthlyAverageTotal(sheet: WorkSheet): number | null {
  const hit = findCell(sheet, "Monthly Average");
  if (!hit) return null;
  const range = decodeRange(sheet["!ref"] ?? "A1");
  let last: number | null = null;
  for (let c = hit.c + 1; c <= range.e.c; c++) {
    const cell = getCell(sheet, hit.r, c);
    if (cell && typeof cell.v === "number") last = cell.v;
  }
  return last;
}

export interface MonthlyAverageDemographics {
  men: number | null;
  women: number | null;
  children: number | null;
}

export function readMonthlyAverageDemographics(sheet: WorkSheet): MonthlyAverageDemographics {
  const hit = findCell(sheet, "Monthly Average");
  if (!hit) return { men: null, women: null, children: null };
  const range = decodeRange(sheet["!ref"] ?? "A1");

  let headerRow: number | null = null;
  for (let r = hit.r - 1; r >= range.s.r; r--) {
    let hasMen = false;
    let hasWomen = false;
    let hasChildren = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = getCell(sheet, r, c);
      if (!cell || cell.v == null) continue;
      const s = String(cell.v).trim().toLowerCase();
      if (s === "men") hasMen = true;
      else if (s === "women") hasWomen = true;
      else if (s === "children") hasChildren = true;
    }
    if (hasMen && hasWomen && hasChildren) {
      headerRow = r;
      break;
    }
  }
  if (headerRow == null) return { men: null, women: null, children: null };

  const cols: Partial<Record<"men" | "women" | "children", number>> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = getCell(sheet, headerRow, c);
    if (!cell || cell.v == null) continue;
    const s = String(cell.v).trim().toLowerCase();
    if (s === "men") cols.men = c;
    else if (s === "women") cols.women = c;
    else if (s === "children") cols.children = c;
  }
  const get = (col: number | undefined): number | null => {
    if (col == null) return null;
    const cell = getCell(sheet, hit.r, col);
    return cell && cell.v != null ? NUM(cell.v) : null;
  };
  return { men: get(cols.men), women: get(cols.women), children: get(cols.children) };
}

// ── Actual remittance reading ─────────────────────────────────────────
//
// Every percentage matcher uses (?<!\d) negative lookbehind to prevent
// "5%" from matching inside "55%" etc. — see spec §11.3.

export interface ActualRemittance {
  regional: { offering5: number | null; tithe20: number | null; total: number | null };
  operations: {
    tithe55: number | null;
    offering95: number | null;
    thanksgiving30: number | null;
    total: number | null;
  };
  pastorAllow: { tithe20: number | null; thanksgiving70: number | null; total: number | null };
  provincial: { tithe5: number | null };
}

export function readActualRemittance(sheet: WorkSheet): ActualRemittance {
  const out: ActualRemittance = {
    regional: { offering5: null, tithe20: null, total: null },
    operations: { tithe55: null, offering95: null, thanksgiving30: null, total: null },
    pastorAllow: { tithe20: null, thanksgiving70: null, total: null },
    provincial: { tithe5: null },
  };

  const readLabelValuePair = (labelPattern: RegExp): number | null => {
    const hit = findCell(sheet, labelPattern);
    if (!hit) return null;
    const cell = getCell(sheet, hit.r + 1, hit.c);
    return cell ? NUM(cell.v) : null;
  };

  out.regional.offering5 = readLabelValuePair(/(?<!\d)5%\s*of\s*offering/i);
  out.regional.tithe20 = readLabelValuePair(/(?<!\d)20%\s*of\s*tithe$/i);
  out.regional.total = readLabelValuePair(/total\s*remittance/i);

  out.operations.tithe55 = readLabelValuePair(/(?<!\d)55%\s*of\s*tithe/i);
  out.operations.offering95 = readLabelValuePair(/(?<!\d)95%\s*of\s*offering/i);
  out.operations.thanksgiving30 = readLabelValuePair(
    /(?<!\d)30%\s*of\s*t[/\s]?giving|(?<!\d)30%\s*of\s*thanksgiving/i,
  );
  out.operations.total = (() => {
    const hdr = findCell(sheet, /twds\.?\s*parish\s*operations/i);
    if (!hdr) return null;
    const labels = findAllCells(sheet, /total\s*\(?€\)?/i);
    const expected =
      (out.operations.tithe55 ?? 0) +
      (out.operations.offering95 ?? 0) +
      (out.operations.thanksgiving30 ?? 0);
    for (const lab of labels) {
      const cell = getCell(sheet, lab.r + 1, lab.c);
      if (cell && typeof cell.v === "number" && Math.abs(cell.v - expected) < 1) {
        return cell.v;
      }
    }
    return null;
  })();

  // Pastor Allowance — SECOND occurrence of "20% of Tithe", and 70% of T/Giving.
  out.pastorAllow.thanksgiving70 = readLabelValuePair(
    /(?<!\d)70%\s*of\s*t[/\s]?giving|(?<!\d)70%\s*of\s*thanksgiving/i,
  );
  out.pastorAllow.tithe20 = (() => {
    const hits = findAllCells(sheet, /(?<!\d)20%\s*of\s*tithes?$/i);
    if (hits.length >= 2) {
      const second = hits[1]!;
      const cell = getCell(sheet, second.r + 1, second.c);
      return cell ? NUM(cell.v) : null;
    }
    return null;
  })();
  out.pastorAllow.total = (() => {
    const hit = findCell(sheet, /(?<!\d)70%\s*of\s*t[/\s]?giving/i);
    if (!hit) return null;
    const labels = findAllCells(sheet, /total\s*\(?€\)?/i);
    for (const lab of labels) {
      if (lab.r === hit.r) {
        const cell = getCell(sheet, lab.r + 1, lab.c);
        if (cell) return NUM(cell.v);
      }
    }
    return null;
  })();

  out.provincial.tithe5 = readLabelValuePair(/(?<!\d)5%\s*of\s*tithe/i);

  return out;
}
