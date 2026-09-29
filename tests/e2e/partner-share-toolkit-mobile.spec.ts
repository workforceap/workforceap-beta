import { expect, test } from '@playwright/test';
import { hasPortalRoleCredentials, loginPortalRole } from './auth-helpers';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/**
 * Regression for the partner guide share tools at phone width: the panel's
 * implicit `auto` grid track grew to the min-content width of the longest
 * unbreakable URL ("Links to https://…/apply?ref=…&utm_…"), so at 390px the
 * page scrolled sideways to 555px and the share rows were cut off. The fix
 * gives `.panel` a `minmax(0, 1fr)` track and lets long notes wrap
 * (components/partner/PartnerShareToolkit.module.css).
 */
test.describe('Partner share toolkit on a phone', () => {
  test.beforeEach(() => {
    test.skip(!hasPortalRoleCredentials('partner'), 'Set E2E_PARTNER_EMAIL and E2E_PARTNER_PASSWORD');
  });

  for (const width of [360, 390]) {
    test(`share tools stay inside a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await loginPortalRole(page, 'partner');
      await page.goto('/partner/guide#share-tools', { waitUntil: 'domcontentloaded' });
      const panel = page.locator('#share-tools');
      await expect(panel).toBeVisible({ timeout: 20_000 });

      const metrics = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const tools = document.getElementById('share-tools');
        const widest = tools
          ? Math.max(...Array.from(tools.querySelectorAll('*')).map((el) => el.getBoundingClientRect().right))
          : 0;
        return { viewport, bodyScrollWidth: document.body.scrollWidth, widest };
      });

      expect(metrics.bodyScrollWidth, 'page must not scroll sideways').toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.widest, 'no share-tools content past the viewport edge').toBeLessThanOrEqual(metrics.viewport + 1);
    });
  }
});
