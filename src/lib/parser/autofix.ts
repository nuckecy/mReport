// In-session auto-fix patcher. Mutates a SheetJS workbook in memory so the
// caller can re-parse and re-render with the corrected value.
//
// Ported from _prototype/index.html §7.3 (applyPatchAndRevalidate).
//
// SCOPE LIMITATIONS (deliberate):
//   - Only Statistics-section "forgot-to-total" failures with a tracked
//     cell address are auto-fixable. Money is never auto-fixed —
//     `isAutoFixable` returns false for severity=fail (see validation
//     layer §3.6). Callers should gate the call by `failure.autoFixable`
//     before invoking this.
//   - The original .xlsx file on disk is never touched. Fixes live only
//     in the current browser session. Reload = back to original.

import type { WorkBook } from "xlsx";
import type { Failure } from "@/lib/validation";

export interface AppliedFix {
  appliedAt: Date;
  cellAddress: string;
  field: string;
  section: string;
  oldValue: number | null;
  newValue: number;
}

export interface PatchOutcome {
  ok: boolean;
  /** Populated on `ok === true`. */
  fix?: AppliedFix;
  /** Populated on `ok === false` with a user-facing reason. */
  reason?: string;
}

/**
 * Apply a failure's calculated value to the source cell in `wb`. Mutates
 * the workbook in place and returns the applied-fix record for the
 * caller to push into their session-fix log.
 *
 * Guards:
 *   - `failure.cellAddress` must be set (auto-fixable failures always
 *     have one, but we re-check defensively).
 *   - The first sheet must exist.
 *   - The calculated value must be a finite number.
 *
 * The cell write clears `.w` (cached display string) and `.f` (formula)
 * so SheetJS re-formats and we don't end up with a stale formula
 * expression pointing at the new value.
 */
export function applyPatch(wb: WorkBook, failure: Failure): PatchOutcome {
  if (!failure.cellAddress) {
    return { ok: false, reason: "No cell address tracked for this failure." };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { ok: false, reason: "Workbook is empty." };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return { ok: false, reason: `Sheet "${sheetName}" not found.` };
  }
  const newValue = Number(failure.check.calc);
  if (!Number.isFinite(newValue)) {
    return {
      ok: false,
      reason: `Calculated value is not a finite number: ${failure.check.calc}.`,
    };
  }

  const oldValue = failure.check.actual == null ? null : Number(failure.check.actual);

  const existing = sheet[failure.cellAddress] as Record<string, unknown> | undefined;
  sheet[failure.cellAddress] = {
    ...(existing ?? {}),
    t: "n",
    v: newValue,
    w: undefined,
    f: undefined,
  };

  return {
    ok: true,
    fix: {
      appliedAt: new Date(),
      cellAddress: failure.cellAddress,
      field: failure.check.label,
      section: failure.check.section,
      oldValue,
      newValue,
    },
  };
}
