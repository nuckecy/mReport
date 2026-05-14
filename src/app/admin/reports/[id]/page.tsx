import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fmt, fmtInt } from "@/lib/format";
import { getSession } from "@/lib/auth/session";
import { getReportById, listAuditForReport, listReportLines } from "@/lib/reports/queries";
import { DownloadFileButton } from "../DownloadFileButton";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  amended: "Amended",
  superseded: "Superseded",
};

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-good-bg text-good",
  amended: "bg-warn-bg text-warn",
  superseded: "bg-panel-2 text-text-subtle",
};

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;

  const report = await getReportById(session.tenantId, id);
  if (!report) notFound();

  const [lines, audit] = await Promise.all([
    listReportLines(report.id, session.tenantId),
    listAuditForReport(session.tenantId, report.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/reports"
        className="text-text-muted hover:text-text inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to reports
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-text text-xl font-semibold tracking-tight">
            {report.parishName} · {report.reportMonth.slice(0, 7)}
          </h2>
          <p className="text-text-muted mt-1 text-sm">
            {report.regionName} · submitted by {report.submittedByName ?? report.submittedByEmail}
            {" · "}
            {report.submittedAt.toISOString().slice(0, 19).replace("T", " ")} UTC
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[report.status]}`}
          >
            {STATUS_LABEL[report.status]}
          </span>
          <DownloadFileButton reportId={report.id} />
        </div>
      </header>

      {report.amendmentNote ? (
        <Card className="border-warn/40 bg-warn-bg">
          <CardContent className="p-4">
            <p className="text-warn text-sm font-medium">Amendment note</p>
            <p className="text-text-muted mt-1 text-sm">{report.amendmentNote}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Totals card */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Income" value={report.totalIncome} format="money" />
          <Stat label="Offering" value={report.totalOffering} format="money" />
          <Stat label="Tithe" value={report.totalTithe} format="money" />
          <Stat label="Thanksgiving" value={report.totalThanksgiving} format="money" />
          <Stat label="Others" value={report.totalOthers} format="money" />
          <Stat label="Avg attendance" value={report.attendanceAvg} format="int" />
        </CardContent>
      </Card>

      {/* Per-date lines */}
      {lines.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-text-muted">
                <tr className="text-left text-xs tracking-wide uppercase">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 text-right font-medium">Men</th>
                  <th className="px-4 py-2 text-right font-medium">Women</th>
                  <th className="px-4 py-2 text-right font-medium">Children</th>
                  <th className="px-4 py-2 text-right font-medium">Offering</th>
                  <th className="px-4 py-2 text-right font-medium">Tithe</th>
                  <th className="px-4 py-2 text-right font-medium">Thanksgiving</th>
                  <th className="px-4 py-2 text-right font-medium">Others</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.entryDate} className="border-border border-t">
                    <td className="text-text-muted px-4 py-2 font-mono text-xs">{l.entryDate}</td>
                    <td className="text-text-muted px-4 py-2 text-xs">{l.dayLabel ?? "—"}</td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">{l.men}</td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">{l.women}</td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">
                      {l.children}
                    </td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">
                      {fmt(Number(l.offering))}
                    </td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">
                      {fmt(Number(l.tithe))}
                    </td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">
                      {fmt(Number(l.thanksgiving))}
                    </td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs">
                      {fmt(Number(l.others))}
                    </td>
                    <td className="text-text px-4 py-2 text-right font-mono text-xs font-medium">
                      {l.moneyTotal != null ? fmt(Number(l.moneyTotal)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {/* Audit trail */}
      <Card>
        <CardContent className="p-5">
          <p className="text-text mb-3 text-sm font-medium">Audit trail</p>
          {audit.length === 0 ? (
            <p className="text-text-muted text-sm">No audit entries yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-2 py-2 text-xs">
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
        </CardContent>
      </Card>

      {/* Raw JSON */}
      <Card>
        <CardContent className="p-5">
          <details>
            <summary className="text-text-muted hover:text-text cursor-pointer text-sm font-medium">
              <FileSpreadsheet className="mr-1.5 inline size-4" aria-hidden />
              Raw parsed JSON
            </summary>
            <pre className="bg-panel-2 mt-3 max-h-[600px] overflow-auto rounded-[var(--radius-md)] p-3 font-mono text-xs">
              {JSON.stringify(report.rawJson, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  format,
}: {
  label: string;
  value: string | null;
  format: "money" | "int";
}) {
  const display =
    value == null ? "—" : format === "money" ? fmt(Number(value)) : fmtInt(Number(value));
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-text-muted text-xs tracking-wide uppercase">{label}</span>
      <span className="text-text font-mono text-base font-semibold">{display}</span>
    </div>
  );
}
