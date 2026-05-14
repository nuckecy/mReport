"use client";

// Compact summary — shown when the report is 100% clean (no failures, no
// missing entries). Three checklist rows (Monetary / Remittance / Statistics)
// plus a primary "Submit your report" CTA and a "Show full report" toggle.
//
// Mirrors `_prototype/index.html` §6.5 visually + content, but uses our
// token-driven Card/Button primitives instead of the inline-styled prototype
// markup.

import { CheckCircle2, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { categorizeChecks, type Grade } from "@/lib/validation";
import type { Report } from "@/lib/parser";

export interface CompactSummaryProps {
  report: Report;
  grade: Grade;
  onShowFull?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
}

export function CompactSummary({
  report,
  grade,
  onShowFull,
  onSubmit,
  submitting,
}: CompactSummaryProps) {
  const buckets = categorizeChecks(grade.validated);
  const monetaryCount = buckets.monetary.length;
  const remittanceCount = buckets.remittance.length;
  const statisticsCount = buckets.statistics.length;

  const pastor = report.source.pastor ?? "Unknown pastor";
  const parish = report.source.parish ?? "Unknown parish";

  return (
    <Card className="border-good/40 bg-good-bg">
      <CardContent className="flex flex-col gap-5 p-6">
        <header className="flex items-start gap-4">
          <div className="bg-good/15 text-good grid size-10 shrink-0 place-items-center rounded-full">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-text text-lg font-semibold tracking-tight">
              Everything checks out for {report.source.reportMonth}
            </h2>
            <p className="text-text-muted mt-1 text-sm">
              {pastor} at {parish} · all {grade.total} validation checks passed
            </p>
          </div>
        </header>

        <ul className="bg-panel border-border space-y-2 rounded-[var(--radius-md)] border p-4">
          <ChecklistRow
            label="Monetary"
            detail="Offering · Tithe · Thanksgiving · Others"
            count={monetaryCount}
          />
          <ChecklistRow
            label="Remittance"
            detail="Regional · Parish Ops · Pastor · Provincial"
            count={remittanceCount}
          />
          <ChecklistRow
            label="Statistics"
            detail="Attendance · Births · Marriages · Workers · etc."
            count={statisticsCount}
          />
        </ul>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onSubmit}
            disabled={submitting}
            className="bg-good text-good-fg hover:opacity-90"
          >
            <Send className="size-4" aria-hidden />
            {submitting ? "Submitting…" : "Submit your report"}
          </Button>
          {onShowFull ? (
            <Button variant="outline" size="lg" onClick={onShowFull}>
              <FileText className="size-4" aria-hidden />
              Show full report
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ label, detail, count }: { label: string; detail: string; count: number }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="text-good size-4" aria-hidden />
        <span className="text-text font-medium">{label}</span>
        <span className="text-text-muted text-xs">{detail}</span>
      </span>
      <span className="text-text-subtle font-mono text-xs">{count} ✓</span>
    </li>
  );
}
