// Parser layer entry point. Re-exports the public surface so callers can
// import everything from `@/lib/parser` without reaching into submodules.

export { parseWorkbook } from "./parseWorkbook";
export type {
  Report,
  SanityCheck,
  MonthlyValidation,
  MonthlyValidationEntry,
  WeeklyTotal,
  AllocationReconciliation,
  StatisticsValidation,
} from "./parseWorkbook";

export { STAT_FIELDS, STAT_LABEL_PATTERNS } from "./extract";
export type { PerDateRow, PerDateStatRow, StatKey, StatField } from "./extract";

export type { TemplateValidity, ValidityIssue, IssueKind } from "./template-validity";

export { excelDateToJS, parseStringDate, ymd, detectMonthYear } from "./dates";
export { NUM, round2 } from "./num";

export { applyPatch } from "./autofix";
export type { AppliedFix, PatchOutcome } from "./autofix";
