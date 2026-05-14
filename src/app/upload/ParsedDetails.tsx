"use client";

// Detailed extract view, mirroring the prototype's render(report) flow
// (see _prototype/EXTRACTED-SPEC.md §6.1).
//
// One collapsible <details> per section. Each section auto-opens when
// it contains a validation failure, so preparers see what needs review
// without having to expand every panel.
//
// Sections are intentionally rendered in the same order as the
// prototype so anyone reviewing the rebuild can diff visually.

import { ChevronDown } from "lucide-react";
import { fmt, fmtInt, fmtSmart } from "@/lib/format";
import type {
  AllocationReconciliation,
  MonthlyValidation,
  PerDateRow,
  PerDateStatRow,
  Report,
  SanityCheck,
  StatisticsValidation,
  WeeklyTotal,
} from "@/lib/parser";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<SanityCheck["level"], string> = {
  ok: "bg-good",
  warn: "bg-warn",
  fail: "bg-bad",
};

export interface ParsedDetailsProps {
  report: Report;
}

export function ParsedDetails({ report }: ParsedDetailsProps) {
  return (
    <div className="flex flex-col gap-3">
      <ParishInfoSection report={report} />
      <ParishRecordsSection report={report} />
      <BuildUpSection report={report} />
      <SanitySection checks={report.sanityChecks} />
      <WeeklyTotalsSection weekly={report.weeklyTotals} />
      <AllocationSection allocation={report.allocationReconciliation} />
      <RemittanceSection report={report} />
      <PerDateDetailSection rows={report.perDate} />
      <StatisticsSection
        statsRows={report.statistics.perDate}
        validation={report.statistics.validation}
      />
      <RawJsonSection report={report} />
    </div>
  );
}

// ── Section shell ───────────────────────────────────────────────────

