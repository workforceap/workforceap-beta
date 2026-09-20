import { expect, type BrowserContext, type Page } from "@playwright/test";
import {
  resolveMemberPortalCredentials,
  resolvePortalRoleCredentials,
} from "../../scripts/lib/portal-audit-auth.mjs";
import { SECTION_LOGIN_REDIRECT } from "../../scripts/lib/portal-audit-paths.mjs";

export type PortalSmokeRole = "member" | "counselor" | "employer" | "admin" | "partner";

/**
 * Cookie-based session hint for local/staging E2E. Requires a valid Supabase session
 * when NEXT_PUBLIC_SUPABASE_* are set; otherwise tests may redirect to login.
 */
export function addAuthCookie(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  const appUrl = new URL(baseURL || "http://localhost:3000");
  return context.addCookies([
    {
      name: "sb-workforceap-auth-token",
      value: "beta-session",
      domain: appUrl.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

function getVercelShareToken(): string | null {
  const shareUrl = process.env.PLAYWRIGHT_VERCEL_SHARE_URL?.trim();
  if (!shareUrl) return null;
  try {
    const u = new URL(shareUrl);
    return u.searchParams.get("_vercel_share");
  } catch {
    return null;
  }
}

async function bootstrapVercelShareCookie(page: Page): Promise<void> {
  const shareUrl = process.env.PLAYWRIGHT_VERCEL_SHARE_URL?.trim();
  if (!shareUrl) return;
  await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
}

async function dismissCookieBanner(page: Page): Promise<void> {
  await page.getByRole("button", { name: /decline/i }).click().catch(() => {});
}

/** Real login against deployed site (prod/staging). Never commit values — set in shell or CI secrets. */
export function hasProdE2ECredentials(): boolean {
  const { email, password } = resolveMemberPortalCredentials(process.env);
  return Boolean(email && password);
}


/** Admin credentials check */
export function hasAdminE2ECredentials(): boolean {
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.replace(/\r$/, "")?.trim();
  return Boolean(email && password);
}

/**
 * UI login (matches LoginForm: Email + Password + Sign In button).
 * Requires E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD.
 */
export async function loginMemberPortal(page: Page): Promise<void> {
  const { email, password } = resolveMemberPortalCredentials(process.env);
  if (!email || !password) {
    throw new Error(
      "Set E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD (legacy aliases PLAYWRIGHT_MEMBER_EMAIL / PLAYWRIGHT_PORTAL_PASSWORD still work)"
    );
  }
  await bootstrapVercelShareCookie(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);
  await page.locator("#email").click();
  await page.locator("#email").fill(email);
  await page.locator("#password").click();
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 60_000 });
  const path = new URL(page.url()).pathname;
  if (!path.startsWith("/dashboard")) {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  }
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 20_000 });
}

/**
 * UI login as admin.
 * Requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.
 */
export async function loginAdminPortal(page: Page): Promise<void> {
  await loginPortalRole(page, "admin");
}

/** Dedicated E2E_* pair present for a portal role (member accepts legacy PLAYWRIGHT_*). */
export function hasPortalRoleCredentials(role: PortalSmokeRole): boolean {
  const { email, password } = resolvePortalRoleCredentials(role, process.env);
  return Boolean(email && password);
}

/**
 * UI login for a dedicated portal role identity.
 * Requires E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD (member also accepts legacy aliases).
 */
export async function loginPortalRole(page: Page, role: PortalSmokeRole): Promise<void> {
  const { email, password } = resolvePortalRoleCredentials(role, process.env);
  if (!email || !password) {
    const prefix = `E2E_${role.toUpperCase()}`;
    throw new Error(`Set ${prefix}_EMAIL and ${prefix}_PASSWORD`);
  }
  const hub = SECTION_LOGIN_REDIRECT[role];
  await bootstrapVercelShareCookie(page);
  await page.goto(`/login?redirectTo=${encodeURIComponent(hub)}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissCookieBanner(page);
  await page.locator("#email").click();
  await page.locator("#email").fill(email);
  await page.locator("#password").click();
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 60_000 });
  const path = new URL(page.url()).pathname;
  if (!(path === hub || path.startsWith(`${hub}/`))) {
    await page.goto(hub, { waitUntil: "domcontentloaded" });
  }
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 20_000 });
}
