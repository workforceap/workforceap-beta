import { expect, test } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/**
 * WAP-253 item 4: at phone width a kit DataTable scrolls sideways, and the
 * browser makes that scroller a keyboard tab stop. The table wrap clips
 * (overflow: hidden) any ring drawn on the scroller, so the kit ring is drawn
 * on the wrap while the scroller has focus. jsdom can't evaluate :has() or
 * clipping, so this runs in a real browser against the partner command lab.
 */
test('a focused table scroller shows the kit ring on its wrap at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/staff/partner-command', { waitUntil: 'networkidle' });
  await expect(page.locator('.wa-kit-table-wrap').first()).toBeVisible();

  let found: { scrollable: boolean; wrapShadow: string } | null = null;
  for (let i = 0; i < 120 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => {
      const el = document.activeElement;
      const wrap = el?.closest('.wa-kit-table-wrap');
      if (!el || !wrap || !el.classList.contains('wa-overflow-x-auto')) return null;
      return { scrollable: el.scrollWidth > el.clientWidth, wrapShadow: getComputedStyle(wrap).boxShadow };
    });
  }

  expect(found, 'Tab reaches a kit table scroller').not.toBeNull();
  expect(found!.scrollable).toBe(true);
  // --wa-focus-ring: a 2px surface gap then a 4px accent ring.
  expect(found!.wrapShadow).toMatch(/0px 0px 0px 2px, .* 0px 0px 0px 4px/);
});
