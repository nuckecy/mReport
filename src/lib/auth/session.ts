// Session helpers — the entry point for "who is making this request?"
//
// Ported from event-calendar/lib/auth/session.ts with two differences:
//   1. The default `appSlug` is "mreport" (not "cem").
//   2. The role enum is mReport's vocabulary (super_admin / regional_admin /
//      parish_admin / preparer + platform_admin bypass).
//
// Two layers:
//   1. getPlatformSession()  → { userId, tenantId, email, name }
//      Used by app-agnostic surfaces (e.g. a cross-app launcher).
//      No role information.
//   2. getSession({ appSlug }) → AppSession with `role` for that app.
//      Used by app-specific pages and route handlers. The `role` field
//      is scoped to the passed appSlug. A user can hold different roles
//      in mReport vs event-calendar vs any other platform app.
//
// SECURITY:
// - Uses Supabase's `getUser()` which re-validates the JWT against the
//   Auth server (per Supabase SSR docs: never use `getSession()` for
//   authorization).
// - Tenant context comes from middleware-injected request headers
//   (`x-tenant-id`, `x-tenant-slug`, `x-domain-type`), validated by
//   `readTenantContextFromHeaders` (UUID-shape check + presence check).
// - Role check delegated to `checkAccess()`, which performs server-side
//   resolution against `core_tenant_user_roles`.
// - All three of (user, tenant, role) must succeed for `getSession()`
//   to return a session object. Otherwise returns null — the caller
//   decides whether to redirect, 401, or render a public view.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { coreUsers } from "@/lib/db/schema/core";
import { mreportRegions, mreportParishes, mreportUserScopes } from "@/lib/db/schema/mreport";
import { checkAccess, isTenantMember, type AccessRole } from "./access";
import { readTenantContextFromHeaders } from "@/lib/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Default appSlug for mReport callers. */
export const MREPORT_APP_SLUG = "mreport";

export type AppSession = {
  userId: string;
  email: string | null;
  name: string | null;
  tenantId: string;
  tenantSlug: string;
  role: AccessRole;
  appSlug: string;
  /**
   * mReport-specific scope (region/parish) for the user, if any. Populated
   * from mreport_user_scopes. super_admin and platform_admin won't have
   * a scope row — the field will be `null` for them, and they have full
   * tenant-wide access in mReport.
   */
  scope: AppScope | null;
};

export type AppScope = {
  regionId: string | null;
  regionName: string | null;
  parishId: string | null;
  parishName: string | null;
};

export type GetSessionOptions = {
  /** Default: "mreport". Override for other apps in the same tenant. */
  appSlug?: string;
};

export type PlatformSession = {
  userId: string;
  email: string | null;
  name: string | null;
  tenantId: string;
  tenantSlug: string;
};

/**
 * App-agnostic session: only "who" and "where" — no role. Use this on
 * surfaces that span multiple apps (launcher) or precede app
 * resolution (e.g. cross-app notification queries that fan out per-app
 * role checks elsewhere).
 *
 * Also verifies tenant membership via core_tenant_users so a user who
 * authenticates against the platform but isn't a member of the tenant
 * implied by the subdomain gets null.
 */
export async function getPlatformSession(): Promise<PlatformSession | null> {
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);
  if (!tenant) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const member = await isTenantMember(user.id, tenant.tenantId);
  if (!member) return null;

  // Pull display name from core_users (canonical) with fallback to
  // Supabase user_metadata (in case core_users isn't seeded yet).
  const coreUser = await db
    .select({ name: coreUsers.name })
    .from(coreUsers)
    .where(eq(coreUsers.id, user.id))
    .limit(1);

  return {
    userId: user.id,
    email: user.email ?? null,
    name: coreUser[0]?.name ?? (user.user_metadata?.name as string | undefined) ?? null,
    tenantId: tenant.tenantId,
    tenantSlug: tenant.tenantSlug,
  };
}

/**
 * Returns the current session (user + tenant + role + scope) or null.
 *
 * Returns null in any of these cases:
 *  - User not signed in (no Supabase session)
 *  - Request not running in a tenant context (e.g. platform domain)
 *  - User has no role for this tenant + app combination
 *
 * Callers should handle null explicitly — for protected routes use
 * `requireAuth()` which redirects to /login.
 */
export async function getSession(opts: GetSessionOptions = {}): Promise<AppSession | null> {
  const appSlug = opts.appSlug ?? MREPORT_APP_SLUG;

  // 1. Tenant context from middleware headers.
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);
  if (!tenant) return null;

  // 2. Authenticated Supabase user (re-validated against Auth server).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  // 3. Authorization — does this user have a role for this tenant+app?
  const access = await checkAccess(user.id, tenant.tenantSlug, appSlug);
  if (!access.allowed) return null;

  // 4. Display name from core_users.
  const coreUser = await db
    .select({ name: coreUsers.name })
    .from(coreUsers)
    .where(eq(coreUsers.id, user.id))
    .limit(1);

  // 5. mReport scope (region/parish) if applicable. Only relevant when
  //    appSlug === MREPORT_APP_SLUG; for other apps we skip the lookup
  //    so we don't waste a query.
  let scope: AppScope | null = null;
  if (
    appSlug === MREPORT_APP_SLUG &&
    access.role !== "super_admin" &&
    access.role !== "platform_admin"
  ) {
    const scopeRow = await db
      .select({
        regionId: mreportUserScopes.region_id,
        parishId: mreportUserScopes.parish_id,
        regionName: mreportRegions.name,
        parishName: mreportParishes.name,
      })
      .from(mreportUserScopes)
      .leftJoin(mreportRegions, eq(mreportRegions.id, mreportUserScopes.region_id))
      .leftJoin(mreportParishes, eq(mreportParishes.id, mreportUserScopes.parish_id))
      .where(
        and(
          eq(mreportUserScopes.tenant_id, access.tenantId),
          eq(mreportUserScopes.user_id, user.id),
        ),
      )
      .limit(1);
    if (scopeRow[0]) {
      scope = {
        regionId: scopeRow[0].regionId,
        regionName: scopeRow[0].regionName,
        parishId: scopeRow[0].parishId,
        parishName: scopeRow[0].parishName,
      };
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    name: coreUser[0]?.name ?? (user.user_metadata?.name as string | undefined) ?? null,
    tenantId: access.tenantId,
    tenantSlug: tenant.tenantSlug,
    role: access.role,
    appSlug,
    scope,
  };
}

/**
 * Like `getSession()` but redirects to `/login` if not authenticated,
 * or `/no-access` if signed-in but lacking a role for this tenant+app.
 *
 * Use in protected layouts / server components.
 */
export async function requireAuth(opts: GetSessionOptions = {}): Promise<AppSession> {
  const session = await getSession(opts);
  if (session) return session;

  // Differentiate "not signed in" from "no role" so we redirect to the
  // right place. Re-resolve tenant + supabase user; if no user → /login,
  // if user but no role → /no-access.
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);
  if (!tenant) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const path = requestHeaders.get("x-pathname") ?? "/";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  redirect("/no-access");
}

/**
 * Role-based default screen after login. Slice 1 has only the upload
 * page; later slices add admin pages. This stub is here so login flow
 * (Day 3) can call it consistently.
 */
export function defaultLandingForRole(role: AccessRole): string {
  switch (role) {
    case "super_admin":
    case "platform_admin":
      return "/admin/reports";
    case "regional_admin":
    case "parish_admin":
      return "/admin/reports";
    case "preparer":
    default:
      return "/upload";
  }
}
