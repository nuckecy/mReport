import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FooterDrawer, ParsedDetails } from "@/components/report/ParsedDetails";
import { getSession } from "@/lib/auth/session";
import { getReportById, listAuditForReport } from "@/lib/reports/queries";
import type { Report } from "@/lib/parser";
import { DownloadFileButton } from "../DownloadFileButton";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  amended: "Amended",
  superseded: "Superseded",
};

/**
 * Runtime sanity check on the persisted parser output. We don't run a
 * full zod schema (the Report shape is wide and our parser version is
 * the only writer) but we want to fail gracefully if a row was written
 * by a much-older parser, was hand-edited in the DB, or somehow drifted
 * — rendering ParsedDetails against `null` would crash hard.
 */
function isValidReport(raw: unknown): raw is Report {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.source === "object" &&
    typeof r.parishRecords === "object" &&
    Array.isArray(r.perDate)
  );
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;

  const report = await getReportById(session.tenantId, id);
  if (!report) notFound();

  const audit = await listAuditForReport(session.tenantId, report.id);
  const parsedReport = isValidReport(report.rawJson) ? report.rawJson : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/reports"
        className="text-text-muted hover:text-text inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to reports
      </Link>

      {/*
        Admin-only submission metadata (who submitted, when) and the
        download CTA. The parish title, month, region, and status all
        live inside ParsedDetails now via the `context` slot, so we
        don't repeat them here. This bar reads as the "tenant chrome"
        layer above the report content.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-text-muted">
          Submitted by{" "}
          <span className="text-text font-medium">
            {report.submittedByName ?? report.submittedByEmail}
          </span>{" "}
          on{" "}
          <span className="text-text font-mono">
            {report.submittedAt.toISOString().slice(0, 19).replace("T", " ")}
          </span>{" "}
          UTC
        </p>
        <DownloadFileButton reportId={report.id} />
      </div>

      {report.amendmentNote ? (
        <Card className="border-warn/40 bg-warn-bg">
          <CardContent className="p-4">
            <p className="text-warn text-sm font-medium">Amendment note</p>
            <p className="text-text-muted mt-1 text-sm">{report.amendmentNote}</p>
          </CardContent>
        </Card>
      ) : null}

      {/*
        Parsed-extract view. Shared with the upload flow so anything we
        change in ParsedDetails (new sections, label tweaks, formatting
        fixes) shows up identically on both surfaces.

        Falls back to a brief notice if the persisted JSON predates the
        current parser shape — this protects us from rendering against
        partial or stale data and crashing the page.
      */}
      {parsedReport ? (
        <ParsedDetails
          report={parsedReport}
          context={{
            regionName: report.regionName,
            status: STATUS_LABEL[report.status],
          }}
          footerExtras={
            <FooterDrawer
              label={`Audit trail (${audit.length})`}
              icon={<History className="size-3.5" aria-hidden />}
            >
              {audit.length === 0 ? (
                <p className="text-text-muted text-xs">No audit entries yet.</p>
              ) : (
                <ul className="divide-border divide-y">
                  {audit.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-baseline gap-2 py-2 text-xs"
                    >
                      <span className="text-text-subtle font-mono">
                        {a.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                      </span>
                      <span className="text-text font-medium">{a.action}</span>
                      <span className="text-text-muted">
                        {a.actorEmailMasked ?? "(system)"}
                        {a.ip ? ` · ${a.ip}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </FooterDrawer>
          }
        />
      ) : (
        <Card className="border-warn/40 bg-warn-bg">
          <CardContent className="p-4">
            <p className="text-warn text-sm font-medium">Parsed extract unavailable</p>
            <p className="text-text-muted mt-1 text-sm">
              This report was saved by an earlier parser version and can&rsquo;t be re-rendered
              here. The original .xlsx is still available via the Download button above.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
