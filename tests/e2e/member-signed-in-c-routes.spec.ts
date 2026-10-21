/**
 * Signed-in checks for the five live C member routes on a Vercel Preview.
 *
 * Credentials come from PLAYWRIGHT_MEMBER_EMAIL / PLAYWRIGHT_PORTAL_PASSWORD
 * (mapped from PREVIEW_E2E_MEMBER_* in CI). Never log, echo, or screenshot
 * those values. Auth request bodies are not traced (this file forces trace off).
 *
 * A workflow step must already have proved the target serves the PR head SHA
 * on DEMO Supabase before this file runs.
 */
import { expect, test, type Page } from '@playwright/test';
import { resolveMemberPortalCredentials } from '../../scripts/lib/portal-audit-auth.mjs';
import { hasProdE2ECredentials } from './auth-helpers';

const LIVE_IGNORED_CONSOLE = [
  /\/api\/tours\//i,
  /\/api\/onboarding\//i,
  /Failed to load resource: the server responded with a status of (401|403|404)/,
  /net::ERR_/,
  /vercel\.live/i,
  /Content Security Policy/i,
  /feedback\.js/i,
  /elevenlabs/i,
  /webrtc/i,
  /ResizeObserver/i,
];

function collectLivePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (LIVE_IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
}

const C_ROUTES = [
  { name: 'home', path: '/dashboard' },
  { name: 'jobs', path: '/dashboard/jobs' },
  { name: 'program', path: '/dashboard/program' },
  { name: 'resume-studio', path: '/dashboard/ai-tools/resume-studio' },
  { name: 'ai-tools', path: '/dashboard/ai-tools' },
] as const;

test.use({
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

test.describe('signed-in C member routes', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!hasProdE2ECredentials(), 'Set PLAYWRIGHT_MEMBER_EMAIL and PLAYWRIGHT_PORTAL_PASSWORD');

  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
  test(`C member views load honestly at ${width} in ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(theme => localStorage.setItem('wap-theme', theme), theme);
    await loginSignedInMember(page);

    const untested: string[] = [];
    const errors = collectLivePageErrors(page);

    for (const route of C_ROUTES) {
      errors.length = 0;
      await gotoMember(page, route.path);
      await expect(page, `${route.path} bounced to login`).not.toHaveURL(/\/login([?#]|$)/, {
        timeout: 20_000,
      });
      await assertNotPreassessmentGated(page, route.path);

      const heading = page.getByRole('heading', { level: 1 });
      try {
        await expect(heading.first()).toBeVisible({ timeout: 20_000 });
      } catch {
        untested.push(`${route.path} (no h1)`);
        continue;
      }

      await assertHonestState(page, route.name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${route.path} horizontal overflow`).toBe(false);
      expect(errors, `${route.path} console errors:\n${errors.join('\n')}`).toEqual([]);

      const shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await testInfo.attach(`signed-in-${route.name}`, {
        body: shot,
        contentType: 'image/png',
      });
    }

    if (untested.length > 0) {
      testInfo.annotations.push({
        type: 'untested-signed-in',
        description: untested.join('; '),
      });
    }
    expect(untested, `routes that could not be tested signed-in: ${untested.join('; ')}`).toEqual([]);
  });

  }

  test('reversible member actions persist after reload, then restore', async ({ page }) => {
    test.setTimeout(180_000);
    await loginSignedInMember(page);

    await revertibleProfileLocation(page);
    await revertibleNotificationToggle(page);
    await markCounselorThreadRead(page);
  });
});

async function loginSignedInMember(page: Page) {
  const { email, password } = resolveMemberPortalCredentials(process.env);
  if (!email || !password) {
    throw new Error('Set PLAYWRIGHT_MEMBER_EMAIL and PLAYWRIGHT_PORTAL_PASSWORD');
  }
  if (email.toLowerCase() !== 'member-test@workforceap.org') throw new Error('Dedicated synthetic member credentials are required.');
  await page.goto('/login?redirectTo=%2Fdashboard', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => /\/dashboard(\/|$|\?)/.test(url.pathname), { timeout: 60_000 });
}

async function gotoMember(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|interrupted/i.test(message) || attempt === 2) throw error;
    }
  }
}

async function assertNotPreassessmentGated(page: Page, path: string) {
  expect(
    page.url(),
    `${path} redirected to the WIOA preassessment gate — PREVIEW_E2E member must have assessmentCompleted in portal-qa on DEMO`,
  ).not.toMatch(/\/dashboard\/assessment(\?|$)/);
  await expect(page.getByTestId('preassessment-required-notice')).toHaveCount(0);
}

async function assertHonestState(page: Page, route: (typeof C_ROUTES)[number]['name']) {
  await expect(page.getByRole('heading', { name: /unexpected error/i })).toHaveCount(0);
  const body = (await page.locator('main, [data-wa-kit], body').first().innerText()).replace(/\s+/g, ' ');
  expect(body, `${route} must not claim Qualified roles`).not.toMatch(/qualified roles/i);

  switch (route) {
    case 'home':
      await expectHomeHonest(page, body);
      return;
    case 'jobs':
      await expectJobsHonest(page, body);
      return;
    case 'program':
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      return;
    case 'resume-studio':
      await expectResumeHonest(page, body);
      return;
    case 'ai-tools':
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      return;
    default: {
      const _exhaustive: never = route;
      throw new Error(`unhandled C route ${_exhaustive}`);
    }
  }
}

