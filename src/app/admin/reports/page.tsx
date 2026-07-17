import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  listMonthsWithReports,
  listParishesForTenant,
  listReports,
  parseReportFilters,
} from "@/lib/reports/queries";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { ReportsFilters } from "./ReportsFilters";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters({
    parish: firstParam(params.parish),
    month: firstParam(params.month),
    status: firstParam(params.status),
  });

  const session = await getSession();
  if (!session) return null; // layout enforces admin

  const [reports, parishes, months] = await Promise.all([
    listReports(session.tenantId, filters),
    listParishesForTenant(session.tenantId),
    listMonthsWithReports(session.tenantId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-text text-lg font-semibold tracking-tight">Reports</h2>
        <p className="text-text-muted text-sm">
          {reports.length} report{reports.length === 1 ? "" : "s"}
          {filters.parishId || filters.month || filters.status ? " (filtered)" : ""}
        </p>
      </div>

      <ReportsFilters parishes={parishes} months={months} initialFilters={filters} />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-panel-2 text-text-muted">
              <tr className="text-left text-xs">
                <th className="px-4 py-2 font-medium">Month</th>
                <th className="px-4 py-2 font-medium">Parish</th>
                <th className="px-4 py-2 font-medium">Region</th>
                <th className="px-4 py-2 text-right font-medium">Income</th>
                <th className="px-4 py-2 font-medium">Submitted by</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-border hover:bg-panel-2 border-t transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/reports/${r.id}`}
                      className="text-text hover:text-accent font-medium underline-offset-4 hover:underline"
                    >
                      {r.reportMonth.slice(0, 7)}
                    </Link>
                  </td>
                  <td className="text-text px-4 py-3">{r.parishName}</td>
                  <td className="text-text-muted px-4 py-3 text-xs">{r.regionName}</td>
                  <td className="text-text px-4 py-3 text-right font-mono text-xs">
                    {r.totalIncome != null ? fmt(Number(r.totalIncome)) : "—"}
                  </td>
                  <td className="text-text-muted px-4 py-3 text-xs">
                    {r.submittedByName ?? r.submittedByEmail}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="text-text-subtle px-4 py-3 text-right text-xs">
                    {r.submittedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-text-muted px-4 py-8 text-center text-sm">
                    No reports yet for this workspace.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
