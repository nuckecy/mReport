// Failure enrichment — takes a notValidated Check and produces the rich
// Failure object the renderer needs (sub-type, severity, cell address,
// auto-fixable flag, title + explanation + fix text).
//
// Ported from _prototype/index.html §3.3 – §3.9.
//
// Why this lives in its own module: classifyFailure + explainFailure carry
// significant copy/wording the product team will iterate on. Isolating
// them keeps the diff small when those messages evolve.

import { FIELD_SEVERITY, LABEL_SEVERITY } from "./rules";
import type { Check } from "./checks";
import type { Report, StatField } from "@/lib/parser";
import { STAT_FIELDS } from "@/lib/parser";
import type { FailureSubType, SeverityLevel } from "@/lib/parser/types";
import { fmt, fmtCount, fmtSmart, formatLongDate, friendlyJoin } from "@/lib/format";

export interface Failure {
  check: Check;
  subType: FailureSubType;
  severity: SeverityLevel;
  cellAddress: string | null;
  autoFixable: boolean;
  title: string;
  explanation: string;
  fixText: string;
}

// ── classifyFailure ──────────────────────────────────────────────────
//
// Decision order matters — see spec §11.15. Template-defect FIRST so a
// "55% of Tithe" failure caused by a wrong-rate template doesn't get
// surfaced as a preparer-side wrong-allocation.

export function classifyFailure(check: Check, report: Report): FailureSubType {
  const calc = Number(check.calc) || 0;
  const actual = check.actual == null ? null : Number(check.actual);

  if (report.templateValidity.formulaIssues.length) {
    const checkLabel = `${check.section} ${check.label}`.toLowerCase();
    for (const issue of report.templateValidity.formulaIssues) {
      const tokens = issue.message.toLowerCase().match(/\d+%\s*of\s*\w+/);
      if (tokens && checkLabel.includes(tokens[0])) return "template-defect";
    }
  }

  if (
    /regional remittance|parish operations|pastor allowance|provincial remittance|allocation reconciliation/i.test(
      check.section,
    )
  ) {
    return "wrong-allocation";
  }

  if (actual != null && actual !== 0 && calc === 0) return "missing-entry";
  if (calc > 0 && (actual == null || actual === 0)) return "forgot-to-total";
  return "wrong-arithmetic";
}

// ── severityForCheck ─────────────────────────────────────────────────
// Per-label first (LABEL_SEVERITY) then per-section (FIELD_SEVERITY).

export function severityForCheck(check: Check): SeverityLevel {
  for (const entry of LABEL_SEVERITY) {
    if (entry.pattern.test(check.label)) return entry.severity;
  }
  const sev = FIELD_SEVERITY[check.section] ?? FIELD_SEVERITY._default;
  return sev as SeverityLevel;
}

// ── isAutoFixable ────────────────────────────────────────────────────
// Conservative: only forgot-to-total + non-monetary + cell address known.
// In practice this is Statistics fields only.

export function isAutoFixable(failure: {
  subType: FailureSubType;
  severity: SeverityLevel;
  cellAddress: string | null;
}): boolean {
  if (failure.subType !== "forgot-to-total") return false;
  if (failure.severity === "fail") return false;
  if (!failure.cellAddress) return false;
  return true;
}

// ── cellAddressForCheck ──────────────────────────────────────────────
// Currently only Statistics carries cell addresses (spec §12 known limit).

export function cellAddressForCheck(check: Check, report: Report): string | null {
  if (check.section === "Statistics") {
    const match = report.statistics.validation.find((s) =>
      check.label.toLowerCase().startsWith(s.label.toLowerCase()),
    );
    if (match && match.cellAddress) return match.cellAddress;
  }
  return null;
}

// ── formatterForCheck ────────────────────────────────────────────────
// Section-aware, label-blind — spec §11.11. "sum" in a label must not
// promote Statistics rows to the monetary formatter.

export function formatterForCheck(check: Check): (n: number | null | undefined) => string {
  const section = (check.section || "").toLowerCase();
  const label = (check.label || "").toLowerCase();
  if (section === "statistics") return fmtCount;
  if (section === "per-date attendance") return fmtCount;
  if (/average|avg/.test(label)) return fmtSmart;
  return fmt;
}

// ── explainFailure ───────────────────────────────────────────────────
// Plain-language title + explanation + fix text. Order of cases matches
// the prototype's switch so wording stays identical.

