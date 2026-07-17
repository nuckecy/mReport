"use client";

// Layout-C failure card. Mirrors `_prototype/index.html` §6.3 + §11.15-relevant
// content. One card per failed validation check; the parent component
// owns the array of failures and indexes them via `idx` for fix-button
// dispatch.
//
// Visual: cell-pill (clickable copy-to-clipboard) + field name + sub-type chip,
// then a headline, then a Currently/Should-be value pair with the
// per-date contributors as a "source" line, then an optional probable-cause
// line (forgot-to-total only), then either a "Fix this for me" CTA
// (auto-fixable) or italic review text (manual).

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatterForCheck, type Failure } from "@/lib/validation";
import { STAT_FIELDS, type Report } from "@/lib/parser";
import { formatLongDate } from "@/lib/format";

const SUB_TYPE_LABEL: Record<Failure["subType"], string> = {
  "forgot-to-total": "Totals row not updated",
  "wrong-arithmetic": "Totals don't match",
  "wrong-allocation": "Allocation rule not met",
  "missing-entry": "Missing weekly entries",
  "template-defect": "Outdated template",
};

const SEVERITY_CLASSES: Record<Failure["severity"], string> = {
  fail: "border-bad/40 bg-bad-bg",
  warn: "border-warn/40 bg-warn-bg",
  info: "border-info/40 bg-info-bg",
  ok: "border-border bg-panel-2",
};

const SEVERITY_TEXT: Record<Failure["severity"], string> = {
  fail: "text-bad",
  warn: "text-warn",
  info: "text-info",
  ok: "text-text-muted",
};

export interface FailureCardProps {
  failure: Failure;
  idx: number;
  report: Report;
  /** Invoked when the user clicks "Fix this for me". Disabled while running. */
  onFix?: (failure: Failure, idx: number) => void | Promise<void>;
  fixing?: boolean;
}

export function FailureCard({ failure, idx, report, onFix, fixing }: FailureCardProps) {
  const [copied, setCopied] = useState(false);
  const f = formatterForCheck(failure.check);
  const correctValue = f(failure.check.calc);
  const currentValue = f(failure.check.actual ?? 0);
  const fieldName = failure.check.label
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^Total\s+/, "")
    .trim();

  // Per-date contributors — only Statistics carries them.
  const contributors =
    failure.check.section === "Statistics" ? statisticsContributors(failure.check, report) : [];
  const sourceText = contributors.length
    ? contributors.map((c) => `${c.value} on ${c.date}`).join(" + ")
    : "weekly entries";

  const copyCell = async () => {
    if (!failure.cellAddress) return;
    try {
      await navigator.clipboard.writeText(failure.cellAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard not available — silently no-op
    }
  };

  return (
    <article
      data-failure-idx={idx}
      className={cn(
        "rounded-[var(--radius-lg)] border p-5 transition-colors",
        SEVERITY_CLASSES[failure.severity],
      )}
    >
      {/* Subject header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {failure.cellAddress ? (
            <button
              type="button"
              onClick={copyCell}
              title={`Click to copy ${failure.cellAddress}`}
              className="bg-panel-2 text-text hover:bg-panel relative inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 font-mono text-xs"
            >
              {failure.cellAddress}
              <span className={cn("transition-opacity", copied ? "opacity-100" : "opacity-0")}>
                {copied ? (
                  <Check className="size-3" aria-hidden />
                ) : (
                  <Copy className="size-3" aria-hidden />
                )}
              </span>
            </button>
          ) : null}
          <span className={cn("text-sm font-semibold", SEVERITY_TEXT[failure.severity])}>
            {fieldName} total
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium",
            failure.severity === "fail"
              ? "border-bad/40 text-bad"
              : failure.severity === "warn"
                ? "border-warn/40 text-warn"
                : "border-info/40 text-info",
          )}
        >
          {SUB_TYPE_LABEL[failure.subType]}
        </span>
      </div>

      {/* Headline */}
      <p className="text-text mb-3 text-sm font-medium">{failure.title}.</p>

      {/* Currently / Should-be */}
      <dl className="mb-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-subtle text-xs font-medium">Currently</dt>
        <dd className="text-text font-mono">{currentValue}</dd>
        <dt className="text-text-subtle text-xs font-medium">Should be</dt>
        <dd className="flex flex-wrap items-baseline gap-2">
          <span className="text-text font-mono font-semibold">{correctValue}</span>
          <span className="text-text-muted text-xs">{sourceText}</span>
        </dd>
      </dl>

      {/* Probable cause — forgot-to-total only */}
      {failure.subType === "forgot-to-total" ? (
        <p className="text-text-muted mb-3 text-xs italic">
          Probable cause: the totals row wasn&rsquo;t refreshed after weekly entries were added.
        </p>
      ) : null}

      {/* Fix CTA */}
      {failure.autoFixable ? (
        <button
          type="button"
          disabled={fixing}
          onClick={() => onFix?.(failure, idx)}
          className="bg-good text-good-fg inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="size-4" aria-hidden />
          {fixing ? "Applying…" : `Fix this for me — Set ${failure.cellAddress} to ${correctValue}`}
        </button>
      ) : (
        <p className="text-text-muted text-xs italic">{failure.fixText}</p>
      )}
    </article>
  );
}

// Tiny duplicate of the helper in `lib/validation/failures.ts` — kept here so
// the client bundle doesn't have to import the unused enrichment functions.
function statisticsContributors(
  check: Failure["check"],
  report: Report,
): Array<{ date: string; value: number }> {
  const labelLower = check.label.toLowerCase();
  const statField = STAT_FIELDS.find((f) => labelLower.startsWith(f.label.toLowerCase()));
  if (!statField) return [];
  return report.statistics.perDate
    .filter((d) => (d.stats[statField.key] || 0) > 0)
    .map((d) => ({
      date: formatLongDate(d.date) ?? `row ${d.row}`,
      value: d.stats[statField.key],
    }));
}
