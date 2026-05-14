import { expect, test } from "@playwright/test";

/**
 * Smoke test for the landing page. Confirms the build and routing are wired
 * end-to-end. Real flows arrive once the upload + auth pages exist.
 */
test("landing page renders both entry buttons", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "mReport" })).toBeVisible();
  await expect(page.getByRole("button", { name: /upload report/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
});
