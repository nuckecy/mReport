/**
 * Canonical validation rules. Mirrors `_prototype/EXTRACTED-SPEC.md` §1.2 / §1.3 / §1.4.
 *
 * These are the SOURCE OF TRUTH for the rebuild. Edit here, not in code.
 */

/** Income-allocation percentages. Coverage: Offering 100%, Tithe 100%, Thanksgiving 100%. */
export const CANONICAL_RULES = {
  regional: { offering: 0.05, tithe: 0.2 },
  parishOps: { tithe: 0.55, offering: 0.95, thanksgiving: 0.3 },
  pastorAllow: { tithe: 0.2, thanksgiving: 0.7 },
  provincial: { tithe: 0.05 },
} as const;

/** Per-section severity floor. Falls back to `_default` if a section isn't listed. */
export const FIELD_SEVERITY: Record<string, "fail" | "warn" | "info"> = {
  "Allocation Reconciliation": "fail",
  "Regional Remittance": "fail",
  "Parish Operations": "fail",
  "Pastor Allowance": "fail",
  "Provincial Remittance": "fail",
  "Weekly Totals": "fail",
  "Per-Date Money": "fail",
  "Parish Records": "fail",
  "Per-Date Attendance": "warn",
  Statistics: "warn",
  _default: "fail",
};

/** Per-label severity overrides — first match wins. */
export const LABEL_SEVERITY: ReadonlyArray<{
  pattern: RegExp;
  severity: "fail" | "warn" | "info";
}> = [{ pattern: /average/i, severity: "warn" }];

/** Tolerances per check kind. */
export const TOLERANCE = {
  money: 0.01,
  average: 0.05,
  templateRateAmount: 0.05,
  templateRateSnap: 0.005,
} as const;
