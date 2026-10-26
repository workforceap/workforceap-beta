import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Synthetic proofs require loopback');
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['GET', 'HEAD'].includes(request.method())) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({
      status: url.pathname === '/api/auth/me' ? 200 : 403,
      json: url.pathname === '/api/auth/me' ? { user: null } : { error: 'Read-only fixture guard' },
    });
    return route.continue();
  });
});

const views = [
  ['Counselor', '/dev/staff/counselor-workspace?view=overview'],
  ['Students', '/dev/staff/students-workspace?view=readiness&readiness=job'],
  ['Candidates', '/dev/staff/employer-candidates?view=pipeline'],
  ['Impact', '/dev/staff/partner-impact?view=exports'],
  ['Reporting', '/dev/staff/reporting?tab=exports'],
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const [name, path] of views) {
    test(`${theme} ${name}: selected and keyboard-focused page links remain visible on phones`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('wap-theme', value), theme);
      await page.goto(path, { waitUntil: 'networkidle' });
      const nav = page.locator('nav.wa-kit-tabs').first();
      await expect(nav).toHaveAttribute('aria-label', /.+/);
      const selected = nav.locator('a[aria-current="page"]');
      await expect(selected).toHaveCount(1);
      const assertInside = async (locator: typeof selected) => {
        await expect.poll(async () => locator.evaluate((link) => {
          const bounds = link.getBoundingClientRect();
          const viewport = link.parentElement!.getBoundingClientRect();
          return Math.min(bounds.left - viewport.left, viewport.right - bounds.right, bounds.top - viewport.top, viewport.bottom - bounds.bottom);
        })).toBeGreaterThanOrEqual(3.5);
      };
      await assertInside(selected);
      const links = nav.getByRole('link');
      await links.first().focus();
      const pageY = await page.evaluate(() => window.scrollY);
      for (let index = 1; index < await links.count(); index++) {
        await page.keyboard.press('Tab');
        await expect(links.nth(index)).toBeFocused();
        await assertInside(links.nth(index));
        expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
      }
      for (let index = await links.count() - 2; index >= 0; index--) {
        await page.keyboard.press('Shift+Tab');
        await expect(links.nth(index)).toBeFocused();
        await assertInside(links.nth(index));
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await assertInside(links.first());
    });
  }
}

test('review notes survive a reload and export with the review revision', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/dev/portal-review', { waitUntil: 'networkidle' });
  const ready = page.getByText('Review changes save in this browser.', { exact: true });
  await expect(ready).toBeVisible();
  const note = page.getByRole('textbox', { name: /^Notes:/ }).first();
  await note.fill('Browser review: draft survives reload');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(ready).toBeVisible();
  await expect(note).toHaveValue('Browser review: draft survives reload');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^workforceap-preview-review-.+\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"Revision","Type","Role","Route"');
  expect(csv).toContain('Browser review: draft survives reload');
});
