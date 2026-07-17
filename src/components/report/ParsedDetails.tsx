"use client";

// Parsed-report detail view — the editorial redesign.
//
// Three "chapters" carry the story (Glance → Income → Allocation),
// followed by the per-date receipts and two diagnostic footer drawers.
// "Validated" markers are gone: by the time a report reaches this
// surface, every entry is already validated. We render the calculated
// (recomputed-from-detail) value as the source of truth.
//
// Shared between /upload (post-parse preview) and /admin/reports/[id].
// No props besides `report` so both call sites stay clean.

import { useState } from "react";
import { AlertTriangle, ChevronDown, FileJson } from "lucide-react";
import { fmt, fmtCount, fmtInt } from "@/lib/format";
import type {
  AllocationReconciliation,
  PerDateRow,
  Report,
  SanityCheck,
} from "@/lib/parser";
import { cn } from "@/lib/utils";

export interface ParsedDetailsProps {
  report: Report;
  /**
   * Tenant chrome that ParsedDetails doesn't own but wants to surface
   * inside the identity panel. Admin pages pass region + submission
   * status; /upload omits both. Keeps the shared component free of
   * any DB-shaped concerns while still letting the hero feel populated.
   */
  context?: {
    regionName?: string;
    status?: string;
  };
  /**
   * Optional drawers consumers want to append to the footer band
   * (the bordered area at the bottom that holds the raw-report drawer).
   * Use <FooterDrawer> from this module to match the visual treatment.
   * Admin pages pass an audit-trail drawer; /upload passes nothing.
   */
  footerExtras?: React.ReactNode;
}