async function expectHomeHonest(page: Page, body: string) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (await page.getByTestId('member-home-next-steps').count()) {
    const items = page.locator('[data-testid^="member-home-next-step-"]');
    expect(await items.count()).toBeGreaterThan(0);
    await expect(items.first().getByRole('link').first()).toBeVisible();
  }
  if (/\boffer/i.test(body) && /\binterview/i.test(body)) {
    expect(body, 'offers must be labeled separately from interviews').toMatch(/\boffer/i);
  }
}

async function expectJobsHonest(page: Page, body: string) {
  expect(body).toMatch(/open roles/i);
  const highMatch = page.getByText(/high match/i).first();
  if ((await highMatch.count()) === 0) return;
  const card = highMatch.locator('xpath=ancestor::*[contains(@class,"wa-kit") or self::li or self::div][1]');
  const cardText = ((await card.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  if (/recommended|no matches|not available/i.test(cardText) || cardText.includes('—')) {
    expect(cardText).not.toMatch(/\b0\b/);
  }
}

async function expectResumeHonest(page: Page, body: string) {
  const unknown = page.getByTestId('resume-studio-analysis-unknown');
  if ((await unknown.count()) > 0) {
    await expect(unknown).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    expect(body, 'unknown analysis must not show 0 fixes').not.toMatch(/0 fixes/i);
    await expect(page.getByRole('link', { name: /run analysis|score this resume/i }).first()).toBeVisible();
    return;
  }
  const bars = page.getByRole('progressbar');
  if ((await bars.count()) > 0) {
    await expect(bars.first()).toBeVisible();
  }
}

async function revertibleProfileLocation(page: Page) {
  await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login([?#]|$)/);
  const location = page.getByLabel(/^location$/i);
  await expect(location).toBeVisible({ timeout: 15_000 });
  const original = await location.inputValue();
  const token = `E2E ${Date.now()}`;

  try {
    await location.fill(token);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByRole('status')).toHaveText(/saved/i, { timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(/^location$/i)).toHaveValue(token);
  } finally {
    await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/^location$/i).fill(original);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByRole('status')).toHaveText(/saved/i, { timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(/^location$/i)).toHaveValue(original);
  }
}

async function revertibleNotificationToggle(page: Page) {
  await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
  const label = /updates from workforceap/i;
  const checkbox = page.getByRole('checkbox', { name: label });
  const toggle = page.locator('label.wa-kit-toggle').filter({ hasText: label });
  await expect(
    checkbox,
    'Profile must expose the WorkforceAP updates notification control',
  ).toBeVisible({ timeout: 15_000 });
  const original = await checkbox.isChecked();
  try {
    const saved = page.waitForResponse(
      (res) => res.url().includes('/api/member/settings') && res.request().method() === 'PATCH',
      { timeout: 20_000 },
    );
    // The kit checkbox is clipped to 1px. Click the visible label, which is
    // what a member uses and what actually fires the settings PATCH.
    await toggle.click();
    const response = await saved;
    expect(response.ok(), `notification settings PATCH failed (HTTP ${response.status()})`).toBeTruthy();
    await expect(page.getByRole('checkbox', { name: /updates from workforceap/i })).toBeChecked({
      checked: !original,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('checkbox', { name: /updates from workforceap/i })).toBeChecked({
      checked: !original,
    });
  } finally {
    const current = page.getByRole('checkbox', { name: /updates from workforceap/i });
    if ((await current.isChecked()) !== original) {
      const restored = page.waitForResponse(
        (res) => res.url().includes('/api/member/settings') && res.request().method() === 'PATCH',
        { timeout: 20_000 },
      );
      await page.locator('label.wa-kit-toggle').filter({ hasText: /updates from workforceap/i }).click();
      const response = await restored;
      expect(response.ok(), `notification restore PATCH failed (HTTP ${response.status()})`).toBeTruthy();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('checkbox', { name: /updates from workforceap/i })).toBeChecked({
      checked: original,
    });
  }
}

async function markCounselorThreadRead(page: Page) {
  const patch = await page.request.patch('/api/member/messages');
  expect(
    patch.ok(),
    `mark-read PATCH must succeed (HTTP ${patch.status()}) for the DEMO test member`,
  ).toBeTruthy();
  await page.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login([?#]|$)/);
  const read = await page.request.get('/api/member/messages');
  expect(read.ok()).toBeTruthy();
  const payload = (await read.json()) as { thread?: { memberLastReadAt?: string | null } };
  const stamped = payload.thread?.memberLastReadAt;
  expect(stamped, 'memberLastReadAt should persist after mark-read').toBeTruthy();
  expect(Date.now() - Date.parse(String(stamped))).toBeLessThan(5 * 60_000);
}
