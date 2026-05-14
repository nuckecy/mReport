import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the auth-gated routes.
 *
 * On the bare `127.0.0.1:3000` host (no tenant context), every
 * tenant-scoped page bounces to the workspace picker. The picker
 * preserves the originally-requested path in `?next=` so the user
 * lands there after they pick a workspace.
 */

test("bare-host / redirects to /workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/workspace/);
});

test("anonymous /upload bounces to /workspace?next=%2Fupload", async ({ page }) => {
  await page.goto("/upload");
  await expect(page).toHaveURL(/\/workspace\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/upload");
});

for (const path of ["/admin", "/admin/reports", "/admin/members"]) {
  test(`anonymous ${path} bounces to /workspace`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/workspace\?next=/);
    // The admin layout uses a single `requireAdmin()` call without a
    // path arg, so all three admin entry points redirect with the same
    // fallback `next=/admin/reports`. Deep-link preservation across
    // admin sub-routes is filed under Slice 1.5.
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/reports");
  });
}

test("anonymous /no-access redirects to /login", async ({ page }) => {
  // /no-access doesn't require a tenant — it's the friendly fallback for
  // signed-in-but-roleless users. Anonymous visitors get bounced to login.
  await page.goto("/no-access");
  await expect(page).toHaveURL(/\/login/);
});

test("/workspace renders the picker form", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: /which workspace/i })).toBeVisible();
  await expect(page.getByLabel(/workspace/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
});
