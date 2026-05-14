import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { coreTenants } from "@/lib/db/schema/core";
import { getSession } from "@/lib/auth/session";
import { getDefaultMonths, getRegionRollup, listAvailableMonths } from "@/lib/region/queries";
import { RegionView } from "./RegionView";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Parse the months query string into a clean YYYY-MM array, max 3.
 * Anything malformed is dropped.
 */
function parseMonths(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.split(",");
  const re = /^\d{4}-(0[1-9]|1[0-2])$/;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of list) {
    const trimmed = m.trim();
    if (re.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
      if (out.length >= 3) break;
    }
  }
  return out;
}

export default async function RegionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session) return null; // layout enforces admin

  const params = await searchParams;
  const monthsFromUrl = parseMonths(params.months);
  const months =
    monthsFromUrl.length > 0 ? monthsFromUrl : await getDefaultMonths(session.tenantId, 3);

  const [rollups, availableMonths, tenantRow] = await Promise.all([
    getRegionRollup(session.tenantId, months),
    listAvailableMonths(session.tenantId),
    db
      .select({ name: coreTenants.name })
      .from(coreTenants)
      .where(eq(coreTenants.id, session.tenantId))
      .limit(1),
  ]);
  const tenantName = tenantRow[0]?.name ?? session.tenantSlug;

  return (
    <RegionView
      tenantName={tenantName}
      selectedMonths={months}
      availableMonths={availableMonths}
      rollups={rollups}
    />
  );
}
