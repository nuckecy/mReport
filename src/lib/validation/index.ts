// Public surface for the validation layer. Importers should pull from
// `@/lib/validation`, not the individual submodules.

export { buildChecks, gradeChecks } from "./checks";
export type { Check, Grade } from "./checks";

export {
  buildFailure,
  classifyFailure,
  cellAddressForCheck,
  explainFailure,
  formatterForCheck,
  isAutoFixable,
  severityForCheck,
} from "./failures";
export type { Failure } from "./failures";

export {
  CANONICAL_RULES,
  CORRECT_TEMPLATE_URL,
  FIELD_SEVERITY,
  LABEL_SEVERITY,
  TOLERANCE,
} from "./rules";

import type { Check } from "./checks";

/**
 * Group every check into a user-facing category. Used by the compact summary
 * so the user sees "12 monetary checks · 8 remittance · 12 statistics"
 * instead of one raw "45 checks" count.
 *
 * Ported from prototype §6.6.
 */
export interface CategorizedChecks {
  monetary: Check[];
  remittance: Check[];
  statistics: Check[];
  other: Check[];
}

export function categorizeChecks(checks: Check[]): CategorizedChecks {
  const buckets: CategorizedChecks = {
    monetary: [],
    remittance: [],
    statistics: [],
    other: [],
  };
  for (const c of checks) {
    const tag = `${c.section} ${c.label}`.toLowerCase();
    if (
      /regional remittance|parish operations|pastor allowance|provincial remittance|allocation reconciliation/i.test(
        c.section,
      )
    ) {
      buckets.remittance.push(c);
    } else if (c.section === "Statistics") {
      buckets.statistics.push(c);
    } else if (
      /money|offering|tithe|thanksgiving|others|sum|weekly totals|per-date money|parish records/i.test(
        tag,
      )
    ) {
      buckets.monetary.push(c);
    } else {
      buckets.other.push(c);
    }
  }
  return buckets;
}
