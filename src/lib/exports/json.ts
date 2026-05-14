// Browser-side JSON download. Triggers a client download of the parsed
// Report as a pretty-printed JSON file.

import type { Report } from "@/lib/parser";

function safeFilenamePart(s: string | null | undefined, fallback: string): string {
  const v = (s ?? fallback).toString().trim().replace(/\s+/g, "_");
  return v || fallback;
}

/**
 * Generate the download filename for a Report.
 * Example: `mreport_Mount_Zion_Berlin_October_2025.json`
 */
export function reportFilename(report: Report, ext: "json" | "xlsx"): string {
  const parish = safeFilenamePart(report.source.parish, "report");
  const month = safeFilenamePart(report.source.reportMonth, "Unknown");
  return `mreport_${parish}_${month}.${ext}`;
}

/**
 * Trigger a client-side JSON download. No-op outside the browser.
 */
export function downloadReportJSON(report: Report): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFilename(report, "json");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the object URL on next tick to avoid retaining the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
