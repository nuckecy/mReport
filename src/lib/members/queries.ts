// Read-side queries for the members admin page.
//
// We join across four tables to assemble each Member row:
//   - core_users           (display name, email, platform_admin flag)
//   - core_tenant_users    (active vs deactivated membership status)
//   - core_tenant_user_roles  (mReport role string for this tenant + app)
//   - mreport_user_scopes  (region/parish scope, if applicable)
//   - mreport_regions / mreport_parishes  (denormalize names for display)
//
// All queries are scoped to the caller's tenant_id. The caller MUST have
// already passed `requireAdmin()` — this module does not enforce auth.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { coreApps, coreTenantUserRoles, coreTenantUsers, coreUsers } from "@/lib/db/schema/core";
import { mreportParishes, mreportRegions, mreportUserScopes } from "@/lib/db/schema/mreport";

export type MemberRole = "super_admin" | "regional_admin" | "parish_admin" | "preparer" | null; // null when the user is a tenant member but lacks an mReport role

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  membershipStatus: "active" | "deactivated";
  role: MemberRole;
  regionId: string | null;
  regionName: string | null;
  parishId: string | null;
  parishName: string | null;
}

const MREPORT_APP_SLUG = "mreport";

/**
 * List every member of the tenant who has an mReport-related row
 * (membership, role, or scope) — sorted by display name then email.
 *
 * Tenant members WITHOUT any mReport activity also show up (so the
 * admin can grant them a role from this page). That's the LEFT JOIN
 * from `core_tenant_users`.
 */
export async function listMembers(tenantId: string): Promise<Member[]> {
  const rows = await db
    .select({
      userId: coreTenantUsers.user_id,
      email: coreUsers.email,
      name: coreUsers.name,
      isPlatformAdmin: coreUsers.is_platform_admin,
      membershipStatus: coreTenantUsers.status,
      role: coreTenantUserRoles.role,
      regionId: mreportUserScopes.region_id,
      regionName: mreportRegions.name,
      parishId: mreportUserScopes.parish_id,
      parishName: mreportParishes.name,
    })
    .from(coreTenantUsers)
    .innerJoin(coreUsers, eq(coreUsers.id, coreTenantUsers.user_id))
    .leftJoin(coreApps, and(eq(coreApps.slug, MREPORT_APP_SLUG)))
    .leftJoin(
      coreTenantUserRoles,
      and(
        eq(coreTenantUserRoles.tenant_id, coreTenantUsers.tenant_id),
        eq(coreTenantUserRoles.user_id, coreTenantUsers.user_id),
        eq(coreTenantUserRoles.app_id, coreApps.id),
      ),
    )
    .leftJoin(
      mreportUserScopes,
      and(
        eq(mreportUserScopes.tenant_id, coreTenantUsers.tenant_id),
        eq(mreportUserScopes.user_id, coreTenantUsers.user_id),
      ),
    )
    .leftJoin(mreportRegions, eq(mreportRegions.id, mreportUserScopes.region_id))
    .leftJoin(mreportParishes, eq(mreportParishes.id, mreportUserScopes.parish_id))
    .where(eq(coreTenantUsers.tenant_id, tenantId))
    .orderBy(sql`coalesce(${coreUsers.name}, ${coreUsers.email})`);

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    isPlatformAdmin: !!r.isPlatformAdmin,
    membershipStatus: (r.membershipStatus ?? "active") as "active" | "deactivated",
    role: (r.role as MemberRole) ?? null,
    regionId: r.regionId,
    regionName: r.regionName,
    parishId: r.parishId,
    parishName: r.parishName,
  }));
}

/** Look up regions + parishes for the tenant — used by the invite form. */
export interface ScopeOption {
  type: "region" | "parish";
  id: string;
  label: string;
  /** For parishes: which region they belong to (for grouping). */
  regionId?: string;
}

export async function listScopeOptions(tenantId: string): Promise<ScopeOption[]> {
  const regions = await db
    .select({ id: mreportRegions.id, name: mreportRegions.name })
    .from(mreportRegions)
    .where(eq(mreportRegions.tenant_id, tenantId))
    .orderBy(mreportRegions.name);

  const parishes = await db
    .select({
      id: mreportParishes.id,
      name: mreportParishes.name,
      regionId: mreportParishes.region_id,
    })
    .from(mreportParishes)
    .where(eq(mreportParishes.tenant_id, tenantId))
    .orderBy(mreportParishes.name);

  return [
    ...regions.map((r) => ({ type: "region" as const, id: r.id, label: r.name })),
    ...parishes.map((p) => ({
      type: "parish" as const,
      id: p.id,
      label: p.name,
      regionId: p.regionId,
    })),
  ];
}
