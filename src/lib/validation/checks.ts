// Validation layer — builds the canonical list of checks and grades them.
//
// Ported from _prototype/index.html §3 (buildChecks + gradeChecks).
// The check order is intentional — it determines display order in the
// validation banner. Don't reorder without checking the UI.

import type { Report } from "@/lib/parser";

export interface Check {
  section: string;
  label: string;
  /** What the parser computed (re-summed/derived). */
  calc: number;
  /** What the file reported. `null` means missing-entry. */
  actual: number | null;
  /** Optional per-check tolerance override. Defaults to 0.01. */
  tol?: number;
}

const AVG_TOL = 0.05;

/**
 * Assemble every comparison the validation banner needs. Order matters —
 * it's the visible order in the UI.
 */
export function buildChecks(r: Report): Check[] {
  const mk = (
    section: string,
    label: string,
    calc: number,
    actual: number | null,
    tol?: number,
  ): Check => ({ section, label, calc, actual, tol });

  const checks: Check[] = [
    // Row 2 — monthly totals re-summed from per-date.
    mk(
      "Parish Records",
      "Total Offering (re-summed from per-date)",
      r.monthlyValidation.offering.recomputed,
      r.monthlyValidation.offering.reported,
    ),
    mk(
      "Parish Records",
      "Total Tithe (re-summed from per-date)",
      r.monthlyValidation.tithe.recomputed,
      r.monthlyValidation.tithe.reported,
    ),
    mk(
      "Parish Records",
      "Total Thanksgiving (re-summed from per-date)",
      r.monthlyValidation.thanksgiving.recomputed,
      r.monthlyValidation.thanksgiving.reported,
    ),
    mk(
      "Parish Records",
      "Total Others (re-summed from per-date)",
      r.monthlyValidation.others.recomputed,
      r.monthlyValidation.others.reported,
    ),
    mk(
      "Parish Records",
      "Sum (re-summed from per-date)",
      r.monthlyValidation.sum.recomputed,
      r.monthlyValidation.sum.reported,
    ),
  ];

  if (r.monthlyValidation.averageAttendance.reported != null) {
    checks.push(
      mk(
        "Parish Records",
        "Average Attendance (re-derived from per-date)",
        r.monthlyValidation.averageAttendance.recomputed,
        r.monthlyValidation.averageAttendance.reported,
        AVG_TOL,
      ),
    );
  }
  for (const k of ["averageMen", "averageWomen", "averageChildren"] as const) {
    const v = r.monthlyValidation[k];
    if (v.reported != null) {
      checks.push(
        mk(
          "Parish Records",
          `${k.replace("average", "Average ")} (re-derived from per-date)`,
          v.recomputed,
          v.reported,
          AVG_TOL,
        ),
      );
    }
  }

  for (const wt of r.weeklyTotals) {
    if (wt.enteredTotal != null) {
      checks.push(
        mk("Weekly Totals", `WEEK ${wt.weekIndex} € Total`, wt.recomputedTotal, wt.enteredTotal),
      );
    }
  }

  checks.push(
    mk(
      "Allocation Reconciliation",
      "Sum of all entered remittances = Total income (excl. Others)",
      r.allocationReconciliation.expectedAllocations,
      r.allocationReconciliation.enteredAllocations,
    ),
  );

  for (const s of r.statistics.validation) {
    if (s.reported != null) {
      checks.push(
        mk("Statistics", `${s.label} (per-date sum vs Total row)`, s.recomputed, s.reported),
      );
    }
  }

  for (const d of r.perDate) {
    const tag = `${d.date || `(no date, row ${d.row})`} ${d.day || ""}`.trim();
    if (d.attendance.totalReported != null && d.hasAttendance) {
      checks.push(
        mk(
          "Per-Date Attendance",
          `${tag} — Men+Women+Children = Total`,
          d.attendance.totalCalculated,
          d.attendance.totalReported,
        ),
      );
    }
    if (d.money.totalReported != null && d.hasMoney) {
      checks.push(
        mk(
          "Per-Date Money",
          `${tag} — Offering+Tithe+Tnx+Others = Total (€)`,
          d.money.totalCalculated,
          d.money.totalReported,
        ),
      );
    }
  }

  checks.push(
    mk(
      "Regional Remittance",
      "5% of Total Offering",
      r.regionalRemittance.calculated.offering5,
      r.regionalRemittance.actual.offering5,
    ),
    mk(
      "Regional Remittance",
      "20% of Total Tithe",
      r.regionalRemittance.calculated.tithe20,
      r.regionalRemittance.actual.tithe20,
    ),
    mk(
      "Regional Remittance",
      "Total Regional Remittance",
      r.regionalRemittance.calculated.total,
      r.regionalRemittance.actual.total,
    ),
    mk(
      "Parish Operations",
      "55% of Total Tithe",
      r.parishOperations.calculated.tithe55,
      r.parishOperations.actual.tithe55,
    ),
    mk(
      "Parish Operations",
      "95% of Total Offering",
      r.parishOperations.calculated.offering95,
      r.parishOperations.actual.offering95,
    ),
    mk(
      "Parish Operations",
      "30% of Total Thanksgiving",
      r.parishOperations.calculated.thanksgiving30,
      r.parishOperations.actual.thanksgiving30,
    ),
    mk(
      "Parish Operations",
      "Total Parish Operations",
      r.parishOperations.calculated.total,
      r.parishOperations.actual.total,
    ),
    mk(
      "Pastor Allowance",
      "20% of Total Tithe",
      r.parishPastorAllowance.calculated.tithe20,
      r.parishPastorAllowance.actual.tithe20,
    ),
    mk(
      "Pastor Allowance",
      "70% of Total Thanksgiving",
      r.parishPastorAllowance.calculated.thanksgiving70,
      r.parishPastorAllowance.actual.thanksgiving70,
    ),
    mk(
      "Pastor Allowance",
      "Total Pastor Allowance",
      r.parishPastorAllowance.calculated.total,
      r.parishPastorAllowance.actual.total,
    ),
    mk(
      "Provincial Remittance",
      "5% of Total Tithe",
      r.provincialRemittance.calculated.tithe5,
      r.provincialRemittance.actual.tithe5,
    ),
  );

  return checks;
}

export interface Grade {
  validated: Check[];
  notValidated: Check[];
  missing: Check[];
  total: number;
}

/**
 * Grade each check:
 *   - actual == null → missing
 *   - |calc - actual| < (tol ?? 0.01) → validated
 *   - otherwise → notValidated
 *
 * Single source of truth — banner and field cards agree because they both
 * read `c.tol`. The earlier bug where banner used hardcoded 0.01 (spec
 * §11.10) is impossible by construction now.
 */
export function gradeChecks(checks: Check[]): Grade {
  const validated: Check[] = [];
  const notValidated: Check[] = [];
  const missing: Check[] = [];
  for (const c of checks) {
    if (c.actual == null) {
      missing.push(c);
      continue;
    }
    const tol = c.tol ?? 0.01;
    if (Math.abs(c.calc - c.actual) < tol) validated.push(c);
    else notValidated.push(c);
  }
  return { validated, notValidated, missing, total: checks.length };
}
