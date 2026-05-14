// Access check — answers "does this user have a role for mReport within
// this tenant?"
//
// Ported from event-calendar/lib/auth/access.ts with one critical
// difference: the role vocabulary. mReport defines its own roles
// (`super_admin / regional_admin / parish_admin / preparer`) in
// core_tenant_user_roles.role where app_id is mReport's id. event-calendar
// uses (`member / lead / admin / superadmin`).
//
// Order of operations (same as event-calendar):
//   1. User must exist in core_users (bail early if not).
//   2. Tenant must exist and be active.
//   3. Platform admin (is_platform_admin=true) bypasses everything.
//   4. App must exist.
//   5. Tenant must have the app enabled (core_tenant_apps.enabled=true).
//   6. User must have a role for (tenant, app) in core_tenant_user_roles.
//
// SECURITY:
// - All checks are server-side. Never trust client-side role hints.
// - Queries are parameterized.
// - Platform admins still respect tenant isolation in DATA queries.
//   This function only governs access; data queries must still scope
//   by tenantId.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coreApps,
  coreTenantApps,
  coreTenantUserRoles,
  coreTenantUsers,
  coreTenants,
  coreUsers,
} from "@/lib/db/schema/core";

/**
 * Roles mReport itself recognizes, plus `platform_admin` for the
 * is_platform_admin bypass case. The DB column is `text` not an enum
 * (because core_tenant_user_roles is shared across apps), so we validate
 * the role string explicitly.
 */
export type AccessRole =
  | "super_admin"
  | "regional_admin"
  | "parish_admin"
  | "preparer"
  | "platform_admin";

export type AccessResult =
  | { allowed: true; role: AccessRole; tenantId: string }
  | { allowed: false; reason: AccessDenialReason };

export type AccessDenialReason =
  | "user_not_found"
  | "tenant_not_found"
  | "app_not_found"
  | "app_not_enabled"
  | "no_role";

const VALID_ROLES: ReadonlyArray<AccessRole> = [
  "super_admin",
  "regional_admin",
  "parish_admin",
  "preparer",
  "platform_admin",
];

export async function checkAccess(
  userId: string,
  tenantSlug: string,
  appSlug: string,
): Promise<AccessResult> {
  // 1. Look up the user. Bail early if they don't exist.
  const user = await db
    .select({
      id: coreUsers.id,
      is_platform_admin: coreUsers.is_platform_admin,
    })
    .from(coreUsers)
    .where(eq(coreUsers.id, userId))
    .limit(1);
  if (!user[0]) return { allowed: false, reason: "user_not_found" };

  // 2. Resolve the tenant.
  const tenant = await db
    .select({ id: coreTenants.id })
    .from(coreTenants)
    .where(and(eq(coreTenants.slug, tenantSlug), eq(coreTenants.status, "active")))
    .limit(1);
  if (!tenant[0]) return { allowed: false, reason: "tenant_not_found" };

  // Platform admin bypass — but only AFTER tenant is resolved, so the
  // returned tenantId is valid. This way, data queries downstream still
  // get a real tenant context to scope on.
  if (user[0].is_platform_admin) {
    return { allowed: true, role: "platform_admin", tenantId: tenant[0].id };
  }

  // 3. Resolve the app.
  const app = await db
    .select({ id: coreApps.id })
    .from(coreApps)
    .where(eq(coreApps.slug, appSlug))
    .limit(1);
  if (!app[0]) return { allowed: false, reason: "app_not_found" };

  // 4. Tenant must have the app enabled.
  const tenantApp = await db
    .select({ enabled: coreTenantApps.enabled })
    .from(coreTenantApps)
    .where(and(eq(coreTenantApps.tenant_id, tenant[0].id), eq(coreTenantApps.app_id, app[0].id)))
    .limit(1);
  if (!tenantApp[0]?.enabled) return { allowed: false, reason: "app_not_enabled" };

  // 5. User must have a role for (tenant, app).
  const roleRow = await db
    .select({ role: coreTenantUserRoles.role })
    .from(coreTenantUserRoles)
    .where(
      and(
        eq(coreTenantUserRoles.tenant_id, tenant[0].id),
        eq(coreTenantUserRoles.user_id, userId),
        eq(coreTenantUserRoles.app_id, app[0].id),
      ),
    )
    .limit(1);
  if (!roleRow[0]) return { allowed: false, reason: "no_role" };

  // Validate the role string against the known mReport vocabulary. The DB
  // column is text, so a stale row with an unknown role (e.g., one set by
  // a different app's UI by mistake) should be treated as "no role" rather
  // than passing through as an arbitrary string.
  const role = roleRow[0].role as AccessRole;
  if (!VALID_ROLES.includes(role)) {
    return { allowed: false, reason: "no_role" };
  }

  return { allowed: true, role, tenantId: tenant[0].id };
}

/**
 * Tenant-membership predicate.
 *
 * Returns true if the user is an ACTIVE member of the tenant — i.e.
 * a row exists in core_tenant_users with status='active'. Platform
 * admins are always considered members of every tenant.
 *
 * Use this on authenticated endpoints that aren't app-scoped (e.g.
 * cross-app surfaces, the platform launcher) to make sure the caller
 * actually belongs to the tenant whose data they're requesting.
 *
 * SECURITY: parameterized query, tenant_id and user_id both required.
 */
export async function isTenantMember(userId: string, tenantId: string): Promise<boolean> {
  // Platform admin bypass — they have access to every tenant by design.
  const platform = await db
    .select({ is_platform_admin: coreUsers.is_platform_admin })
    .from(coreUsers)
    .where(eq(coreUsers.id, userId))
    .limit(1);
  if (platform[0]?.is_platform_admin) return true;

  const member = await db
    .select({ tenant_id: coreTenantUsers.tenant_id })
    .from(coreTenantUsers)
    .where(
      and(
        eq(coreTenantUsers.tenant_id, tenantId),
        eq(coreTenantUsers.user_id, userId),
        eq(coreTenantUsers.status, "active"),
      ),
    )
    .limit(1);
  return member.length > 0;
}
