import { test, expect } from '@playwright/test';

// Real production navigation in a synthetic dev shell. Never activate a
// business action or use credentials; protected route acceptance is separate.
test.use({
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 768]) {
    test(`${theme} ${width}: daily links and expanded pages retain visible keyboard targets`, async ({ page, baseURL }) => {
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
      const links = rail.locator('.member-portal-top-nav__list').getByRole('link');
      const dailyList = rail.locator('.member-portal-top-nav__list');
      const count = await links.count();
      expect(count).toBe(5);
      const dailyBar = await dailyList.evaluate((list) => ({
        position: getComputedStyle(list).position,
        bottom: list.getBoundingClientRect().bottom,
        height: list.getBoundingClientRect().height,
        innerPaddingBottom: getComputedStyle(document.querySelector('.workspace-shell-main-inner')!).paddingBottom,
        htmlScrollPaddingBottom: getComputedStyle(document.documentElement).scrollPaddingBottom,
        bodyScrollPaddingBottom: getComputedStyle(document.body).scrollPaddingBottom,
        targetScrollMarginBottom: getComputedStyle(document.querySelector('.workspace-shell-main [id]')!).scrollMarginBottom,
        parentBackdropFilter: getComputedStyle(list.parentElement!).backdropFilter,
      }));
      if (width < 768) {
        expect(dailyBar.position).toBe('fixed');
        expect(Math.abs(dailyBar.bottom - 900)).toBeLessThanOrEqual(1);
        expect(dailyBar.height).toBeGreaterThanOrEqual(48);
        expect(parseFloat(dailyBar.innerPaddingBottom)).toBeGreaterThanOrEqual(72);
        expect(parseFloat(dailyBar.htmlScrollPaddingBottom)).toBeGreaterThanOrEqual(72);
        expect(parseFloat(dailyBar.bodyScrollPaddingBottom)).toBeGreaterThanOrEqual(72);
        expect(parseFloat(dailyBar.targetScrollMarginBottom)).toBeGreaterThanOrEqual(72);
        expect(dailyBar.parentBackdropFilter).toBe('none');
        const tabs = await dailyList.locator('.member-portal-top-nav__item').evaluateAll((items) => items.map((item) => {
          const link = item.querySelector<HTMLElement>('.member-portal-top-nav__link')!;
          const icon = link.querySelector<HTMLElement>('.member-portal-top-nav__icon')!;
          const fullLabel = link.querySelector<HTMLElement>('.member-portal-top-nav__label')!;
          const shortLabel = link.querySelector<HTMLElement>('.member-portal-top-nav__short-label');
          const label = getComputedStyle(fullLabel).display === 'none' ? shortLabel! : fullLabel;
          return {
            width: item.getBoundingClientRect().width,
            direction: getComputedStyle(link).flexDirection,
            iconVisible: icon.getBoundingClientRect().width > 0,
            labelVisible: label.getBoundingClientRect().height > 0,
          };
        }));
        expect(tabs.map((tab) => tab.direction)).toEqual(Array(5).fill('column'));
        expect(tabs.map((tab) => tab.iconVisible)).toEqual(Array(5).fill(true));
        expect(tabs.map((tab) => tab.labelVisible)).toEqual(Array(5).fill(true));
        expect(Math.max(...tabs.map((tab) => tab.width)) - Math.min(...tabs.map((tab) => tab.width))).toBeLessThanOrEqual(1);
      } else {
        // Tablet keeps the existing horizontal strip; only phone widths pin it.
        expect(dailyBar.position).not.toBe('fixed');
      }
      // Reach the rail by real Tab rather than assuming a document tab count;
      // Both fixtures and production have a responsive navigation skip link.
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
        if (width < 768) {
          const bounds = await links.nth(i).boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.height).toBeGreaterThanOrEqual(48);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
        }
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
        const compactBar = await dailyList.evaluate((list) => ({
          position: getComputedStyle(list).position,
          bottom: list.getBoundingClientRect().bottom,
        }));
        expect(compactBar.position).toBe('fixed');
        expect(Math.abs(compactBar.bottom - 900)).toBeLessThanOrEqual(1);
        await expect(dailyList.locator('.member-portal-top-nav__icon').first()).toBeVisible();
        const compactLabels = await dailyList.locator('.member-portal-top-nav__item').evaluateAll((items) => items.map((item) => {
          const link = item.querySelector<HTMLElement>('.member-portal-top-nav__link')!;
          const full = link.querySelector<HTMLElement>('.member-portal-top-nav__label')!;
          const short = link.querySelector<HTMLElement>('.member-portal-top-nav__short-label');
          const label = getComputedStyle(full).display === 'none' ? short! : full;
          return label.getBoundingClientRect().height;
        }));
        expect(compactLabels.every((height) => height > 0)).toBe(true);
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
      const assessment = rail.getByRole('link', { name: 'WIOA Preassessment' });
      await expect(assessment).toBeVisible();
      const more = rail.getByRole('button', { name: 'More pages' });
      await more.focus();
      await page.keyboard.press('Enter');
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      const extra = rail.locator('.member-portal-top-nav__extra').getByRole('link');
      expect(await extra.count()).toBeGreaterThan(0);
      for (let i = 0; i < await extra.count(); i++) {
        await page.keyboard.press('Tab');
        await expect(extra.nth(i)).toBeFocused();
        const box = await extra.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await more.focus();
      await page.keyboard.press('Enter');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(extra.first()).toBeHidden();
      await expect(assessment).toBeVisible();
    });
  }
}
