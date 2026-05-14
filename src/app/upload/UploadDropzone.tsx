"use client";

// Client-side drop zone + preparer dashboard.
//
// FLOW
//   1. User drops or picks an .xlsx file.
//   2. We sniff the first 4 bytes to confirm the PK\x03\x04 ZIP signature
//      (every .xlsx is a ZIP container). Defense against renamed files.
//   3. SheetJS reads the workbook in-browser. We stash both the parsed
//      `workbook` (for in-session auto-fixes) and the raw bytes (for the
//      eventual submit).
//   4. parseWorkbook() builds the Report; buildChecks() + gradeChecks()
//      summarize pass/fail/missing. We branch:
//        - template invalid       → TemplateBanner only
//        - all clean              → CompactSummary
//        - has failures / missing → full failure list + summary card
//   5. Auto-fix buttons mutate the workbook in memory and re-parse.
//   6. Submit packages the (possibly patched) workbook bytes + parsed
//      Report and calls submitReportAction. The server enforces
//      parish-mismatch + duplicate-month detection separately.

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Send,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { applyPatch, parseWorkbook, type AppliedFix, type Report } from "@/lib/parser";
import { buildChecks, buildFailure, gradeChecks, type Failure, type Grade } from "@/lib/validation";
import { downloadReportJSON } from "@/lib/exports/json";
import { downloadReportXLSX } from "@/lib/exports/xlsx";
import { submitReportAction } from "@/lib/submit";
import type { SubmitReportResult } from "@/lib/submit";
import { FailureCard } from "@/components/failure/FailureCard";
import { TemplateBanner } from "@/components/failure/TemplateBanner";
import { CompactSummary } from "@/components/failure/CompactSummary";
import { ParsedDetails } from "./ParsedDetails";

// ── State machine ────────────────────────────────────────────────────

type IdleState = { kind: "idle" };
type ParsingState = { kind: "parsing"; filename: string };
type ErrorState = { kind: "error"; message: string; filename?: string };
type ParsedState = {
  kind: "parsed";
  filename: string;
  workbook: XLSX.WorkBook;
  /** Always the bytes of the file as currently held — auto-fixes re-serialize. */
  bytes: Uint8Array;
  report: Report;
  grade: Grade;
  failures: Failure[];
  mismatch: string | null;
  sessionFixes: AppliedFix[];
  showFullReport: boolean;
  submission: SubmissionState;
};

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "needs_note"; existingMonth: string }
  | { kind: "success"; reportId: string }
  | { kind: "error"; message: string };

type State = IdleState | ParsingState | ErrorState | ParsedState;

// ── Component ────────────────────────────────────────────────────────

type UploadDropzoneProps = {
  authorizedParish: string | null;
  userRole: string;
  tenantSlug: string;
};

