/**
 * Runs before DEMO fixture prepare in CI. Proves the shared test member is
 * still subject to the WIOA preassessment require gate (incomplete assessment,
 * login count past the prompt window) so intentional incomplete states remain
 * testable after fixture restore.
 */
import { expect, test, type Page } from '@playwright/test';
import { resolveMemberPortalCredentials } from '../../scripts/lib/portal-audit-auth.mjs';
import { hasProdE2ECredentials } from './auth-helpers';

test.use({
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

test.describe('preassessment gate before fixture prepare', () => {
  test.skip(!hasProdE2ECredentials(), 'Set PLAYWRIGHT_MEMBER_EMAIL and PLAYWRIGHT_PORTAL_PASSWORD');

  test('blocks Job board until assessment is complete', async ({ page }) => {
    test.setTimeout(120_000);
    await loginSignedInMember(page);
    await page.goto('/dashboard/jobs', { waitUntil: 'domcontentloaded' });
    await expect(page, 'C routes must not load before fixture prepare').toHaveURL(
      /\/dashboard\/assessment(\?|$)/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('preassessment-required-notice')).toBeVisible();
  });
});

async function loginSignedInMember(page: Page) {
  const { email, password } = resolveMemberPortalCredentials(process.env);
  if (!email || !password) {
    throw new Error('Set PLAYWRIGHT_MEMBER_EMAIL and PLAYWRIGHT_PORTAL_PASSWORD');
  }
  await page.goto('/login?redirectTo=%2Fdashboard', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => /\/dashboard(\/|$|\?)/.test(url.pathname), { timeout: 60_000 });
}
