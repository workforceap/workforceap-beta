import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loginPortalRole, type PortalSmokeRole } from './auth-helpers';
import { resolvePortalRoleCredentials } from '../../scripts/lib/portal-audit-auth.mjs';
import {
  assertDeploymentAcceptedReadOnlyAudit,
  assertReadOnlyAuditCookieInstalled,
  installReadOnlyAuditCookie,
} from '../../scripts/lib/portal-audit-cookie.mjs';

const PAGES = {
  admin: ['/admin', '/admin/overview', '/admin/students', '/admin/members/:member', '/admin/reporting', '/admin/jobs?filter=all'],
  counselor: ['/counselor/today', '/counselor/overview', '/counselor/students', '/counselor/students/:member', '/counselor/triage', '/counselor/placements'],
  employer: ['/employer', '/employer/applications', '/employer/jobs', '/employer/pipeline'],
  partner: ['/partner', '/partner/referred-members', '/partner/outcomes', '/partner/attention'],
} as const;
const widths = [1440, 1024, 390];
const baselineOrigin = (process.env.PORTAL_C_STAFF_BASELINE_URL ?? '').replace(/\/+$/, '');
const auditToken = process.env.PORTAL_AUDIT_READ_ONLY_TOKEN ?? '';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function signedInPage(browser: Browser, origin: string, role: PortalSmokeRole, fixture = role as string) {
  const credential = resolvePortalRoleCredentials(role, process.env);
  if (credential.email?.toLowerCase() !== `${role}-test@workforceap.org` || !credential.password) {
    throw new Error(`Dedicated synthetic ${fixture} credentials are required; refusing a personal account.`);
  }
  if (!origin || auditToken.length < 32) throw new Error('Verified baseline URL and read-only audit capability are required.');
  const trustedOrigin = new URL(origin).origin;
  const context = await browser.newContext({ baseURL: trustedOrigin, extraHTTPHeaders: {
    'x-vercel-skip-toolbar': '1',
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
  } });
  await installReadOnlyAuditCookie(context, trustedOrigin, auditToken);
  await assertReadOnlyAuditCookieInstalled(context, trustedOrigin);
  await context.addInitScript(() => { if (!localStorage.getItem('wap-theme')) localStorage.setItem('wap-theme', 'light'); });
  const page = await context.newPage();
  if (fixture === 'mentor') {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
    await page.locator('#email').fill(credential.email);
    await page.locator('#password').fill(credential.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/, { timeout: 60_000 });
  } else await loginPortalRole(page, role);
  await installReadOnlyAuditCookie(context, trustedOrigin, auditToken);
  await assertReadOnlyAuditCookieInstalled(context, trustedOrigin);
  const identity = await page.request.get('/api/member/profile');
  const body = await identity.json();
  if (!identity.ok() || body.user?.email?.toLowerCase() !== credential.email.toLowerCase()) throw new Error('Server did not confirm the dedicated fixture identity.');
  const claims = await page.request.get('/api/auth/me');
  const actor = await claims.json();
  expect(actor.availablePortals?.some((portal: { role: string }) => portal.role === role), 'Dedicated account must have the actual portal entitlement').toBe(true);
  expect(actor.role).toBe(role);
  expect(actor.superAdmin).toBe(false);
  // After login, no test action may submit a form, send a message, or invoke a provider.
  await page.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  return page;
}

async function settle(page: Page, path: string, width: number, theme = 'light') {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1024 ? 768 : 900 });
  await page.evaluate(theme => localStorage.setItem('wap-theme', theme), theme);
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `${path} must render successfully`).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await assertDeploymentAcceptedReadOnlyAudit(page);
  await expect(page.locator('[data-portal-audit-suppressed="workspace-nav-badges-and-notification-polling"]')).toHaveCount(1);
  await expect(page.locator('[data-workspace-role]:not([data-workspace-role="member"])[data-member-home-compact]')).toHaveCount(0);
  await expect(page.locator('[data-portal-error-state]')).toHaveCount(0);
  const workspaceRole = path.startsWith('/dashboard/') ? 'member' : path.split('/')[1];
  await expect(page.locator(`.workspace-shell-root[data-workspace-role="${workspaceRole}"]`)).toHaveCount(1);
  if (path === '/dashboard/mentor') {
    expect(new URL(page.url()).pathname).toBe('/dashboard/mentor');
    await expect(page.locator('[data-member-home-compact]')).toHaveCount(0);
  }
  await page.evaluate(() => document.fonts.ready);
  if (width === 390) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow, `${path} overflows the phone viewport`).toBe(false);
  }
}

