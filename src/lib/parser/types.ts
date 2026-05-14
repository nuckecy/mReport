// Public type re-exports for the parser layer.
//
// The actual types live alongside the implementation (`parseWorkbook.ts`,
// `extract.ts`, `template-validity.ts`). This file exists only as a stable
// import surface and to keep `export type *` patterns simple for callers
// that want everything in one place.

export type {
  Report,
  SanityCheck,
  MonthlyValidation,
  MonthlyValidationEntry,
  WeeklyTotal,
  AllocationReconciliation,
  StatisticsValidation,
} from "./parseWorkbook";

export type { PerDateRow, PerDateStatRow, StatKey, StatField } from "./extract";

export type { TemplateValidity, ValidityIssue, IssueKind } from "./template-validity";

/**
 * Severity levels. `ok / warn / fail` are used by sanity checks; failure
 * cards also use `info` for neutral / low-priority notices (see prototype
 * design tokens §10.2). The combined union covers both surfaces.
 */
export type SeverityLevel = "ok" | "warn" | "fail" | "info";

/** Failure sub-types produced by classifyFailure (validation layer). */
export type FailureSubType =
  | "forgot-to-total"
  | "wrong-arithmetic"
  | "wrong-allocation"
  | "missing-entry"
  | "template-defect";
