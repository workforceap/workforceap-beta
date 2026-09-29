import { test, expect } from "@playwright/test";
import { hasProdE2ECredentials, loginMemberPortal } from "./auth-helpers";

/** Mobile viewport for low-income, mobile-first ICP testing */
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe("Member login + dashboard", () => {
  test.beforeEach(() => {
    test.skip(!hasProdE2ECredentials(), "Set E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD");
  });

  test("login redirects to dashboard and key elements exist", async ({ page }) => {
    await loginMemberPortal(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/welcome back|welcome to workforceap/i)).toBeVisible();
    await expect(page.getByText(/training|progress|courses/i).first()).toBeVisible();
    await expect(page.getByText('Certification path')).toBeVisible();
  });

  test("dashboard loads on mobile viewport", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginMemberPortal(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/welcome back|welcome to workforceap/i)).toBeVisible();
  });

  // The mobile 2x2 quick-action grid went with the retired ?ui=legacy home
  // (WAP-195); phone and desktop now share the kit home.
  test("dashboard shows the kit home cards on mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginMemberPortal(page);
    await expect(page.getByText("Certification path")).toBeVisible({ timeout: 10000 });
  });

  test("dashboard navigation links work", async ({ page }) => {
    await loginMemberPortal(page);
    const aiToolsLink = page.getByRole("link", { name: /ai tools|career toolkit/i }).first();
    await expect(aiToolsLink).toBeVisible();
    const trainingLink = page.getByRole("link", { name: /my training|training/i }).first();
    await expect(trainingLink).toBeVisible();
  });
});