function masks(page: Page) {
  return [page.locator('time, [data-dynamic-time]'), page.getByText(/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i)];
}

async function shellState(page: Page, width: number, state: 'expanded' | 'collapsed' | 'drawer') {
  if (width <= 768) {
    if (state === 'drawer') {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeVisible();
    }
    return;
  }
  const collapsed = state === 'collapsed';
  const toggle = page.getByRole('button', { name: collapsed ? 'Collapse sidebar' : 'Expand sidebar', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('button', { name: collapsed ? 'Expand sidebar' : 'Collapse sidebar', exact: true })).toBeVisible();
}

async function compare(baseline: Page, candidate: Page, info: TestInfo, path: string, width: number, theme = 'light', state: 'expanded' | 'collapsed' | 'drawer' = 'expanded') {
  await settle(baseline, path, width, theme);
  await settle(candidate, path, width, theme);
  await shellState(baseline, width, state);
  await shellState(candidate, width, state);
  const name = `${path.replace(/[^a-z0-9]+/gi, '-')}-${width}-${theme}-${state}.png`;
  const target = info.snapshotPath(name);
  mkdirSync(dirname(target), { recursive: true });
  const image = await baseline.screenshot({ fullPage: true, animations: 'disabled', mask: masks(baseline) });
  writeFileSync(target, image);
  await info.attach(`master-${name}`, { body: image, contentType: 'image/png' });
  await expect(candidate).toHaveScreenshot(name, { fullPage: true, animations: 'disabled', mask: masks(candidate), maxDiffPixels: 0, threshold: 0 });
}

for (const role of Object.keys(PAGES) as Array<keyof typeof PAGES>) {
  test(`member rollout preserves ${role} pages against master`, async ({ browser, baseURL }, info) => {
    test.setTimeout(600_000);
    const baseline = await signedInPage(browser, baselineOrigin, role);
    const candidate = await signedInPage(browser, baseURL ?? '', role);
    try {
      for (const pattern of PAGES[role]) {
        let path: string = pattern;
        if (pattern.includes(':member')) {
          const parent = pattern.split('/:member')[0];
          await settle(baseline, parent, 1440);
          const links = await baseline.locator(`a[href^="${parent}/"]`).evaluateAll(anchors => anchors.map(a => a.getAttribute('href') ?? ''));
          const href = links.find(href => href.startsWith(`${parent}/`) && /^[a-zA-Z0-9_-]+$/.test(href.slice(parent.length + 1)) && !/\/(new|merge|duplicates|training)$/.test(href));
          if (!href) throw new Error('A synthetic member detail link is required for staff protection.');
          path = href;
        }
        for (const width of widths) await compare(baseline, candidate, info, path, width);
      }
      await compare(baseline, candidate, info, PAGES[role][0], 1440, 'dark');
      await compare(baseline, candidate, info, PAGES[role][0], 390, 'dark');
      await compare(baseline, candidate, info, PAGES[role][0], 1440, 'light', 'collapsed');
      await compare(baseline, candidate, info, PAGES[role][0], 390, 'light', 'drawer');
      await compare(baseline, candidate, info, PAGES[role][0], 390, 'dark', 'drawer');
    } finally {
      await baseline.context().close();
      await candidate.context().close();
    }
  });
}

test('member rollout preserves the mentor staff workspace against master', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000);
  const baseline = await signedInPage(browser, baselineOrigin, 'member', 'mentor');
  const candidate = await signedInPage(browser, baseURL ?? '', 'member', 'mentor');
  try {
    for (const width of widths) await compare(baseline, candidate, info, '/dashboard/mentor', width);
    await compare(baseline, candidate, info, '/dashboard/mentor', 1440, 'dark');
    await compare(baseline, candidate, info, '/dashboard/mentor', 390, 'dark');
  } finally {
    await baseline.context().close();
    await candidate.context().close();
  }
});
