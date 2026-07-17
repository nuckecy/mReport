"use client";

// Region rollup view — one table per selected month.
//
// State is URL-driven: ?months=2025-12,2025-11,2025-10 picks the
// months. We cap at 3 to match the user's stated requirement. The
// month-picker is a small "chip" panel of recent + checked-state
// months; selecting/deselecting one updates the URL and re-fetches
// the server data.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmt, fmtCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadRegionWorkbook } from "@/lib/region/xlsx";
import type { MonthRollup, RegionRollupRow, RollupTotals } from "@/lib/region/queries";

const MONTH_NAMES = [
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

function monthLabel(month: string): string {
  // "2025-12" or "2025-12-01" → "December 2025"
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES[idx]} ${y}`;
}

function shortMonth(month: string): string {
  // "2025-12" → "Dec 2025"
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES[idx]!.slice(0, 3)} ${y}`;
}

/**
 * Trim a name to at most `max` words. When trimmed, append a single
 * ellipsis character so callers can tell at a glance what was cut.
 * Whitespace is collapsed, so "International  Christian" counts as 2.
 */
function truncateWords(name: string, max = 4): string {
  const words = name.trim().split(/\s+/);
  if (words.length <= max) return name;
  return words.slice(0, max).join(" ") + "…";
}

export interface RegionViewProps {
  tenantName: string;
  /** YYYY-MM strings currently shown. */
  selectedMonths: string[];
  /** YYYY-MM strings the tenant has data for (newest first). */
  availableMonths: string[];
  rollups: MonthRollup[];
}

export function RegionView({
  tenantName,
  selectedMonths,
  availableMonths,
  rollups,
}: RegionViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  // YYYY-MM slugs derived from the rollup's `month` field (YYYY-MM-01).
  const rollupSlugs = rollups.map((r) => r.month.slice(0, 7));

  const setMonths = (next: string[]) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next.length === 0) {
      params.delete("months");
    } else {
      params.set("months", next.join(","));
    }
    startTransition(() => {
      router.push(`/admin/region?${params.toString()}`, { scroll: false });
    });
  };

  const toggleMonth = (month: string) => {
    if (selectedMonths.includes(month)) {
      setMonths(selectedMonths.filter((m) => m !== month));
    } else if (selectedMonths.length < 3) {
      // Prepend so the newest selection appears first.
      setMonths([month, ...selectedMonths].slice(0, 3));
    }
    // If we're already at 3, clicking another chip is a no-op. The
    // chip shows disabled visually via the cap check below.
  };

  const onDownload = () => {
    setDownloading(true);
    try {
      downloadRegionWorkbook(tenantName, rollups);
    } finally {
      setDownloading(false);
    }
  };

  // Build the chip pool: union of available months + currently
  // selected (so unselecting still leaves the chip visible). Cap at
  // the most recent 12 months to keep the picker tidy.
  const chipPool = Array.from(new Set([...selectedMonths, ...availableMonths])).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-text text-lg font-semibold tracking-tight">Region rollup</h2>
          <p className="text-text-muted text-sm">
            Cross-parish summary across {selectedMonths.length} month
            {selectedMonths.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={onDownload}
          disabled={downloading || rollups.length === 0}
        >
          <Download className="size-4" aria-hidden />
          {downloading ? "Preparing…" : "Download .xlsx"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-muted text-xs font-medium">Months</span>
            {chipPool.length === 0 ? (
              <span className="text-text-subtle text-xs">No data yet.</span>
            ) : (
              chipPool.map((m) => {
                const selected = selectedMonths.includes(m);
                const atCap = !selected && selectedMonths.length >= 3;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    disabled={pending || atCap}
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium transition-colors",
                      selected
                        ? "bg-accent text-accent-fg"
                        : atCap
                          ? "bg-panel-2 text-text-subtle cursor-not-allowed"
                          : "bg-panel-2 text-text-muted hover:bg-panel hover:text-text",
                    )}
                  >
                    {shortMonth(m)}
                    {selected ? <X className="size-3" aria-hidden /> : null}
                  </button>
                );
              })
            )}
          </div>
          {selectedMonths.length >= 3 ? (
            <p className="text-text-subtle mt-2 text-xs">
              Maximum 3 months at once. Deselect one to add another.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {rollupSlugs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-text-muted text-sm">Select at least one month to see the rollup.</p>
          </CardContent>
        </Card>
      ) : (
        rollups.map((r) => <MonthTable key={r.month} rollup={r} />)
      )}
    </div>
  );
}

// ── Month table ─────────────────────────────────────────────────────

