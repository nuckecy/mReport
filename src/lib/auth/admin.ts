// Admin authorization helpers.
//
// Day 6 scope: only `super_admin` (mReport role) or `platform_admin`
// (is_platform_admin bypass) can access `/admin/*` routes. Scoped admins
// (regional_admin, parish_admin) get more nuanced surfaces in Day 6.5/7.
//
// This module intentionally has a narrow API — one function. Each admin
// page calls `requireAdmin()` at the top of its server component or
// action handler and redirects unauthorised users to /no-access. The
// server action equivalents also redirect (no soft-failure mode) because
// admin actions never run from public surfaces.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type AppSession } from "./session";
import { readTenantContextFromHeaders } from "@/lib/tenant";

export type RequireAdminOptions = {
  /**
   * Path to preserve in `?next=` when redirecting to /workspace or
   * /login. Caller-supplied so we can preserve the original deep link
   * (Next 16's middleware header forwarding to RSCs isn't reliable).
   */
  next?: string;
};

/**
 * Resolve the current admin session.
 *
 * Allowed roles: `super_admin`, `platform_admin`.
 * Anything else → redirect to /no-access (the user is signed in but
 * doesn't have admin rights).
 *
 * Three failure paths:
 *   - No tenant context → /workspace?next=<path>  (user is on the bare
 *     platform domain — they need to pick a workspace first)
 *   - No session → /login?next=<path>             (tenant is fine, but
 *     they're not signed in)
 *   - Signed in but wrong role → /no-access
 */
export async function requireAdmin(opts: RequireAdminOptions = {}): Promise<AppSession> {
  const requestHeaders = await headers();
  const tenant = readTenantContextFromHeaders(requestHeaders);
  const path = opts.next ?? requestHeaders.get("x-pathname") ?? "/admin/reports";

  if (!tenant) {
    redirect(`/workspace?next=${encodeURIComponent(path)}`);
  }

  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (!isAdminRole(session.role)) {
    redirect("/no-access");
  }
  return session;
}

/** Pure predicate — useful in client UI to hide buttons too. */
export function isAdminRole(role: string): boolean {
  return role === "super_admin" || role === "platform_admin";
}
