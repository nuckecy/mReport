"use client";

// Region rollup view — one table per selected month.
//
// State is URL-driven: ?months=2025-12,2025-11,2025-10 picks the
// months. We cap at 3 to match the user's stated requirement. The
// month-picker is a small "chip" panel of recent + checked-state
// months; selecting/deselecting one updates the URL and re-fetches
// the server data.

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmt, fmtInt } from "@/lib/format";
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
            <span className="text-text-muted text-xs font-medium tracking-wide uppercase">
              Months
            </span>
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
  return (
    <Card>
      <CardContent className="p-0">
        <header className="border-border flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-text text-sm font-semibold tracking-tight">{monthLabel(month)}</h3>
          <p className="text-text-muted text-xs">
            {rollup.rows.length} parish{rollup.rows.length === 1 ? "" : "es"} ·{" "}
            {rollup.rows.filter((r) => r.submitted).length} submitted
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-panel-2 text-text-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Parish</th>
                <th className="px-3 py-2 font-medium">Mobile</th>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Pastor</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 text-right font-medium">Av Attd</th>
                <th className="px-3 py-2 text-right font-medium">Offerings</th>
                <th className="px-3 py-2 text-right font-medium">Tithes</th>
                <th className="px-3 py-2 text-right font-medium">Thanksgiving</th>
                <th className="px-3 py-2 text-right font-medium">Others</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="text-bad px-3 py-2 text-right font-medium">5% Off.</th>
                <th className="text-bad px-3 py-2 text-right font-medium">20% Tithe</th>
                <th className="text-bad px-3 py-2 text-right font-medium">Remit Total</th>
              </tr>
            </thead>
            <tbody>
              {rollup.rows.map((row, idx) => (
                <RowDisplay key={row.parishId} row={row} idx={idx} />
              ))}
              <FooterRow totals={rollup.totals} />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RowDisplay({ row, idx }: { row: RegionRollupRow; idx: number }) {
  const dim = !row.submitted ? "text-text-subtle" : "text-text";
  const submittedAt = row.submittedAt ? row.submittedAt.slice(0, 10) : "—";
  return (
    <tr className="border-border/30 border-t">
      <td className={cn("text-text-muted px-3 py-2", dim)}>{idx + 1}</td>
      <td className={cn("px-3 py-2 font-medium", dim)}>{row.parishName}</td>
      <td className="text-text-muted px-3 py-2 font-mono text-xs">{row.mobile ?? "—"}</td>
      <td className="text-text-muted px-3 py-2">{row.regionName}</td>
      <td className={cn("px-3 py-2", dim)}>{row.pastorName ?? "—"}</td>
      <td className="text-text-muted px-3 py-2 font-mono text-xs">{submittedAt}</td>
      <td className={cn("px-3 py-2 text-right font-mono", dim)}>{fmtInt(row.avgAttendance)}</td>
      <td className={cn("px-3 py-2 text-right font-mono", dim)}>{fmt(row.offerings)}</td>
      <td className={cn("px-3 py-2 text-right font-mono", dim)}>{fmt(row.tithes)}</td>
      <td className={cn("px-3 py-2 text-right font-mono", dim)}>{fmt(row.thanksgiving)}</td>
      <td className={cn("px-3 py-2 text-right font-mono", dim)}>{fmt(row.others)}</td>
      <td className={cn("px-3 py-2 text-right font-mono font-semibold", dim)}>{fmt(row.total)}</td>
      <td className={cn("text-bad px-3 py-2 text-right font-mono", !row.submitted && "opacity-50")}>
        {fmt(row.expectedRegionalOffering5)}
      </td>
      <td className={cn("text-bad px-3 py-2 text-right font-mono", !row.submitted && "opacity-50")}>
        {fmt(row.expectedRegionalTithe20)}
      </td>
      <td
        className={cn(
          "text-bad px-3 py-2 text-right font-mono font-semibold",
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
      <td className="text-text px-3 py-2 tracking-wide uppercase">Total</td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmtInt(totals.avgAttendance)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.offerings)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.tithes)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.thanksgiving)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.others)}</td>
      <td className="text-text px-3 py-2 text-right font-mono">{fmt(totals.total)}</td>
      <td className="text-bad px-3 py-2 text-right font-mono">
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