function MonthTable({ rollup }: { rollup: MonthRollup }) {
  const month = rollup.month.slice(0, 7);
  // Region is repeated per row; surface the distinct values once in the
  // header. In practice this list is length 1 for a tenant-region but we
  // handle multi just in case (e.g. cross-region admin in a future role).
  const regions = Array.from(
    new Set(rollup.rows.map((r) => r.regionName).filter((n): n is string => !!n)),
  );

  // Currently-open parish for the details modal. Null = no modal open.
  const [openRow, setOpenRow] = useState<RegionRollupRow | null>(null);

  return (
    <Card>
      <CardContent className="p-0">
        <header className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-text text-sm font-semibold tracking-tight">{monthLabel(month)}</h3>
            {regions.map((region) => (
              <span
                key={region}
                className="bg-panel-2 text-text-muted inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium"
              >
                {region}
              </span>
            ))}
          </div>
          <p className="text-text-muted text-xs">
            {rollup.rows.length} parish{rollup.rows.length === 1 ? "" : "es"} ·{" "}
            {rollup.rows.filter((r) => r.submitted).length} submitted
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            {/*
              Two header rows. The first carries the "group banners":
                [identity: # + Parish]  →  no banner, blank
                [reported: 7 numeric cols]  →  muted "Reported"
                [remittances: 3 cols]   →  red "Remittances"
              The second carries the actual column labels. Cells in the
              first row use colSpan to span their respective groups.
            */}
            <thead>
              <tr className="text-text-muted text-xs font-semibold">
                <th colSpan={2} className="bg-panel-2 px-3 py-1.5"></th>
                <th
                  colSpan={6}
                  className="bg-panel-2 border-border border-l px-3 py-1.5 text-center"
                >
                  Reported
                </th>
                <th
                  colSpan={3}
                  className="bg-bad text-bad-fg border-bad border-l px-3 py-1.5 text-center"
                >
                  Remittances
                </th>
              </tr>
              <tr className="bg-panel-2 text-text-muted text-left">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Parish</th>
                <th className="border-border border-l px-3 py-2 text-right font-medium">
                  <abbr title="Average attendance" className="no-underline">
                    Attend
                  </abbr>
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <abbr title="Offerings" className="no-underline">
                    Offrngs
                  </abbr>
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <abbr title="Tithes" className="no-underline">
                    Tithes
                  </abbr>
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <abbr title="Thanksgiving" className="no-underline">
                    Thanks
                  </abbr>
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <abbr title="Others" className="no-underline">
                    Others
                  </abbr>
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <abbr title="Total reported income" className="no-underline">
                    Total
                  </abbr>
                </th>
                <th className="text-bad border-bad/20 border-l px-3 py-2 text-right font-medium">
                  <abbr title="5% of offerings (regional remittance)" className="no-underline">
                    5% Off
                  </abbr>
                </th>
                <th className="text-bad px-3 py-2 text-right font-medium">
                  <abbr title="20% of tithes (regional remittance)" className="no-underline">
                    20% Tth
                  </abbr>
                </th>
                <th className="text-bad px-3 py-2 text-right font-medium">
                  <abbr title="Total regional remittance" className="no-underline">
                    Remit
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {rollup.rows.map((row, idx) => (
                <RowDisplay
                  key={row.parishId}
                  row={row}
                  idx={idx}
                  onOpenDetails={() => setOpenRow(row)}
                />
              ))}
              <FooterRow totals={rollup.totals} />
            </tbody>
          </table>
        </div>
      </CardContent>
      <ParishDetailsModal row={openRow} month={month} onClose={() => setOpenRow(null)} />
    </Card>
  );
}

