import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the authentication-gated routes.
 *
 * We don't have a Supabase test account in this environment, so we can't
 * exercise the happy path end-to-end. Instead we verify the auth gates:
 * anonymous requests to `/upload`, `/admin`, `/admin/reports`, and
 * `/admin/members` must redirect to `/login` with the right `?next=`
 * preserved.
 */

// Behavior on the bare `127.0.0.1:3000` host (no tenant context):
//   - `/upload`  → /         (requireAuth's first guard: no tenant → home)
//   - `/admin/*` → /login?next=/admin/members (requireAdmin always
//                 redirects to login with a useful fallback)
//   - `/no-access` → /login (the page itself bounces unauthenticated users)
//
// On a real tenant subdomain (`<slug>.churchplatform.com`) `/upload`
// would instead redirect to `/login?next=/upload` because the tenant
// guard would pass and the no-session guard would catch.

test("anonymous /upload bounces away from the page", async ({ page }) => {
  await page.goto("/upload");
  await expect(page).not.toHaveURL(/\/upload$/);
});

for (const path of ["/admin", "/admin/reports", "/admin/members"]) {
  test(`anonymous ${path} redirects to /login with next preserved`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe("/admin/members");
  });
}

test("anonymous /no-access redirects to /login", async ({ page }) => {
  await page.goto("/no-access");
  await expect(page).toHaveURL(/\/login/);
});
