import { expect, test } from "@playwright/test";

/**
 * Landing-page smoke tests.
 *
 * On the bare host (no tenant context), `/` redirects to the workspace
 * picker — the landing page proper only renders under a tenant subdomain.
 *
 * In Playwright we only have the bare host (`127.0.0.1`), so we test
 * the workspace-picker landing here. The full landing-page render
 * (with Upload + Log in buttons) is exercised indirectly via the
 * /workspace → tenant-subdomain flow in production.
 */
test("bare-host landing redirects to /workspace and shows the picker", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/workspace/);
  await expect(page.getByRole("heading", { name: /which workspace/i })).toBeVisible();
});