export function ParsedDetails({ report, context, footerExtras }: ParsedDetailsProps) {
  return (
    <article className="flex flex-col">
      <ReportHeader report={report} context={context} />

      <div className="mt-6 flex flex-col gap-6">
        {/*
          Received + Remittances live side-by-side: they tell two halves
          of the same story (what came in vs. how it gets distributed),
          so the eye benefits from comparing them at a glance. Stacks
          on mobile since the rows are dense.
        */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReceivedCard report={report} />
          <RemittancesCard report={report} />
        </div>
      </div>

      <PerDateTable rows={report.perDate} />

      {/*
        Footer band — collapsed-by-default drawers. Raw-report ships from
        ParsedDetails so /upload gets it for free; consumers can pass
        additional drawers (e.g. admin audit trail) via `footerExtras`
        so they share the same visual band rather than starting their own.
      */}
      <div className="border-border mt-16 flex flex-col gap-2 border-t pt-8">
        <RawReportFooter report={report} />
        {footerExtras}
      </div>
    </article>
  );
}

// ── Report header ───────────────────────────────────────────────────
//
// One panel, three zones, ranked vertically:
//
//   1. Identity — eyebrow (month · region · status) + parish title +
//      people line (pastor · phone). The parish name is the headline
//      of the entire page, set in Source Serif 4 at display scale.
//
//   2. Headline financial — Total income featured on the left in
//      serif at huge scale; Average attendance as a counterpoint
//      stat on the right (smaller, mono). One line, not a tile grid.
//      These are the two numbers that matter for any parish report;
//      pairing them on the same row says "this is the answer."
//
//   3. Pastoral — births / converts / baptisms etc., as an inline
//      stat row beneath a small "PASTORAL" eyebrow. Subordinated
//      treatment because they're categorically different from the
//      financial headline. Hidden if no pastoral fields have values.
//
// Surviving warn/fail sanity checks render as an annotation chip
// inside the panel, below the identity zone — visible enough to be
// noticed, quiet enough not to dominate.

function ReportHeader({
  report,
  context,
}: {
  report: Report;
  context?: { regionName?: string; status?: string };
}) {
  const s = report.source;
  const totalIncome = report.parishRecords.sum;
  const avgAttendance = report.parishRecords.averageAttendance ?? 0;
  const pastoralStats = report.statistics.validation.filter((v) => v.hasAnyValue);
  const issues = report.sanityChecks.filter((c) => c.level !== "ok");

  // Identity row: parish name leads, then the contextual metadata
  // (region, pastor, phone) trails behind it in the muted treatment.
  // Date + status sit on the right side of the same row. All segments
  // render in sentence case — Stripe doesn't do small-caps labels.
  const trailingSegments = [
    context?.regionName,
    s.pastor,
    s.mobile,
  ].filter((v): v is string => Boolean(v));

  // Combined inline stat line: financial headline + pastoral counts,
  // co-mingled. The original "Pastoral" lead label is dropped because
  // once the stats live next to TOTAL INCOME / AVG ATTENDANCE it reads
  // as redundant categorization.
  const headlineStats = [
    { label: "Total income", value: fmt(totalIncome) },
    { label: "Avg attendance", value: fmtCount(avgAttendance) },
    ...pastoralStats.map((stat) => ({
      label: stat.label,
      value: fmtInt(stat.recomputed),
    })),
  ];

  return (
    <section className="bg-panel border-border rounded-[var(--radius-lg)] border p-5 shadow-sm">
      {/*
        Zone 1 — Identity, now collapsed to a single row.
        Left cluster: parish name (serif, semibold, slightly larger
        than its neighbors so it still reads as the title), followed
        by region / pastor / phone in the muted metadata treatment.
        Right cluster: month chip + status pill.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="text-text text-lg leading-tight font-bold tracking-[-0.015em] sm:text-xl">
            {s.parish ?? "Unknown parish"}
          </h1>
          {trailingSegments.length > 0 ? (
            <p className="text-text-muted flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-medium">
              {trailingSegments.map((seg, i) => (
                <span key={seg + i} className="flex items-baseline gap-2">
                  <span className="text-text-subtle" aria-hidden>
                    ·
                  </span>
                  {seg}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-panel-2 text-text-muted inline-flex shrink-0 items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium">
            {formatMonth(s.reportMonth)}
          </span>
          {context?.status ? <StatusPill status={context.status} /> : null}
        </div>
      </div>

      {issues.length > 0 ? <SanityChip issues={issues} /> : null}

      {/*
        Zone 2 — Single inline line carrying headline financial +
        pastoral stats together. Each pair: muted sentence-case label +
        mono value in a quiet chip. Wraps on narrow widths.
      */}
      <div className="border-border/60 mt-4 border-t pt-4">
        <InlineStats items={headlineStats} />
      </div>
    </section>
  );
}

/**
 * Submission status pill. Status is a free string from the consumer
 * ("Submitted" / "Amended" / "Superseded") so we map by lowercase
 * needle to the right tone tokens. Defaults to muted neutral.
 */
function StatusPill({ status }: { status: string }) {
  const needle = status.toLowerCase();
  const tone = needle.includes("submit")
    ? "bg-good-bg text-good"
    : needle.includes("amend")
      ? "bg-warn-bg text-warn"
      : "bg-panel-2 text-text-subtle";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold",
        tone,
      )}
    >
      {status}
    </span>
  );
}

/**
 * Full-width stat row. Pairs distribute edge-to-edge from `sm`
 * upward (using `justify-between` so the empty space between pairs
 * does the separator job — no bullets needed). On narrow viewports
 * pairs fall back to natural inline flow with a sensible gap so
 * `justify-between` doesn't create a weird last-row stretch when
 * items wrap.
 *
 * The value in each pair is rendered as a quiet grey chip
 * (`bg-panel-2`) — gives the data a visual focal point without
 * pulling chromatic accent into the surface.
 */