const XLSX_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
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

      // Magic-byte sniff — every .xlsx starts PK\x03\x04 (ZIP signature).
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
        const bytes = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(bytes, { type: "array", cellDates: true });
        const report = parseWorkbook(wb);
        const checks = buildChecks(report);
        const grade = gradeChecks(checks);
        const failures = grade.notValidated.map((c) => buildFailure(c, report));
        const mismatch = computeMismatch(report, authorizedParish, userRole);

        setState({
          kind: "parsed",
          filename: file.name,
          workbook: wb,
          bytes,
          report,
          grade,
          failures,
          mismatch,
          sessionFixes: [],
          showFullReport: false,
          submission: { kind: "idle" },
        });
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
      e.target.value = "";
    },
    [processFile],
  );

  // ── Auto-fix ───────────────────────────────────────────────────────

  const handleFix = useCallback(
    (failure: Failure) => {
      setState((current) => {
        if (current.kind !== "parsed") return current;
        const outcome = applyPatch(current.workbook, failure);
        if (!outcome.ok || !outcome.fix) {
          // Surface the error inline by stashing it as a transient submission
          // error — reusing the submission slot keeps state shape simple.
          return {
            ...current,
            submission: { kind: "error", message: outcome.reason ?? "Could not apply fix." },
          };
        }
        // Re-parse the patched workbook so every downstream check reflects
        // the new value. Re-serialize the bytes so the eventual submit
        // ships the corrected file.
        const report = parseWorkbook(current.workbook);
        const checks = buildChecks(report);
        const grade = gradeChecks(checks);
        const failures = grade.notValidated.map((c) => buildFailure(c, report));
        const newBytes = new Uint8Array(
          XLSX.write(current.workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
        );
        const mismatch = computeMismatch(report, authorizedParish, userRole);
        return {
          ...current,
          bytes: newBytes,
          report,
          grade,
          failures,
          mismatch,
          sessionFixes: [...current.sessionFixes, outcome.fix],
          submission: { kind: "idle" },
        };
      });
    },
    [authorizedParish, userRole],
  );

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (amendmentNote?: string) => {
      if (state.kind !== "parsed") return;
      setState({ ...state, submission: { kind: "submitting" } });
      try {
        const fileBase64 = bytesToBase64(state.bytes);
        const result: SubmitReportResult = await submitReportAction({
          report: state.report,
          fileBase64,
          filename: state.filename,
          amendmentNote,
        });
        setState((current) => {
          if (current.kind !== "parsed") return current;
          if (result.status === "success") {
            return { ...current, submission: { kind: "success", reportId: result.reportId } };
          }
          if (result.status === "needs_amendment_note") {
            return {
              ...current,
              submission: { kind: "needs_note", existingMonth: result.existingMonth },
            };
          }
          return { ...current, submission: { kind: "error", message: result.message } };
        });
      } catch (err) {
        setState((current) => {
          if (current.kind !== "parsed") return current;
          return {
            ...current,
            submission: {
              kind: "error",
              message: err instanceof Error ? err.message : "Submit failed.",
            },
          };
        });
      }
    },
    [state],
  );

  // ── Render ─────────────────────────────────────────────────────────

  if (state.kind === "parsed") {
    return (
      <ParsedView
        state={state}
        onReset={reset}
        onFix={handleFix}
        onSubmit={handleSubmit}
        onShowFull={() => setState({ ...state, showFullReport: true })}
        onDownloadJSON={() => downloadReportJSON(state.report)}
        onDownloadXLSX={() => downloadReportXLSX(state.report)}
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
          {state.kind === "parsing" ? (
            <Loader2 className="text-text-muted size-5 animate-pulse" aria-hidden />
          ) : (
            <Upload className="text-text-muted size-5" aria-hidden />
          )}
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
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
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

// ── Parsed view ──────────────────────────────────────────────────────

function ParsedView({
  state,
  onReset,
  onFix,
  onSubmit,
  onShowFull,
  onDownloadJSON,
  onDownloadXLSX,
}: {
  state: Extract<State, { kind: "parsed" }>;
  onReset: () => void;
  onFix: (failure: Failure) => void;
  onSubmit: (note?: string) => Promise<void>;
  onShowFull: () => void;
  onDownloadJSON: () => void;
  onDownloadXLSX: () => void;
}) {
  const { report, grade, failures, mismatch, sessionFixes, submission } = state;
  const templateInvalid = !report.templateValidity.valid;
  const allClean = grade.notValidated.length === 0 && grade.missing.length === 0;

  // Outdated-template fast path — show ONLY the banner.
  if (templateInvalid) {
    return (
      <div className="flex flex-col gap-4">
        <FileHeader filename={state.filename} report={report} onReset={onReset} />
        <TemplateBanner validity={report.templateValidity} onReset={onReset} />
      </div>
    );
  }

  // All-clean fast path — compact summary with submit CTA.
  if (allClean && !state.showFullReport) {
    return (
      <div className="flex flex-col gap-4">
        <FileHeader filename={state.filename} report={report} onReset={onReset} />
        <FixesLog fixes={sessionFixes} />
        {mismatch ? <MismatchPanel message={mismatch} /> : null}
        <CompactSummary
          report={report}
          grade={grade}
          onShowFull={onShowFull}
          onSubmit={() => void onSubmit()}
          submitting={submission.kind === "submitting"}
        />
        <SubmissionFeedback submission={submission} onAmend={(note) => void onSubmit(note)} />
        <Downloads onDownloadJSON={onDownloadJSON} onDownloadXLSX={onDownloadXLSX} />
        <ParsedDetails report={report} />
      </div>
    );
  }

  // Full failure list.
  return (
    <div className="flex flex-col gap-4">
      <FileHeader filename={state.filename} report={report} onReset={onReset} />
      <FixesLog fixes={sessionFixes} />
      {mismatch ? <MismatchPanel message={mismatch} /> : null}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-text text-sm font-medium">Validation summary</p>
              <p className="text-text-muted mt-1 text-xs">
                {grade.notValidated.length} of {grade.total} checks failed
                {grade.missing.length ? ` · ${grade.missing.length} missing` : ""}
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => void onSubmit()}
              disabled={submission.kind === "submitting"}
            >
              <Send className="size-4" aria-hidden />
              {submission.kind === "submitting" ? "Submitting…" : "Submit anyway"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SubmissionFeedback submission={submission} onAmend={(note) => void onSubmit(note)} />

      {failures.length > 0 ? (
        <div className="flex flex-col gap-3">
          {failures.map((failure, idx) => (
            <FailureCard
              key={`${failure.check.section}-${failure.check.label}-${idx}`}
              failure={failure}
              idx={idx}
              report={report}
              onFix={onFix}
            />
          ))}
        </div>
      ) : null}

      {grade.missing.length > 0 ? (
        <Card>
          <CardContent className="p-5">
            <p className="text-text mb-2 text-sm font-medium">Missing entries</p>
            <ul className="text-text-muted ml-4 list-disc space-y-1 text-sm">
              {grade.missing.map((c, idx) => (
                <li key={idx}>
                  <span className="text-text-subtle">{c.section}</span> — {c.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Downloads onDownloadJSON={onDownloadJSON} onDownloadXLSX={onDownloadXLSX} />
      <ParsedDetails report={report} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function FileHeader({
  filename,
  report,
  onReset,
}: {
  filename: string;
  report: Report;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className="bg-panel-2 grid size-10 place-items-center rounded-[var(--radius-md)]">
          <FileSpreadsheet className="text-text-muted size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-text-subtle truncate font-mono text-xs">{filename}</p>
          <p className="text-text mt-0.5 text-sm font-medium">
            {report.source.parish ?? "Unknown parish"} · {report.source.reportMonth}
          </p>
          <p className="text-text-muted mt-0.5 text-xs">
            {report.source.pastor ?? "Unknown pastor"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden />
          Upload another
        </Button>
      </CardContent>
    </Card>
  );
}

function FixesLog({ fixes }: { fixes: AppliedFix[] }) {
  if (fixes.length === 0) return null;
  return (
    <Card className="border-good/40 bg-good-bg">
      <CardContent className="p-5">
        <p className="text-good text-sm font-medium">
          {fixes.length} fix{fixes.length === 1 ? "" : "es"} applied this session
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {fixes.map((f, idx) => (
            <li key={idx} className="text-text-muted flex flex-wrap items-center gap-2">
              <span className="bg-panel-2 text-text rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono">
                {f.cellAddress}
              </span>
              <span>{f.field}</span>
              <span className="text-text-subtle">{String(f.oldValue ?? "(blank)")}</span>
              <span aria-hidden>→</span>
              <span className="text-good font-medium">{f.newValue}</span>
            </li>
          ))}
        </ul>
        <p className="text-text-subtle mt-3 text-xs">
          Fixes live in this session only. The original file on disk is unchanged. Submit to persist
          them.
        </p>
      </CardContent>
    </Card>
  );
}

function MismatchPanel({ message }: { message: string }) {
  return (
    <Card className="border-warn/40 bg-warn-bg">
      <CardContent className="p-5">
        <div className="text-warn flex items-start gap-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">Parish mismatch</p>
            <p className="text-text-muted">{message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubmissionFeedback({
  submission,
  onAmend,
}: {
  submission: SubmissionState;
  onAmend: (note: string) => void;
}) {
  if (submission.kind === "idle" || submission.kind === "submitting") return null;

  if (submission.kind === "success") {
    return (
      <Card className="border-good/40 bg-good-bg">
        <CardContent className="p-5">
          <div className="text-good flex items-start gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Report submitted</p>
              <p className="text-text-muted text-xs">
                Saved as report {submission.reportId.slice(0, 8)}… · admins have been notified.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submission.kind === "error") {
    return (
      <Card className="border-bad/40 bg-bad-bg">
        <CardContent className="p-5">
          <div className="text-bad flex items-start gap-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Submit failed</p>
              <p className="text-text-muted text-xs">{submission.message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // needs_note — amendment-note collection inline.
  return <AmendmentForm existingMonth={submission.existingMonth} onSubmit={onAmend} />;
}

function AmendmentForm({
  existingMonth,
  onSubmit,
}: {
  existingMonth: string;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Card className="border-warn/40 bg-warn-bg">
      <CardContent className="p-5">
        <p className="text-warn text-sm font-medium">This month already has a submission</p>
        <p className="text-text-muted mt-1 text-xs">
          A report for {existingMonth} was already submitted for this parish. Submitting now will
          mark the previous one as superseded — please note why this version is replacing it.
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim().length === 0) return;
            onSubmit(note.trim());
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amendment-note">Amendment note</Label>
            <textarea
              id="amendment-note"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Corrected Births total after preparer noticed missing entries."
              rows={3}
              className="border-border bg-panel text-text placeholder:text-text-subtle focus-visible:border-accent w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm outline-none"
            />
          </div>
          <Button type="submit" variant="primary" size="md" disabled={note.trim().length === 0}>
            <Send className="size-4" aria-hidden />
            Submit amendment
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Downloads({
  onDownloadJSON,
  onDownloadXLSX,
}: {
  onDownloadJSON: () => void;
  onDownloadXLSX: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={onDownloadXLSX}>
        <Download className="size-4" aria-hidden />
        Download summary (.xlsx)
      </Button>
      <Button variant="ghost" size="sm" onClick={onDownloadJSON}>
        <Download className="size-4" aria-hidden />
        Download JSON
      </Button>
    </div>
  );
}

// ── Pure helpers ─────────────────────────────────────────────────────

function computeMismatch(
  report: Report,
  authorizedParish: string | null,
  userRole: string,
): string | null {
  if (!authorizedParish || !report.source.parish) return null;
  if (
    userRole === "super_admin" ||
    userRole === "platform_admin" ||
    userRole === "regional_admin"
  ) {
    return null;
  }
  if (report.source.parish.trim().toLowerCase() === authorizedParish.trim().toLowerCase()) {
    return null;
  }
  return `This file is for ${report.source.parish}, but your account is scoped to ${authorizedParish}.`;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
