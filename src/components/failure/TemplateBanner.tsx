"use client";

// Outdated-template banner. Renders the amber variant from the prototype
// (§6.4). When the parser detects template-validity failures, we suppress
// the validation banner entirely and show only this — the file must be
// re-exported with the current template before anything else is actionable.

import { AlertTriangle, ArrowRight, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CORRECT_TEMPLATE_URL } from "@/lib/validation";
import type { TemplateValidity, ValidityIssue } from "@/lib/parser";

interface ParsedFormulaIssue {
  rule: string;
  fileRate: number | null;
  canonicalRate: number | null;
  detail: string;
}

/**
 * Parse a formula-issue message of the form
 *   "Parish Ops 55% of Tithe: file uses 60% instead of canonical 55%"
 * into structured pieces so we can render rate badges instead of raw text.
 * Falls through to {rule: full message} for unrecognized formats.
 */
function parseFormulaIssue(issue: ValidityIssue): ParsedFormulaIssue {
  const m = issue.message.match(/^(.+?):\s*file uses (\d+)%\s*instead of canonical (\d+)%$/i);
  if (!m) {
    return { rule: issue.message, fileRate: null, canonicalRate: null, detail: issue.detail };
  }
  return {
    rule: m[1]!.trim(),
    fileRate: Number(m[2]),
    canonicalRate: Number(m[3]),
    detail: issue.detail,
  };
}

export interface TemplateBannerProps {
  validity: TemplateValidity;
  onReset?: () => void;
}

export function TemplateBanner({ validity, onReset }: TemplateBannerProps) {
  const formulaCount = validity.formulaIssues.length;
  const structuralCount = validity.structuralIssues.length;
  const parts = [
    structuralCount
      ? `${structuralCount} structural issue${structuralCount === 1 ? "" : "s"}`
      : null,
    formulaCount ? `${formulaCount} formula error${formulaCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="border-warn/40 bg-warn-bg">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="bg-warn/15 text-warn grid size-10 shrink-0 place-items-center rounded-full">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-text text-lg font-semibold tracking-tight">
              This report uses an outdated template
            </h2>
            <p className="text-text-muted mt-1 text-sm">
              Detected {parts}. The file&rsquo;s built-in formulas don&rsquo;t match the current
              rules, so we can&rsquo;t trust the values it produces. Re-export with the current
              template and upload again.
            </p>
          </div>
        </div>

        {formulaCount > 0 ? (
          <div className="bg-panel border-border mt-5 rounded-[var(--radius-md)] border p-4">
            <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
              Formula errors detected
            </p>
            <ul className="mt-3 space-y-3">
              {validity.formulaIssues.map((raw, idx) => {
                const parsed = parseFormulaIssue(raw);
                return (
                  <li key={idx} className="flex flex-col gap-1">
                    <p className="text-text text-sm font-medium">{parsed.rule}</p>
                    {parsed.fileRate != null && parsed.canonicalRate != null ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-bad-bg text-bad rounded-[var(--radius-sm)] px-2 py-0.5 font-mono line-through">
                          {parsed.fileRate}%
                        </span>
                        <ArrowRight className="text-text-subtle size-3" aria-hidden />
                        <span className="bg-good-bg text-good rounded-[var(--radius-sm)] px-2 py-0.5 font-mono">
                          {parsed.canonicalRate}%
                        </span>
                      </div>
                    ) : null}
                    {parsed.detail ? (
                      <p className="text-text-subtle text-xs">{parsed.detail}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {structuralCount > 0 ? (
          <div className="bg-panel border-border mt-3 rounded-[var(--radius-md)] border p-4">
            <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
              Structural issues
            </p>
            <ul className="mt-3 space-y-2">
              {validity.structuralIssues.map((issue, idx) => (
                <li key={idx} className="flex flex-col gap-0.5">
                  <p className="text-text text-sm font-medium">{issue.message}</p>
                  {issue.detail ? <p className="text-text-subtle text-xs">{issue.detail}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={CORRECT_TEMPLATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-warn text-warn-fg inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            <Download className="size-4" aria-hidden />
            Get the correct template
          </a>
          {onReset ? (
            <Button variant="outline" size="md" onClick={onReset}>
              <RotateCcw className="size-4" aria-hidden />
              Try another file
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