function InlineStats({
  items,
  leadLabel,
}: {
  items: Array<{ label: string; value: string }>;
  leadLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm sm:justify-between">
      {leadLabel ? (
        <span className="text-text-muted text-xs font-medium">{leadLabel}</span>
      ) : null}
      {items.map((item) => (
        <span key={item.label} className="flex items-baseline gap-2">
          <span className="text-text-muted text-xs font-medium whitespace-nowrap">
            {item.label}
          </span>
          <span className="bg-panel-2 text-text rounded-[var(--radius-sm)] px-2 py-0.5 font-mono text-sm font-semibold tabular-nums whitespace-nowrap">
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function SanityChip({ issues }: { issues: SanityCheck[] }) {
  const [open, setOpen] = useState(false);
  const fail = issues.filter((i) => i.level === "fail").length;
  const warn = issues.filter((i) => i.level === "warn").length;
  // Tone tracks the worst level present.
  const tone = fail > 0 ? "bad" : "warn";
  const summary =
    fail > 0
      ? `${fail} ${plural(fail, "issue")}${warn ? ` · ${warn} ${plural(warn, "warning")}` : ""}`
      : `${warn} ${plural(warn, "warning")}`;
  return (
    <div
      className={cn(
        "mt-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs",
        tone === "bad"
          ? "border-bad/30 bg-bad-bg text-bad"
          : "border-warn/30 bg-warn-bg text-warn",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 font-medium"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" aria-hidden />
          {summary}
        </span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col gap-1.5 pl-5">
          {issues.map((i) => (
            <li key={i.id} className="text-text-muted text-xs">
              <span className="text-text font-medium">{i.label}</span>
              {i.detail ? <span className="ml-1">— {i.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── Chapter 2: Received ─────────────────────────────────────────────
//
// What came in this month, broken down by income kind. Each row shows
// the value + share-of-total. Footer row carries the grand total + 100%
// to mirror the structure of Remittances side-by-side.

function ReceivedCard({ report }: { report: Report }) {
  const r = report.parishRecords;
  const total = r.sum;
  const rows = [
    { key: "offering" as const, label: "Offerings", value: r.totalOffering },
    { key: "tithe" as const, label: "Tithes", value: r.totalTithe },
    { key: "thanksgiving" as const, label: "Thanksgiving", value: r.totalThanksgiving },
    { key: "others" as const, label: "Others", value: r.totalOthers },
  ];

  return (
    <ChapterCard title="Received">
      <BreakdownList rows={rows} total={total} />
    </ChapterCard>
  );
}

// ── Chapter 3: Remittances ─────────────────────────────────────────
//
// How the money is distributed. Same row primitive as Received so the
// two cards read as a matched pair. Allocation reconciliation note
// surfaces below the list only when there's drift.

function RemittancesCard({ report }: { report: Report }) {
  const regional = report.regionalRemittance.calculated.total;
  const parish = report.parishOperations.calculated.total;
  const pastor = report.parishPastorAllowance.calculated.total;
  const provincial = report.provincialRemittance.calculated.tithe5;
  const others = report.others.totalOthers;
  const rows = [
    { key: "parish", label: "Parish operations", value: parish },
    { key: "pastor", label: "Pastor allowance", value: pastor },
    { key: "regional", label: "Regional remittance", value: regional },
    { key: "provincial", label: "Provincial remittance", value: provincial },
    { key: "others", label: "Others (no rule)", value: others },
  ].filter((row) => row.value > 0);
  const total = rows.reduce((acc, row) => acc + row.value, 0);

  return (
    <ChapterCard title="Remittances">
      <BreakdownList rows={rows} total={total} />
      <AllocationReconciliationNote allocation={report.allocationReconciliation} />
    </ChapterCard>
  );
}

// ── Shared row primitive for Received + Remittances ─────────────────
//
// One layout, two consumers. Each row: label on the left, amount and
// share-of-total stacked vertically on the right (right-aligned, money
// on top, percentage muted below). Footer: grand total + 100% in the
// same shape so the eye lands on it as a continuation of the list.

function BreakdownList({
  rows,
  total,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  total: number;
}) {
  // Avoid /0 in the percentage math without showing meaningless rows.
  const denom = total || 1;
  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <BreakdownRow
            key={row.key}
            label={row.label}
            value={row.value}
            percent={(row.value / denom) * 100}
          />
        ))}
      </ul>
      <div className="border-border mt-4 border-t pt-3">
        <BreakdownRow label="Total" value={total} percent={100} emphasis />
      </div>
    </>
  );
}

function BreakdownRow({
  label,
  value,
  percent,
  emphasis,
}: {
  label: string;
  value: number;
  percent: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn("text-text text-sm", emphasis ? "font-semibold" : "font-medium")}
      >
        {label}
      </span>
      <span className="text-text font-mono text-sm tabular-nums">
        <span className={emphasis ? "font-semibold" : "font-medium"}>{fmt(value)}</span>
        <span className="text-text-subtle ml-2 text-xs font-normal">{percent.toFixed(1)}%</span>
      </span>
    </div>
  );
}

function AllocationReconciliationNote({ allocation }: { allocation: AllocationReconciliation }) {
  // Quiet by default. If the entered totals don't match what the rules
  // would produce, surface a one-line note. Detail goes in a disclosure.
  if (allocation.validated) return null;
  return (
    <details className="border-warn/30 bg-warn-bg text-warn mt-4 rounded-[var(--radius-sm)] border px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium">
        Entered allocations differ from expected by {fmt(allocation.delta)}
      </summary>
      <dl className="text-text-muted mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>Total monetary income</dt>
        <dd className="font-mono">{fmt(allocation.totalIncome)}</dd>
        <dt>Others (no rule)</dt>
        <dd className="font-mono">{fmt(allocation.others)}</dd>
        <dt>Expected (Total − Others)</dt>
        <dd className="font-mono">{fmt(allocation.expectedAllocations)}</dd>
        <dt>Entered remittances</dt>
        <dd className="font-mono">{fmt(allocation.enteredAllocations)}</dd>
      </dl>
    </details>
  );
}

// ── Per-date receipts ───────────────────────────────────────────────
//
// One slim table. 9 columns, no comparison columns, no "validated"
// markers. Sticky header, controlled-density padding, alternating row
// tint. On mobile this scrolls horizontally inside the card.

function PerDateTable({ rows }: { rows: PerDateRow[] }) {
  const visible = rows.filter((d) => d.date && (d.hasAttendance || d.hasMoney));
  if (visible.length === 0) return null;
  return (
    <section className="mt-8">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-text text-base font-semibold tracking-[-0.01em]">
          Daily entries
        </h2>
        <p className="text-text-muted text-xs">
          {visible.length} {plural(visible.length, "service")}
        </p>
      </header>
      <div className="bg-panel border-border overflow-hidden rounded-[var(--radius-lg)] border">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-panel-2 text-text-muted">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium">Attendance</th>
                <th className="px-3 py-2.5 text-right font-medium">Offering</th>
                <th className="px-3 py-2.5 text-right font-medium">Tithe</th>
                <th className="px-3 py-2.5 text-right font-medium">Thanksgiving</th>
                <th className="px-3 py-2.5 text-right font-medium">Others</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d, idx) => (
                <tr
                  key={d.row}
                  className={cn(
                    "border-border/40 border-t",
                    // Alternating row tint, very subtle.
                    idx % 2 === 1 && "bg-panel-2/30",
                  )}
                >
                  <td className="text-text px-3 py-2 font-mono whitespace-nowrap">{d.date}</td>
                  {/*
                    Single Attendance column = men + women + children. We use
                    `totalCalculated` (already summed by the parser) rather
                    than re-summing here so we honour the same value the
                    rest of the page is reading from.
                  */}
                  <td className="text-text px-3 py-2 text-right font-mono tabular-nums">
                    {fmtInt(d.attendance.totalCalculated)}
                  </td>
                  <td className="text-text px-3 py-2 text-right font-mono tabular-nums">
                    {fmt(d.money.offering)}
                  </td>
                  <td className="text-text px-3 py-2 text-right font-mono tabular-nums">
                    {fmt(d.money.tithe)}
                  </td>
                  <td className="text-text px-3 py-2 text-right font-mono tabular-nums">
                    {fmt(d.money.thanksgiving)}
                  </td>
                  <td className="text-text px-3 py-2 text-right font-mono tabular-nums">
                    {fmt(d.money.others)}
                  </td>
                  <td className="text-text px-3 py-2 text-right font-mono font-semibold tabular-nums">
                    {fmt(d.money.totalCalculated)}
                  </td>
                </tr>
              ))}
              <FooterTotals rows={visible} />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FooterTotals({ rows }: { rows: PerDateRow[] }) {
  const sum = (pick: (d: PerDateRow) => number) => rows.reduce((acc, d) => acc + pick(d), 0);
  // Attendance footer reads as an average per service rather than a sum.
  // For the money columns, sum is the right reading — those add to the
  // monthly total. For attendance, the sum would be a meaningless
  // "person-services attended" figure.
  const avgAttendance = rows.length > 0 ? sum((d) => d.attendance.totalCalculated) / rows.length : 0;
  return (
    <tr className="bg-panel-2 border-border border-t-2 font-semibold">
      <td className="text-text px-3 py-2.5">Total</td>
      <td
        className="text-text px-3 py-2.5 text-right font-mono tabular-nums"
        title="Average per service"
      >
        {fmtCount(avgAttendance)}
        <span className="text-text-subtle ml-1 text-xs font-normal">avg</span>
      </td>
      <td className="text-text px-3 py-2.5 text-right font-mono tabular-nums">
        {fmt(sum((d) => d.money.offering))}
      </td>
      <td className="text-text px-3 py-2.5 text-right font-mono tabular-nums">
        {fmt(sum((d) => d.money.tithe))}
      </td>
      <td className="text-text px-3 py-2.5 text-right font-mono tabular-nums">
        {fmt(sum((d) => d.money.thanksgiving))}
      </td>
      <td className="text-text px-3 py-2.5 text-right font-mono tabular-nums">
        {fmt(sum((d) => d.money.others))}
      </td>
      <td className="text-text px-3 py-2.5 text-right font-mono tabular-nums">
        {fmt(sum((d) => d.money.totalCalculated))}
      </td>
    </tr>
  );
}

// ── Atoms ───────────────────────────────────────────────────────────

function ChapterCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-panel border-border rounded-[var(--radius-lg)] border p-6 shadow-sm">
      <h2 className="text-text mb-5 text-base font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

// ── Footer drawers ──────────────────────────────────────────────────
//
// Quiet, collapsed-by-default disclosures that live below the main
// content. Used for diagnostic / power-user surfaces that shouldn't
// claim space until asked. The atom is exported so other detail-view
// chrome (admin audit trail, etc.) can match the visual treatment.

export function FooterDrawer({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="text-text-muted hover:text-text flex cursor-pointer items-center gap-2 py-1.5 text-xs font-medium">
        <ChevronDown
          className="text-text-subtle size-3.5 transition-transform group-open:rotate-180"
          aria-hidden
        />
        {icon}
        {label}
      </summary>
      <div className="mt-3 mb-1 pl-5">{children}</div>
    </details>
  );
}

function RawReportFooter({ report }: { report: Report }) {
  return (
    <FooterDrawer
      label="Inspect raw report (JSON)"
      icon={<FileJson className="size-3.5" aria-hidden />}
    >
      <pre className="bg-panel-2 max-h-[480px] overflow-auto rounded-[var(--radius-sm)] p-3 font-mono text-xs">
        {JSON.stringify(report, null, 2)}
      </pre>
    </FooterDrawer>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function formatMonth(yyyymm: string): string {
  // "2025-12" or "2025-12-01" → "December 2025"
  const m = yyyymm.match(/^(\d{4})-(\d{2})/);
  if (!m) return yyyymm;
  const y = m[1];
  const idx = Number(m[2]) - 1;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (idx < 0 || idx > 11) return yyyymm;
  return `${months[idx]} ${y}`;
}

