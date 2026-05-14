"use client";

// Client-side drop zone + parser harness.
//
// What happens here:
//   1. User drops or picks an .xlsx file.
//   2. We sniff the first 4 bytes to confirm the PK\x03\x04 ZIP signature
//      (every .xlsx is a ZIP container). Defense against renamed files.
//   3. SheetJS reads the workbook in-browser.
//   4. parseWorkbook() builds the Report; buildChecks() + gradeChecks()
//      summarize pass/fail/missing.
//   5. We render a compact summary card with the headline numbers.
//      Rich failure cards (Layout C from the prototype) arrive in Day 5.
//
// Auto-fix and submit-to-server are deferred to Day 5 too.

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseWorkbook, type Report } from "@/lib/parser";
import { buildChecks, gradeChecks, type Grade } from "@/lib/validation";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; filename: string }
  | { kind: "error"; message: string; filename?: string }
  | { kind: "parsed"; filename: string; report: Report; grade: Grade; mismatch: string | null };

type UploadDropzoneProps = {
  authorizedParish: string | null;
  userRole: string;
  tenantSlug: string;
};

const XLSX_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  // some browsers serve .xlsx as octet-stream — the magic-byte check covers us
  "application/octet-stream",
  "",
];

export function UploadDropzone({ authorizedParish, userRole }: UploadDropzoneProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setState({ kind: "parsing", filename: file.name });

      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setState({
          kind: "error",
          filename: file.name,
          message: "That file isn't an .xlsx. Export the parish report as Excel and try again.",
        });
        return;
      }

      // Magic-byte sniff — every .xlsx is a ZIP container starting with PK\x03\x04.
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
        setState({
          kind: "error",
          filename: file.name,
          message:
            "The file doesn't look like a real .xlsx. It may be corrupted or renamed from a different format.",
        });
        return;
      }

      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const report = parseWorkbook(wb);
        const grade = gradeChecks(buildChecks(report));

        // Parish-mismatch check — only enforced for scoped roles. Compare the
        // parsed parish name (case-insensitive trim) against the user's scope.
        let mismatch: string | null = null;
        if (
          authorizedParish &&
          report.source.parish &&
          userRole !== "super_admin" &&
          userRole !== "platform_admin" &&
          userRole !== "regional_admin" &&
          report.source.parish.trim().toLowerCase() !== authorizedParish.trim().toLowerCase()
        ) {
          mismatch = `This file is for ${report.source.parish}, but your account is scoped to ${authorizedParish}.`;
        }

        setState({ kind: "parsed", filename: file.name, report, grade, mismatch });
      } catch (err) {
        setState({
          kind: "error",
          filename: file.name,
          message: err instanceof Error ? err.message : "Couldn't read the file.",
        });
      }
    },
    [authorizedParish, userRole],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
      // Clear so re-selecting the same file fires `change` again (prototype §7.2).
      e.target.value = "";
    },
    [processFile],
  );

  if (state.kind === "parsed") {
    return (
      <ParsedSummary
        filename={state.filename}
        report={state.report}
        grade={state.grade}
        mismatch={state.mismatch}
        onReset={reset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="file-input"
        onDragEnter={() => setDragActive(true)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`border-border bg-panel hover:border-border-strong focus-within:border-accent flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragActive ? "border-accent bg-panel-2" : ""
        }`}
      >
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept={[".xlsx", ...XLSX_MIMES].filter(Boolean).join(",")}
          className="sr-only"
          onChange={onChange}
          disabled={state.kind === "parsing"}
        />
        <div className="bg-panel-2 grid size-12 place-items-center rounded-full">
          <Upload className="text-text-muted size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-text text-sm font-medium">
            {state.kind === "parsing" ? "Parsing…" : "Drop a parish .xlsx here"}
          </p>
          <p className="text-text-muted text-xs">or click to choose a file</p>
        </div>
      </label>

      {state.kind === "error" ? (
        <div
          role="alert"
          className="bg-bad-bg text-bad flex items-start gap-3 rounded-[var(--radius-md)] p-3 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            {state.filename ? (
              <p className="font-medium">
                Couldn&rsquo;t parse <span className="font-mono">{state.filename}</span>
              </p>
            ) : null}
            <p>{state.message}</p>
            <button
              type="button"
              className="text-text-muted hover:text-text mt-1 self-start text-xs underline-offset-4 hover:underline"
              onClick={reset}
            >
              Try another file
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────

function ParsedSummary({
  filename,
  report,
  grade,
  mismatch,
  onReset,
}: {
  filename: string;
  report: Report;
  grade: Grade;
  mismatch: string | null;
  onReset: () => void;
}) {
  const templateInvalid = !report.templateValidity.valid;
  const hasFailures = grade.notValidated.length > 0;
  const hasMissing = grade.missing.length > 0;
  const allClean = !templateInvalid && !hasFailures && !hasMissing;

  const headlineIcon = allClean ? (
    <CheckCircle2 className="text-good size-6" aria-hidden="true" />
  ) : templateInvalid ? (
    <AlertTriangle className="text-warn size-6" aria-hidden="true" />
  ) : (
    <CircleAlert className="text-bad size-6" aria-hidden="true" />
  );

  const headlineText = allClean
    ? `Everything checks out for ${report.source.reportMonth}`
    : templateInvalid
      ? "This report uses an outdated template"
      : `${grade.notValidated.length} of ${grade.total} checks failed validation`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <div className="bg-panel-2 grid size-10 place-items-center rounded-[var(--radius-md)]">
            {headlineIcon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-text-subtle flex items-center gap-2 text-xs">
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              <span className="truncate font-mono">{filename}</span>
            </div>
            <h2 className="text-text mt-1 text-xl font-semibold tracking-tight">{headlineText}</h2>
            <p className="text-text-muted mt-1 text-sm">
              {report.source.parish ?? "Unknown parish"} ·{" "}
              {report.source.pastor ?? "Unknown pastor"} · {report.source.reportMonth}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className="sr-only">Upload another file</span>
          </Button>
        </CardContent>
      </Card>

      {mismatch ? (
        <Card>
          <CardContent className="p-5">
            <div className="text-warn flex items-start gap-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">Parish mismatch</p>
                <p className="text-text-muted">{mismatch}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {templateInvalid ? (
        <Card>
          <CardContent className="p-5">
            <p className="text-text mb-2 text-sm font-medium">Template issues</p>
            <ul className="text-text-muted ml-4 list-disc space-y-1 text-sm">
              {report.templateValidity.issues.map((issue, idx) => (
                <li key={idx}>{issue.message}</li>
              ))}
            </ul>
            <p className="text-text-subtle mt-3 text-xs">
              The file&rsquo;s built-in formulas don&rsquo;t match the canonical rules. Re-export
              with the current template and upload again.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-5">
          <p className="text-text mb-3 text-sm font-medium">Validation summary</p>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Passed" count={grade.validated.length} tone="good" />
            <Stat label="Failed" count={grade.notValidated.length} tone="bad" />
            <Stat label="Missing" count={grade.missing.length} tone="muted" />
          </div>
          {hasFailures ? (
            <details className="mt-4 text-sm">
              <summary className="text-text-muted hover:text-text cursor-pointer">
                Show failed checks
              </summary>
              <ul className="text-text-muted mt-2 ml-4 list-disc space-y-1">
                {grade.notValidated.map((c, idx) => (
                  <li key={idx}>
                    <span className="text-text-subtle">{c.section}</span> — {c.label}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-text-subtle text-xs">
        Submit + auto-fix arrive in the next iteration. For now, this is a parse-only preview.
      </p>
    </div>
  );
}

function Stat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "good" | "bad" | "muted";
}) {
  const toneClass =
    tone === "good"
      ? "bg-good-bg text-good"
      : tone === "bad"
        ? "bg-bad-bg text-bad"
        : "bg-panel-2 text-text-muted";
  return (
    <div className={`flex flex-col items-start gap-1 rounded-[var(--radius-md)] p-3 ${toneClass}`}>
      <span className="text-2xl font-semibold">{count}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