export function explainFailure(
  failure: Pick<Failure, "check" | "subType" | "cellAddress">,
  report: Report,
): Pick<Failure, "title" | "explanation" | "fixText"> {
  const { check, subType } = failure;
  const fieldName = check.label
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^Total\s+/, "")
    .trim();
  const f = formatterForCheck(check);

  switch (subType) {
    case "forgot-to-total": {
      const contributors =
        check.section === "Statistics" ? statisticsContributors(check, report) : null;
      const total = f(check.calc);
      const reported = f(check.actual ?? 0);
      const cellRef = failure.cellAddress ? `cell ${failure.cellAddress}` : "the totals row";

      let explanation: string;
      if (contributors && contributors.length) {
        const entryCount = contributors.length;
        const list = friendlyJoin(contributors.map((c) => `${c.value} on ${c.date}`));
        explanation =
          `${entryCount} ${entryCount === 1 ? "entry" : "entries"} this month — ${list} — ` +
          `for a total of ${total}. But ${cellRef} shows ${reported}. ` +
          `Likely the preparer added ${fieldName} to the weekly rows but forgot to update the totals row.`;
      } else {
        explanation =
          `The weekly entries add up to ${total}, but ${cellRef} shows ${reported}. ` +
          `Likely the totals row was never updated.`;
      }

      return {
        title: `The "${fieldName}" total wasn't updated`,
        explanation,
        fixText: failure.cellAddress
          ? `Set ${failure.cellAddress} to ${total}`
          : `Update the ${fieldName} total to ${total}`,
      };
    }
    case "wrong-arithmetic": {
      const calculated = f(check.calc);
      const reported = f(check.actual);
      const cellRef = failure.cellAddress ? `cell ${failure.cellAddress}` : "the totals row";
      return {
        title: `The "${fieldName}" totals don't agree`,
        explanation:
          `Adding the weekly entries gives ${calculated}, but ${cellRef} shows ${reported}. ` +
          `Either some weekly entries are missing, or the totals row is incorrect. Please review.`,
        fixText: `Please review the file and re-upload.`,
      };
    }
    case "wrong-allocation": {
      const expected = f(check.calc);
      const actual = f(check.actual ?? 0);
      const delta = f(Math.abs(check.calc - (check.actual ?? 0)));
      return {
        title: `${fieldName} amount doesn't match the rule`,
        explanation:
          `Based on the canonical rules, this should be ${expected}, but the file has ${actual} ` +
          `(a difference of ${delta}). This affects how money is allocated.`,
        fixText: `Please review the values in the spreadsheet, correct them, and re-upload.`,
      };
    }
    case "missing-entry": {
      return {
        title: `"${fieldName}" total has a value but no weekly entries`,
        explanation:
          `The totals row shows ${f(check.actual)}, but no weekly rows have any ${fieldName} values. ` +
          `The per-date entries may have been deleted.`,
        fixText: `Please review and re-upload.`,
      };
    }
    case "template-defect": {
      return {
        title: `${fieldName} is affected by a template defect`,
        explanation: `The file's built-in formula uses the wrong rate. See the outdated-template banner above.`,
        fixText: `Re-export with the current template.`,
      };
    }
  }
}

// ── buildFailure ─────────────────────────────────────────────────────

export function buildFailure(check: Check, report: Report): Failure {
  const subType = classifyFailure(check, report);
  const severity = severityForCheck(check);
  const cellAddress = cellAddressForCheck(check, report);
  const autoFixable = isAutoFixable({ subType, severity, cellAddress });
  const text = explainFailure({ check, subType, cellAddress }, report);
  return { check, subType, severity, cellAddress, autoFixable, ...text };
}

// ── statisticsContributors ───────────────────────────────────────────

function statisticsContributors(
  check: Check,
  report: Report,
): Array<{ date: string; value: number }> | null {
  if (!report.statistics.perDate) return null;
  const labelLower = check.label.toLowerCase();
  const statField = STAT_FIELDS.find((f: StatField) =>
    labelLower.startsWith(f.label.toLowerCase()),
  );
  if (!statField) return null;
  return report.statistics.perDate
    .filter((d) => (d.stats[statField.key] || 0) > 0)
    .map((d) => ({
      date: formatLongDate(d.date) ?? `row ${d.row}`,
      value: d.stats[statField.key],
    }));
}
