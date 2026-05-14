"use client";

// Friendly error card shown when an uploaded file can't be parsed.
//
// The prototype showed a bare red panel with a raw error message. That
// works in a single-file demo but doesn't help a real preparer figure
// out what went wrong. We classify the error into one of three
// diagnoses and offer matching next-step actions, while keeping the
// original technical message available behind a <details> for
// debugging.
//
// Categories:
//   - not-xlsx       wrong file type entirely (PDF, JPG, .xls, etc.)
//   - corrupt        looks like an .xlsx but can't be read (renamed,
//                    truncated, password-protected, etc.)
//   - wrong-template parsed fine but doesn't have the parish-report
//                    structure (e.g., "Media Schedule 2026.xlsx" —
//                    the example in the bug report)
//   - unknown        fallback — we couldn't classify the error message

import { AlertTriangle, ArrowRight, Download, FileQuestion, FileX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CORRECT_TEMPLATE_URL } from "@/lib/validation";

export type ParseErrorCategory = "not-xlsx" | "corrupt" | "wrong-template" | "unknown";

export interface ParseErrorCardProps {
  filename?: string;
  /** The raw Error.message that bubbled up from the parser/dropzone. */
  rawMessage: string;
  onReset: () => void;
}

/**
 * Map the raw error message to one of our diagnosis categories. Match
 * against substrings of the messages we emit (parser throws, dropzone
 * guards). Anything we don't recognise falls through to `unknown`.
 */
export function classifyParseError(message: string): ParseErrorCategory {
  const m = message.toLowerCase();
  if (m.includes("isn't an .xlsx") || m.includes("not an .xlsx")) {
    return "not-xlsx";
  }
  if (
    m.includes("doesn't look like a real") ||
    m.includes("corrupted") ||
    m.includes("contains no sheets") ||
    m.includes("missing from the workbook") ||
    // SheetJS's read errors typically mention "unsupported" or "bad" formats.
    m.includes("unsupported") ||
    m.includes("invalid file") ||
    m.includes("can't find end of central directory")
  ) {
    return "corrupt";
  }
  if (m.includes("grand-total row") || m.includes("grand total row")) {
    return "wrong-template";
  }
  return "unknown";
}

export function ParseErrorCard({ filename, rawMessage, onReset }: ParseErrorCardProps) {
  const category = classifyParseError(rawMessage);
  const content = DIAGNOSIS[category];

  return (
    <Card className="border-bad/40 bg-bad-bg">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="bg-bad/15 text-bad grid size-10 shrink-0 place-items-center rounded-full">
            <content.Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-text text-lg font-semibold tracking-tight">{content.title}</h2>
            <p className="text-text-muted mt-1 text-sm">{content.body}</p>
            {filename ? (
              <p className="text-text-subtle mt-2 font-mono text-xs">
                File: <span className="text-text-muted">{filename}</span>
              </p>
            ) : null}
          </div>
        </div>

        <ul className="bg-panel border-border mt-5 flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 text-sm">
          {content.steps.map((step, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="bg-panel-2 text-text-muted grid size-5 shrink-0 place-items-center rounded-full text-xs font-medium">
                {idx + 1}
              </span>
              <span className="text-text-muted">{step}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" size="md" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden />
            Try another file
          </Button>
          {category === "wrong-template" ? (
            <a
              href={CORRECT_TEMPLATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border-strong text-text hover:bg-panel inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium"
            >
              <Download className="size-4" aria-hidden />
              Get the parish report template
            </a>
          ) : null}
        </div>

        <details className="text-text-subtle mt-6 text-xs">
          <summary className="hover:text-text-muted cursor-pointer">Show technical detail</summary>
          <div className="bg-panel-2 mt-2 flex items-start gap-2 rounded-[var(--radius-sm)] p-3 font-mono">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="text-text-muted break-words">{rawMessage}</span>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

// ── Diagnosis copy table ─────────────────────────────────────────────

interface Diagnosis {
  Icon: typeof AlertTriangle;
  title: string;
  body: string;
  steps: string[];
}

const DIAGNOSIS: Record<ParseErrorCategory, Diagnosis> = {
  "not-xlsx": {
    Icon: FileX,
    title: "This isn't an Excel file",
    body: "Parish reports must be uploaded as .xlsx. Other formats (PDF, image, .xls, Numbers) won't be accepted.",
    steps: [
      "Open the parish report in Excel or Google Sheets.",
      "File → Save As (Excel) or File → Download → Microsoft Excel (.xlsx).",
      "Drop the resulting .xlsx file here.",
    ],
  },
  corrupt: {
    Icon: AlertTriangle,
    title: "We can't read this file",
    body: "The file looks like an .xlsx, but it's corrupted, password-protected, or was renamed from a different format. We can't open it to check the contents.",
    steps: [
      "Re-export the report from Excel (File → Save As) and try again.",
      "If the file is password-protected, remove the password and re-upload.",
      "If you renamed a file to .xlsx manually, that won't work — only files originally saved by Excel.",
    ],
  },
  "wrong-template": {
    Icon: FileQuestion,
    title: "This doesn't look like a parish report",
    body: "We opened the file but couldn't find the parish-report structure (the grand-total row, the per-date sections, the remittance rows). It may be the wrong file or based on an old template.",
    steps: [
      "Double-check you're uploading the correct workbook (parish report, not a budget, schedule, or other spreadsheet).",
      "Make sure the file uses the current parish-report template — older templates may not parse.",
      "If you believe this is the correct file, contact your tenant admin to confirm the template.",
    ],
  },
  unknown: {
    Icon: AlertTriangle,
    title: "Something went wrong",
    body: "We couldn't parse this file, but we couldn't tell exactly why. The technical detail below may help your admin diagnose it.",
    steps: [
      "Try uploading the file again — sometimes a partial download causes this.",
      "If the problem persists, contact your tenant admin and share the technical detail below.",
    ],
  },
};
