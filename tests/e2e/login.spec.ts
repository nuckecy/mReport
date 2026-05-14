import { expect, test } from "@playwright/test";

/**
 * Login flow smoke tests.
 *
 * These run against the dev server (no real Supabase). We don't test the
 * full magic-link round-trip because:
 *   - The link arrives by email; capturing it requires Supabase test hooks
 *     we haven't set up yet.
 *   - The signed-in-state branches are exercised in Day 4 once we add
 *     authenticated routes.
 *
 * What we DO test:
 *   - The page renders the email form with correct labelling.
 *   - Submitting an invalid email surfaces an inline error.
 *   - The callback-error indicator (?e=expired) renders a recovery message.
 */

test.describe("/login", () => {
  test("renders the magic-link email form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /sign in to mreport/i })).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send sign-in link/i })).toBeVisible();
  });

  test("shows an inline error when the email is invalid", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/work email/i).fill("not-an-email");
    await page.getByRole("button", { name: /send sign-in link/i }).click();

    await expect(page.getByRole("alert")).toContainText(/valid email/i);
  });

  test("surfaces a callback error from the query string", async ({ page }) => {
    await page.goto("/login?e=expired");

    await expect(page.getByRole("alert")).toContainText(/expired/i);
  });
});
