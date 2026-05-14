"use client";

// Filter bar for /admin/reports. State lives in the URL — selecting a
// filter pushes a new ?parish=...&month=... etc., which re-renders the
// server component with fresh data.

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ParishOption, ReportFilters } from "@/lib/reports/queries";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "submitted", label: "Submitted" },
  { value: "amended", label: "Amended" },
  { value: "superseded", label: "Superseded" },
] as const;

export interface ReportsFiltersProps {
  parishes: ParishOption[];
  months: string[];
  initialFilters: ReportFilters;
}

export function ReportsFilters({ parishes, months, initialFilters }: ReportsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: "parish" | "month" | "status", value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`/admin/reports?${params.toString()}`, { scroll: false });
    });
  };

  const clear = () => {
    startTransition(() => {
      router.push("/admin/reports", { scroll: false });
    });
  };

  const hasFilters = !!(initialFilters.parishId || initialFilters.month || initialFilters.status);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <FilterField label="Parish">
          <select
            value={initialFilters.parishId ?? ""}
            onChange={(e) => update("parish", e.target.value)}
            disabled={pending}
            className="border-border bg-panel text-text focus-visible:border-accent h-9 min-w-[180px] rounded-[var(--radius-md)] border px-2 text-sm outline-none"
          >
            <option value="">All parishes</option>
            {parishes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.regionName}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Month">
          <select
            value={initialFilters.month ?? ""}
            onChange={(e) => update("month", e.target.value)}
            disabled={pending}
            className="border-border bg-panel text-text focus-visible:border-accent h-9 min-w-[140px] rounded-[var(--radius-md)] border px-2 text-sm outline-none"
          >
            <option value="">Any month</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Status">
          <select
            value={initialFilters.status ?? ""}
            onChange={(e) => update("status", e.target.value)}
            disabled={pending}
            className="border-border bg-panel text-text focus-visible:border-accent h-9 min-w-[140px] rounded-[var(--radius-md)] border px-2 text-sm outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FilterField>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
            <X className="size-4" aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-text-muted text-xs font-medium tracking-wide uppercase">{label}</span>
      {children}
    </div>
  );
}