interface SectionProps {
  title: string;
  badge?: React.ReactNode;
  hasErrors?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, hasErrors, defaultOpen, children }: SectionProps) {
  return (
    <details open={defaultOpen ?? hasErrors ?? false} className="group">
      <summary
        className={cn(
          "bg-panel border-border hover:border-border-strong flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm transition-colors",
          hasErrors ? "border-bad/40" : "",
        )}
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className="text-text-subtle size-3.5 transition-transform group-open:rotate-180"
            aria-hidden
          />
          <span className="text-text font-medium">{title}</span>
          {badge}
        </span>
        {hasErrors ? <span className="text-bad text-xs font-medium">needs review</span> : null}
      </summary>
      <div className="mt-2 px-4 pb-3">{children}</div>
    </details>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "info" }) {
  const cls =
    tone === "ok"
      ? "bg-good-bg text-good"
      : tone === "warn"
        ? "bg-warn-bg text-warn"
        : "bg-info-bg text-info";
  return (
    <span className={cn("rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

// ── 1. Parish info ──────────────────────────────────────────────────

function ParishInfoSection({ report }: { report: Report }) {
  const s = report.source;
  return (
    <Section title="Parish Info (Row 1)" defaultOpen>
      <KeyValueGrid
        rows={[
          ["Name of Parish", s.parish ?? "—"],
          ["Month of the Report", s.reportMonth],
          ["Name of Pastor", s.pastor ?? "—"],
          ["Mobile", s.mobile ?? "—"],
          ["Email", s.email ?? "—"],
        ]}
      />
    </Section>
  );
}

// ── 2. Parish Records (Row 2) ───────────────────────────────────────

function ParishRecordsSection({ report }: { report: Report }) {
  const mv = report.monthlyValidation;
  const hasErrors = [
    mv.offering,
    mv.tithe,
    mv.thanksgiving,
    mv.others,
    mv.sum,
    mv.averageAttendance,
    mv.averageMen,
    mv.averageWomen,
    mv.averageChildren,
  ].some((e) => e.validated === false);

  return (
    <Section title="Parish Records (Row 2)" hasErrors={hasErrors}>
      <Table
        headers={["Field", "Reported", "Re-summed", "Match"]}
        rows={[
          row("Total Offering", mv.offering),
          row("Total Tithe", mv.tithe),
          row("Total Thanksgiving", mv.thanksgiving),
          row("Total Others", mv.others),
          row("Sum", mv.sum),
          avgRow("Average Attendance", mv.averageAttendance),
          avgRow("Average Men", mv.averageMen),
          avgRow("Average Women", mv.averageWomen),
          avgRow("Average Children", mv.averageChildren),
        ]}
      />
    </Section>
  );
}

function row(
  label: string,
  v: MonthlyValidation["offering"],
): Array<string | number | React.ReactNode> {
  return [
    label,
    v.reported != null ? fmt(v.reported) : "—",
    fmt(v.recomputed),
    matchCell(v.validated),
  ];
}
function avgRow(
  label: string,
  v: MonthlyValidation["averageAttendance"],
): Array<string | number | React.ReactNode> {
  return [
    label,
    v.reported != null ? fmtSmart(v.reported) : "—",
    fmtSmart(v.recomputed),
    matchCell(v.validated),
  ];
}

// ── 3. Build-Up ──────────────────────────────────────────────────────

function BuildUpSection({ report }: { report: Report }) {
  // For each money field, show the per-week chain: w1 + w2 + ... = sum.
  const fields = [
    { key: "offering" as const, label: "Total Offering" },
    { key: "tithe" as const, label: "Total Tithe" },
    { key: "thanksgiving" as const, label: "Total Thanksgiving" },
    { key: "others" as const, label: "Total Others" },
  ];
  const datedRows = report.perDate.filter((d) => d.date);
  const hasErrors = fields.some((f) => report.monthlyValidation[f.key].validated === false);

  return (
    <Section title="Build-Up (per-week formulas)" hasErrors={hasErrors}>
      <div className="flex flex-col gap-2">
        {fields.map((f) => {
          const v = report.monthlyValidation[f.key];
          const formula = datedRows.length
            ? datedRows.map((d) => fmt(d.money[f.key])).join(" + ")
            : "—";
          return (
            <div key={f.key} className="bg-panel-2 rounded-[var(--radius-sm)] p-3 text-xs">
              <p className="text-text font-medium">{f.label}</p>
              <p className="text-text-muted mt-1 font-mono">
                {formula} = <span className="text-text font-semibold">{fmt(v.recomputed)}</span>
              </p>
              <p className="text-text-subtle mt-1">
                Reported {fmt(v.reported)} · {matchLabel(v.validated)}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── 4. Sanity checks ─────────────────────────────────────────────────

function SanitySection({ checks }: { checks: SanityCheck[] }) {
  const okCount = checks.filter((c) => c.level === "ok").length;
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const failCount = checks.filter((c) => c.level === "fail").length;
  const hasErrors = warnCount + failCount > 0;
  return (
    <Section
      title="Sanity checks"
      hasErrors={hasErrors}
      badge={
        <span className="text-text-subtle text-xs">
          {okCount} ok · {warnCount} warn · {failCount} fail
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <span
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[c.level])}
              aria-hidden
            />
            <div>
              <p className="text-text font-medium">{c.label}</p>
              {c.detail ? <p className="text-text-muted mt-0.5">{c.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── 5. Weekly Totals ─────────────────────────────────────────────────

function WeeklyTotalsSection({ weekly }: { weekly: WeeklyTotal[] }) {
  if (weekly.length === 0) return null;
  const hasErrors = weekly.some((w) => w.validated === false);
  return (
    <Section title="Weekly Totals" hasErrors={hasErrors}>
      <Table
        headers={["Week", "Entered € Total", "Re-summed", "Δ", "Match"]}
        rows={weekly.map((w) => [
          `WEEK ${w.weekIndex}`,
          w.enteredTotal != null ? fmt(w.enteredTotal) : "—",
          fmt(w.recomputedTotal),
          w.enteredTotal != null ? fmt(Math.abs(w.enteredTotal - w.recomputedTotal)) : "—",
          matchCell(w.validated),
        ])}
      />
    </Section>
  );
}

// ── 6. Allocation Reconciliation ────────────────────────────────────

function AllocationSection({ allocation }: { allocation: AllocationReconciliation }) {
  const a = allocation;
  const hasErrors = !a.validated;
  return (
    <Section title="Allocation Reconciliation" hasErrors={hasErrors}>
      <KeyValueGrid
        rows={[
          ["Total monetary income", fmt(a.totalIncome)],
          ["Others (no allocation rule)", fmt(a.others)],
          ["Expected allocations (Total − Others)", fmt(a.expectedAllocations)],
          ["Sum of entered remittances", fmt(a.enteredAllocations)],
          ["Δ (entered − expected)", fmt(a.delta)],
          ["Match", matchLabel(a.validated)],
        ]}
      />
    </Section>
  );
}

// ── 7. Remittance tables ─────────────────────────────────────────────

function RemittanceSection({ report }: { report: Report }) {
  return (
    <>
      <RemittanceTable
        title="Regional Remittance"
        rows={[
          [
            "5% of Total Offering",
            report.regionalRemittance.calculated.offering5,
            report.regionalRemittance.actual.offering5,
          ],
          [
            "20% of Total Tithe",
            report.regionalRemittance.calculated.tithe20,
            report.regionalRemittance.actual.tithe20,
          ],
          [
            "Total Regional Remittance",
            report.regionalRemittance.calculated.total,
            report.regionalRemittance.actual.total,
          ],
        ]}
      />
      <RemittanceTable
        title="Parish Operations"
        rows={[
          [
            "55% of Total Tithe",
            report.parishOperations.calculated.tithe55,
            report.parishOperations.actual.tithe55,
          ],
          [
            "95% of Total Offering",
            report.parishOperations.calculated.offering95,
            report.parishOperations.actual.offering95,
          ],
          [
            "30% of Total Thanksgiving",
            report.parishOperations.calculated.thanksgiving30,
            report.parishOperations.actual.thanksgiving30,
          ],
          [
            "Total Parish Operations",
            report.parishOperations.calculated.total,
            report.parishOperations.actual.total,
          ],
        ]}
      />
      <RemittanceTable
        title="Pastor Allowance"
        rows={[
          [
            "20% of Total Tithe",
            report.parishPastorAllowance.calculated.tithe20,
            report.parishPastorAllowance.actual.tithe20,
          ],
          [
            "70% of Total Thanksgiving",
            report.parishPastorAllowance.calculated.thanksgiving70,
            report.parishPastorAllowance.actual.thanksgiving70,
          ],
          [
            "Total Pastor Allowance",
            report.parishPastorAllowance.calculated.total,
            report.parishPastorAllowance.actual.total,
          ],
        ]}
      />
      <RemittanceTable
        title="Provincial Remittance"
        rows={[
          [
            "5% of Total Tithe",
            report.provincialRemittance.calculated.tithe5,
            report.provincialRemittance.actual.tithe5,
          ],
        ]}
      />
    </>
  );
}

function RemittanceTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, number, number | null]>;
}) {
  const hasErrors = rows.some(([, calc, actual]) => {
    if (actual == null) return false;
    return Math.abs(calc - actual) >= 0.01;
  });
  return (
    <Section title={title} hasErrors={hasErrors}>
      <Table
        headers={["Label", "Calculated", "Actual", "Match"]}
        rows={rows.map(([label, calc, actual]) => [
          label,
          fmt(calc),
          actual != null ? fmt(actual) : "missing",
          matchCell(actual == null ? null : Math.abs(calc - actual) < 0.01),
        ])}
      />
    </Section>
  );
}

// ── 8. Per-Date Detail ───────────────────────────────────────────────

function PerDateDetailSection({ rows }: { rows: PerDateRow[] }) {
  const visible = rows.filter((d) => d.hasAttendance || d.hasMoney || d.date);
  const hasErrors = visible.some(
    (d) => d.attendance.validated === false || d.money.validated === false,
  );
  return (
    <Section
      title={`Per-Date Detail (${visible.length} row${visible.length === 1 ? "" : "s"})`}
      hasErrors={hasErrors}
    >
      <Table
        headers={[
          "Date",
          "Day",
          "Men",
          "Women",
          "Children",
          "Att. Reported",
          "Att. Calc",
          "Att. Match",
          "Offering",
          "Tithe",
          "Thx",
          "Others",
          "€ Reported",
          "€ Calc",
          "€ Match",
        ]}
        rows={visible.map((d) => [
          d.date ?? "—",
          d.day || "—",
          fmtInt(d.attendance.men),
          fmtInt(d.attendance.women),
          fmtInt(d.attendance.children),
          d.attendance.totalReported != null ? fmtInt(d.attendance.totalReported) : "—",
          fmtInt(d.attendance.totalCalculated),
          matchCell(d.attendance.validated),
          fmt(d.money.offering),
          fmt(d.money.tithe),
          fmt(d.money.thanksgiving),
          fmt(d.money.others),
          d.money.totalReported != null ? fmt(d.money.totalReported) : "—",
          fmt(d.money.totalCalculated),
          matchCell(d.money.validated),
        ])}
      />
    </Section>
  );
}

// ── 9. Statistics ────────────────────────────────────────────────────

function StatisticsSection({
  statsRows,
  validation,
}: {
  statsRows: PerDateStatRow[];
  validation: StatisticsValidation[];
}) {
  const visible = validation.filter((v) => v.hasAnyValue);
  const hasErrors = visible.some((v) => v.validated === false);
  if (visible.length === 0) {
    return (
      <Section title="Statistics" badge={<Badge tone="ok">all zero</Badge>}>
        <p className="text-text-muted text-xs">
          No statistics entries were recorded for this month.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Statistics" hasErrors={hasErrors}>
      <Table
        headers={["Field", "Per-date sum", "Reported total", "Match"]}
        rows={visible.map((v) => [
          v.label,
          fmtInt(v.recomputed),
          v.reported != null ? fmtInt(v.reported) : "—",
          matchCell(v.validated),
        ])}
      />
      {/* Show per-date contributors below the totals — useful sanity check. */}
      {statsRows.length > 0 ? (
        <details className="mt-3">
          <summary className="text-text-muted hover:text-text cursor-pointer text-xs">
            Show per-date entries
          </summary>
          <Table
            headers={["Date", ...visible.map((v) => v.label)]}
            rows={statsRows.map((r) => [
              r.date ?? "—",
              ...visible.map((v) => fmtInt(r.stats[v.key])),
            ])}
          />
        </details>
      ) : null}
    </Section>
  );
}

// ── 10. Raw JSON ─────────────────────────────────────────────────────

function RawJsonSection({ report }: { report: Report }) {
  return (
    <Section title="Inspect raw report (JSON)">
      <pre className="bg-panel-2 max-h-[480px] overflow-auto rounded-[var(--radius-sm)] p-3 font-mono text-xs">
        {JSON.stringify(report, null, 2)}
      </pre>
    </Section>
  );
}

// ── Shared building blocks ───────────────────────────────────────────

function KeyValueGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="bg-panel-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-[var(--radius-sm)] p-3 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{k}</dt>
          <dd className="text-text font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number | React.ReactNode>>;
}) {
  if (rows.length === 0) {
    return <p className="text-text-muted text-xs">No data.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="bg-panel-2 w-full rounded-[var(--radius-sm)] text-xs">
        <thead className="text-text-muted">
          <tr>
            {headers.map((h, idx) => (
              <th
                key={idx}
                className="px-3 py-2 text-left text-xs font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-border/30 border-t">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-3 py-2",
                    ci === 0 ? "text-text-muted" : "text-text",
                    typeof cell === "number" || ci > 0 ? "font-mono" : "",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function matchCell(v: boolean | null) {
  if (v == null) {
    return <span className="text-text-subtle text-xs">missing</span>;
  }
  return v ? (
    <span className="text-good text-xs">✓ validated</span>
  ) : (
    <span className="text-bad text-xs">✗ not validated</span>
  );
}

function matchLabel(v: boolean | null): string {
  if (v == null) return "n/a";
  return v ? "✓ validated" : "✗ not validated";
}
