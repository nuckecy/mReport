// Template-validity check: structural labels + formula rates.
//
// Ported from _prototype/index.html §2.10. The formula check is the trickiest
// part of the pipeline — when a file's built-in formula uses a different
// canonical rate (e.g., 60% instead of 55%) every downstream remittance
// failure is really a template defect, not a preparer error. This routine
// is what distinguishes those.

import type { WorkSheet } from "xlsx";
import { findCell } from "./cells";
import { CANONICAL_RULES, TOLERANCE } from "@/lib/validation/rules";
import type { ActualRemittance } from "./extract";

export type IssueKind = "structural" | "formula";

export interface ValidityIssue {
  kind: IssueKind;
  message: string;
  detail: string;
}

export interface TemplateValidity {
  valid: boolean;
  structuralIssues: ValidityIssue[];
  formulaIssues: ValidityIssue[];
  /** Combined list (structural + formula) for callers that iterate all. */
  issues: ValidityIssue[];
}

export interface MoneyTotalsForValidity {
  offering: number;
  tithe: number;
  thanksgiving: number;
  others: number;
}

/**
 * Two-phase check:
 *   1. Structural — required Row 1 labels + required section headers.
 *   2. Formula — for each remittance, compare entered against
 *      `source × canonical_rate`. If the implied rate snaps to a round
 *      percentage other than the canonical one, the template is using a
 *      wrong-but-consistent rate.
 *
 * Returns valid=true iff zero issues.
 */
export function detectTemplateValidity(
  sheet: WorkSheet,
  totals: MoneyTotalsForValidity,
  actualRemittance: ActualRemittance,
): TemplateValidity {
  const issues: ValidityIssue[] = [];

  // ── Phase 1 — Structural ────────────────────────────────────────
  const requiredLabels: Array<{ name: string; patterns: RegExp[] }> = [
    { name: "Name Of Parish", patterns: [/name\s*of\s*parish/i] },
    { name: "Pastor In Charge", patterns: [/pastor\s*in\s*charge/i] },
    { name: "Month/Year", patterns: [/month\s*\/?\s*year/i] },
  ];
  for (const req of requiredLabels) {
    const found = req.patterns.some((p) => findCell(sheet, p));
    if (!found) {
      issues.push({
        kind: "structural",
        message: `Missing label: "${req.name}"`,
        detail: "The current template includes this label in the header row.",
      });
    }
  }

  const sectionLabels: Array<{ name: string; patterns: RegExp[] }> = [
    { name: "Regional Remittance", patterns: [/regional\s*remittance/i] },
    {
      name: "Parish Operations",
      patterns: [/twds\.?\s*parish\s*operations|parish\s*operations/i],
    },
    { name: "Provincial Remittance", patterns: [/provincial\s*remittance/i] },
  ];
  for (const sec of sectionLabels) {
    const found = sec.patterns.some((p) => findCell(sheet, p));
    if (!found) {
      issues.push({
        kind: "structural",
        message: `Missing section: "${sec.name}"`,
        detail: "The current template includes this remittance section.",
      });
    }
  }

  // ── Phase 2 — Formula ───────────────────────────────────────────
  if (totals.tithe != null && totals.offering != null) {
    const tol = TOLERANCE.templateRateAmount;
    type FormulaCheck = {
      label: string;
      entered: number | null;
      expected: number;
      divisor: number;
    };
    const checks: FormulaCheck[] = [
      {
        label: "Regional 5% of Offering",
        entered: actualRemittance.regional.offering5,
        expected: totals.offering * CANONICAL_RULES.regional.offering,
        divisor: totals.offering,
      },
      {
        label: "Regional 20% of Tithe",
        entered: actualRemittance.regional.tithe20,
        expected: totals.tithe * CANONICAL_RULES.regional.tithe,
        divisor: totals.tithe,
      },
      {
        label: "Parish Ops 55% of Tithe",
        entered: actualRemittance.operations.tithe55,
        expected: totals.tithe * CANONICAL_RULES.parishOps.tithe,
        divisor: totals.tithe,
      },
      {
        label: "Parish Ops 95% of Offering",
        entered: actualRemittance.operations.offering95,
        expected: totals.offering * CANONICAL_RULES.parishOps.offering,
        divisor: totals.offering,
      },
      {
        label: "Parish Ops 30% of T/Giving",
        entered: actualRemittance.operations.thanksgiving30,
        expected: (totals.thanksgiving || 0) * CANONICAL_RULES.parishOps.thanksgiving,
        divisor: totals.thanksgiving,
      },
      {
        label: "Pastor Allow 20% of Tithe",
        entered: actualRemittance.pastorAllow.tithe20,
        expected: totals.tithe * CANONICAL_RULES.pastorAllow.tithe,
        divisor: totals.tithe,
      },
      {
        label: "Pastor Allow 70% of T/Giving",
        entered: actualRemittance.pastorAllow.thanksgiving70,
        expected: (totals.thanksgiving || 0) * CANONICAL_RULES.pastorAllow.thanksgiving,
        divisor: totals.thanksgiving,
      },
      {
        label: "Provincial 5% of Tithe",
        entered: actualRemittance.provincial.tithe5,
        expected: totals.tithe * CANONICAL_RULES.provincial.tithe,
        divisor: totals.tithe,
      },
    ];

    for (const c of checks) {
      if (c.entered == null) continue;
      if (Math.abs(c.entered - c.expected) < tol) continue;
      if (!c.divisor) continue;
      const impliedRate = c.entered / c.divisor;
      const nearestRoundPct = Math.round(impliedRate * 100) / 100;
      const isRoundRate = Math.abs(impliedRate - nearestRoundPct) < TOLERANCE.templateRateSnap;
      if (isRoundRate) {
        const canonicalPct = (c.expected / c.divisor) * 100;
        issues.push({
          kind: "formula",
          message: `${c.label}: file uses ${(nearestRoundPct * 100).toFixed(0)}% instead of canonical ${canonicalPct.toFixed(0)}%`,
          detail: `Entered ${c.entered.toFixed(2)} ÷ source ${c.divisor.toFixed(2)} ≈ ${(nearestRoundPct * 100).toFixed(0)}%. The current template uses ${canonicalPct.toFixed(0)}%.`,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    structuralIssues: issues.filter((i) => i.kind === "structural"),
    formulaIssues: issues.filter((i) => i.kind === "formula"),
    issues,
  };
}
