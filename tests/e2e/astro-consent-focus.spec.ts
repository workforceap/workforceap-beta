import { expect, test } from '@playwright/test';

test.use({
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  contextOptions: { reducedMotion: 'reduce' },
});

/** Actual built Astro markup/CSS/script. No form submission or external write. */
for (const [width, height, decision] of [
  [375, 667, 'Accept'],
  [390, 844, 'Decline'],
  [768, 1024, 'Accept'],
  [1440, 900, 'Decline'],
] as const) {
  test(`${width}px: Donate keyboard focus clears consent through resize and ${decision}`, async ({ page, baseURL }) => {
    test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use a local built Astro or combined site');
    await page.route('**/*', (route) => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    await page.setViewportSize({ width, height });
    await page.goto('/donate/', { waitUntil: 'networkidle' });
    const banner = page.getByRole('region', { name: 'Cookie preferences' });
    await expect(banner).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const basePadding = await page.evaluate(() => {
      const occupied = innerHeight - document.getElementById('wap-consent')!.getBoundingClientRect().top;
      return Number.parseFloat(getComputedStyle(document.body).paddingBottom) - occupied;
    });
    const assertMeasuredReserve = async () => {
      await expect.poll(() => page.evaluate(() => {
        const occupied = innerHeight - document.getElementById('wap-consent')!.getBoundingClientRect().top;
        const reserve = Number.parseFloat(document.documentElement.style.getPropertyValue('--cookie-consent-reserve'));
        return Math.abs(reserve - occupied);
      })).toBeLessThan(1);
    };
    await assertMeasuredReserve();

    // Begin at the last form action, then use native Tab through the closing
    // CTAs and footer. The old script padded the page but left these focused
    // links fully behind the fixed bar even though max-scroll cleared it.
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: /Send inquiry/ }).focus();
    let sawClosingCta = false;
    let sawFooter = false;
    let reachedBanner = false;
    for (let index = 0; index < 60; index++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const consent = document.getElementById('wap-consent')!;
        return {
          inBanner: consent.contains(active),
          footer: Boolean(active.closest('footer')),
          closingCta: active.textContent?.includes('Donate securely online') ?? false,
          label: active.textContent?.trim(),
        };
      });
      if (focused.inBanner) { reachedBanner = true; break; }
      sawClosingCta ||= focused.closingCta;
      sawFooter ||= focused.footer;
      await expect.poll(() => page.evaluate(() => {
        const active = document.activeElement!;
        return document.getElementById('wap-consent')!.getBoundingClientRect().top - active.getBoundingClientRect().bottom;
      }), { message: `${focused.label} and its focus outline clear consent` }).toBeGreaterThanOrEqual(4);
    }
    expect(sawClosingCta).toBe(true);
    expect(sawFooter).toBe(true);
    expect(reachedBanner).toBe(true);

    // A desktop bar and a wrapped phone bar have different occupied heights.
    await page.setViewportSize(width < 880 ? { width: 1440, height: 900 } : { width: 375, height: 667 });
    await assertMeasuredReserve();
    await page.getByRole('link', { name: /Donate securely online/ }).last().focus();
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('wap-consent')!.getBoundingClientRect().top - document.activeElement!.getBoundingClientRect().bottom,
    )).toBeGreaterThanOrEqual(4);

    await banner.getByRole('button', { name: decision, exact: true }).click();
    await expect(banner).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--cookie-consent-reserve'))).toBe('');
    expect(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).paddingBottom))).toBeCloseTo(basePadding, 1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wap-cookie-consent')!));
    expect(stored.decision).toBe(decision === 'Accept' ? 'accepted' : 'declined');
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--cookie-consent-reserve'))).toBe('');
  });
}
