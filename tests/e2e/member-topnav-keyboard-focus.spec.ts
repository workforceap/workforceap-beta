import { test, expect } from '@playwright/test';

// Real production navigation in a synthetic dev shell. Never activate a
// business action or use credentials; protected route acceptance is separate.
test.use({
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 768]) {
    test(`${theme} ${width}: every member tab and focus ring stays inside the rail`, async ({ page, baseURL }) => {
      test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Synthetic dev fixture requires loopback');
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('wap-theme', value), theme);
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
      await page.goto('/dev/member/jobs', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      const rail = page.getByRole('navigation', { name: 'Member portal' });
      const links = rail.getByRole('link');
      const count = await links.count();
      expect(count).toBeGreaterThan(8);
      // Reach the rail by real Tab rather than assuming a document tab count;
      // /dev has an extra skip link that the production dashboard excludes.
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        if (await links.first().evaluate((link) => document.activeElement === link)) break;
      }
      await expect(links.first()).toBeFocused();
      const pageY = await page.evaluate(() => window.scrollY);
      const assertVisible = async (preservePageY = true) => {
        await page.waitForTimeout(250); // Include focus CSS transitions and snap settlement.
        const bounds = await rail.evaluate((nav) => {
          const link = document.activeElement as HTMLElement;
          const list = nav.querySelector('ul')!;
          const rect = link.getBoundingClientRect();
          const clip = list.getBoundingClientRect();
          const style = getComputedStyle(link);
          return {
            focused: nav.contains(link) && link.matches(':focus-visible'),
            left: rect.left - clip.left,
            right: clip.right - rect.right,
            outline: style.outlineStyle,
            shadow: style.boxShadow,
            pageY: window.scrollY,
          };
        });
        expect(bounds.focused).toBe(true);
        expect(bounds.left).toBeGreaterThanOrEqual(4);
        expect(bounds.right).toBeGreaterThanOrEqual(4);
        expect(bounds.outline).toBe('solid');
        expect(bounds.shadow).not.toBe('none');
        if (preservePageY) expect(bounds.pageY).toBe(pageY);
      };
      for (let i = 0; i < count; i++) {
        if (i) await page.keyboard.press('Tab');
        await expect(links.nth(i)).toBeFocused();
        await assertVisible();
      }
      for (let i = count - 2; i >= 0; i--) {
        await page.keyboard.press('Shift+Tab');
        await expect(links.nth(i)).toBeFocused();
        await assertVisible();
      }
      if (width === 375) {
        // Native Tab may scroll sticky chrome toward the document top. Its
        // compact-to-expanded geometry must still reveal every focused link.
        await page.evaluate(() => window.scrollTo(0, 180));
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expect(page.locator('html')).toHaveClass(/wap-portal-chrome-compact/);
        for (let i = 1; i < count; i++) {
          await page.keyboard.press('Tab');
          await expect(links.nth(i)).toBeFocused();
          await assertVisible(false);
        }
        for (let i = count - 2; i >= 0; i--) {
          await page.keyboard.press('Shift+Tab');
          await expect(links.nth(i)).toBeFocused();
          await assertVisible(false);
        }
      }
    });
  }
}
