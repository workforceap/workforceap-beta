import { expect, test } from '@playwright/test';

test.describe('program comparison horizontal scroll', () => {
  for (const width of [768, 1024]) {
    test(`keeps ${width}px page within the viewport while the table remains operable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/program-comparison/', { waitUntil: 'domcontentloaded' });

      const region = page.getByRole('region', { name: 'Program comparison table' });
      await region.scrollIntoViewIfNeeded();

      const geometry = await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>('.cmp-wrap');
        const table = document.querySelector<HTMLElement>('.cmp');
        if (!region || !table) throw new Error('Program comparison table is missing.');

        return {
          viewportWidth: window.innerWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          regionClientWidth: region.clientWidth,
          regionScrollWidth: region.scrollWidth,
          tableWidth: table.getBoundingClientRect().width,
        };
      });

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.regionScrollWidth).toBeGreaterThan(geometry.regionClientWidth);
      expect(geometry.tableWidth).toBeGreaterThan(geometry.regionClientWidth);

      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await region.evaluate((element) => {
        element.scrollLeft = 0;
      });

      const bounds = await region.boundingBox();
      if (!bounds) throw new Error('Program comparison table is not visible.');
      await page.mouse.move(bounds.x + bounds.width - 40, bounds.y + 80);
      await page.mouse.wheel(240, 0);
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

      await region.evaluate((element) => {
        element.scrollLeft = Math.min(280, element.scrollWidth - element.clientWidth);
      });
      const stickyGeometry = await page.evaluate(() => {
        const headerPick = document.querySelector('.cmp thead .cmp-pick');
        const headerTrack = document.querySelector('.cmp thead .cmp-track');
        const rowPick = document.querySelector('.cmp tbody .cmp-pick');
        const rowTrack = document.querySelector('.cmp tbody .cmp-track');
        const title = rowTrack?.querySelector('a');
        if (!headerPick || !headerTrack || !rowPick || !rowTrack || !title) {
          throw new Error('Sticky comparison columns are missing.');
        }

        const headerPickRect = headerPick.getBoundingClientRect();
        const headerTrackRect = headerTrack.getBoundingClientRect();
        const rowPickRect = rowPick.getBoundingClientRect();
        const rowTrackRect = rowTrack.getBoundingClientRect();
        const titleRect = document.createRange();
        titleRect.selectNodeContents(title);

        return {
          headerOverlap: headerPickRect.right - headerTrackRect.left,
          rowOverlap: rowPickRect.right - rowTrackRect.left,
          titleLeft: titleRect.getBoundingClientRect().left,
          rowPickRight: rowPickRect.right,
        };
      });

      expect(stickyGeometry.headerOverlap).toBeLessThanOrEqual(0.5);
      expect(stickyGeometry.rowOverlap).toBeLessThanOrEqual(0.5);
      expect(stickyGeometry.titleLeft).toBeGreaterThanOrEqual(stickyGeometry.rowPickRight);

      const fullPanGeometry = await region.evaluate((element) => {
        element.scrollLeft = element.scrollWidth - element.clientWidth;
        const pick = element.querySelector('.cmp tbody .cmp-pick');
        const track = element.querySelector('.cmp tbody .cmp-track');
        const title = track?.querySelector('a');
        if (!pick || !track || !title) throw new Error('Sticky comparison columns are missing.');

        const pickRect = pick.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        const titleRange = document.createRange();
        titleRange.selectNodeContents(title);

        return {
          scrollLeft: element.scrollLeft,
          maxScroll: element.scrollWidth - element.clientWidth,
          overlap: pickRect.right - trackRect.left,
          titleLeft: titleRange.getBoundingClientRect().left,
          pickRight: pickRect.right,
        };
      });

      expect(fullPanGeometry.scrollLeft).toBeGreaterThan(0);
      expect(fullPanGeometry.scrollLeft).toBe(fullPanGeometry.maxScroll);
      expect(fullPanGeometry.overlap).toBeLessThanOrEqual(0.5);
      expect(fullPanGeometry.titleLeft).toBeGreaterThanOrEqual(fullPanGeometry.pickRight);

      const rows = page.locator('.cmp-track-row');
      for (const index of [0, 1, 2, 3]) {
        await rows.nth(index).locator('input[data-compare-slug]').check();
      }

      const matrix = page.locator('#compare-matrix');
      await expect(matrix).toBeVisible();
      await expect(page.locator('#compare-matrix-head th')).toHaveCount(5);
      await expect(page.getByRole('region', { name: 'Selected program comparison' })).toBeVisible();
    });
  }

  test('stacks comparison rows into cards on a 375px screen without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/program-comparison/', { waitUntil: 'domcontentloaded' });

    const result = await page.locator('.cmp-track-row').first().evaluate((row) => ({
      display: getComputedStyle(row).display,
      pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
    }));

    expect(result.display).toBe('block');
    expect(result.pageWidth).toBeLessThanOrEqual(result.viewportWidth);
  });
});
