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

import { redirect } from "next/navigation";
import { getSession, type AppSession } from "./session";

/**
 * Resolve the current admin session.
 *
 * Allowed roles: `super_admin`, `platform_admin`.
 * Anything else → redirect to /no-access (the user is signed in but
 * doesn't have admin rights).
 */
export async function requireAdmin(): Promise<AppSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
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