function RowDisplay({
  row,
  idx,
  onOpenDetails,
}: {
  row: RegionRollupRow;
  idx: number;
  onOpenDetails: () => void;
}) {
  const dim = !row.submitted ? "text-text-subtle" : "text-text";
  return (
    <tr className="border-border/30 border-t">
      <td className={cn("text-text-muted px-3 py-2 whitespace-nowrap", dim)}>{idx + 1}</td>
      {/*
        Parish cell holds only the name (truncated at 4 words). Submitted
        date lives in the details modal — it duplicated the data here.
      */}
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onOpenDetails}
          className={cn(
            "hover:text-accent block max-w-full truncate rounded-sm text-left font-medium underline decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            dim,
          )}
          title={row.parishName}
          aria-label={`View details for ${row.parishName}`}
        >
          {truncateWords(row.parishName, 4)}
        </button>
      </td>
      <td
        className={cn(
          "border-border/30 border-l px-3 py-2 text-right font-mono whitespace-nowrap",
          dim,
        )}
      >
        {fmtCount(row.avgAttendance)}
      </td>
      <td className={cn("px-3 py-2 text-right font-mono whitespace-nowrap", dim)}>
        {fmt(row.offerings)}
      </td>
      <td className={cn("px-3 py-2 text-right font-mono whitespace-nowrap", dim)}>
        {fmt(row.tithes)}
      </td>
      <td className={cn("px-3 py-2 text-right font-mono whitespace-nowrap", dim)}>
        {fmt(row.thanksgiving)}
      </td>
      <td className={cn("px-3 py-2 text-right font-mono whitespace-nowrap", dim)}>
        {fmt(row.others)}
      </td>
      <td
        className={cn("px-3 py-2 text-right font-mono font-semibold whitespace-nowrap", dim)}
      >
        {fmt(row.total)}
      </td>
      <td
        className={cn(
          "text-bad border-bad/20 border-l px-3 py-2 text-right font-mono whitespace-nowrap",
          !row.submitted && "opacity-50",
        )}
      >
        {fmt(row.expectedRegionalOffering5)}
      </td>
      <td
        className={cn(
          "text-bad px-3 py-2 text-right font-mono whitespace-nowrap",
          !row.submitted && "opacity-50",
        )}
      >
        {fmt(row.expectedRegionalTithe20)}
      </td>
      <td
        className={cn(
          "text-bad px-3 py-2 text-right font-mono font-semibold whitespace-nowrap",
          !row.submitted && "opacity-50",
        )}
      >
        {fmt(row.expectedRegionalTotal)}
      </td>
    </tr>
  );
}

function FooterRow({ totals }: { totals: RollupTotals }) {
  return (
    <tr className="border-border bg-panel-2 border-t-2 font-semibold">
      <td className="px-3 py-2"></td>
      <td className="text-text px-3 py-2">Total</td>
      <td className="border-border text-text border-l px-3 py-2 text-right font-mono">
        {fmtCount(totals.avgAttendance)}
      </td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.offerings)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.tithes)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.thanksgiving)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.others)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.total)}</td>
      <td className="text-bad border-bad/20 border-l px-3 py-2 text-right font-mono">
        {fmt(totals.expectedRegionalOffering5)}
      </td>
      <td className="text-bad px-3 py-2 text-right font-mono">
        {fmt(totals.expectedRegionalTithe20)}
      </td>
      <td className="text-bad px-3 py-2 text-right font-mono">
        {fmt(totals.expectedRegionalTotal)}
      </td>
    </tr>
  );
}

// ── Parish details modal ────────────────────────────────────────────
//
// Lightweight modal built on the native <dialog> element. We get the
// browser's built-in focus management, ESC-to-close, and inert
// background for free, and it stays portal-free (no react-dom/portal
// dance, no z-index gymnastics).
//
// Promoting this to a shared `Dialog` primitive when we need a second
// modal site is fine — for now it stays local to keep the component
// surface small.

function ParishDetailsModal({
  row,
  month,
  onClose,
}: {
  row: RegionRollupRow | null;
  month: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (row && !el.open) el.showModal();
    if (!row && el.open) el.close();
  }, [row]);

  // <dialog> fires "close" on Esc; relay it so React state stays in sync.
  const onDialogClose = () => onClose();

  // Backdrop click — <dialog>'s ::backdrop is its own click target. If the
  // click landed on the dialog element itself (not a child), treat it as
  // a backdrop hit and close.
  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onDialogClose}
      onClick={onBackdropClick}
      className="bg-panel border-border text-text fixed top-1/2 left-1/2 m-0 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[var(--radius-lg)] border p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {row ? (
        <div className="flex flex-col">
          <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <h4 className="text-text truncate text-base font-semibold tracking-tight">
                {row.parishName}
              </h4>
              <p className="text-text-muted mt-0.5 text-xs">
                {row.regionName} · {monthLabel(month)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:bg-panel-2 hover:text-text -m-1 rounded-md p-1 transition-colors"
              aria-label="Close details"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 px-5 py-4 text-sm">
            <DetailRow label="Pastor" value={row.pastorName ?? "—"} />
            <DetailRow label="Mobile" value={row.mobile ?? "—"} mono />
            <DetailRow
              label="Submitted"
              value={row.submittedAt ? formatTimestamp(row.submittedAt) : "Not submitted yet"}
              mono={!!row.submittedAt}
            />
          </dl>
        </div>
      ) : null}
    </dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-muted text-xs font-medium">{label}</dt>
      <dd className={cn("text-text", mono ? "font-mono text-xs" : "text-sm")}>{value}</dd>
    </>
  );
}

function formatTimestamp(iso: string): string {
  // "2025-12-01T10:00:00.000Z" → "2025-12-01 10:00 UTC"
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return iso;
  return `${m[1]} ${m[2]} UTC`;
}
