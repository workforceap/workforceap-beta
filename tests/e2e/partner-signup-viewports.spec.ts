import { test, expect } from '@playwright/test';

/**
 * WAP-118: /partner-signup used to give three different results at three
 * viewports (interstitial on desktop, ERR_ABORTED on tablet, Next 404 on
 * mobile) because it SPA-navigated to an Astro-owned route. The page now does
 * a document navigation to /partners#partner-signup and renders the fallback
 * link immediately. This asserts the same landing at 390, 768 and 1280.
 *
 * Locally `/partners` is served by the marketing Astro app, which is not part
 * of `npm run dev`; the landing may render Next's not-found page here, but the
 * URL must still be /partners#partner-signup at every width.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

test.describe('/partner-signup hands off to /partners#partner-signup', () => {
  for (const viewport of VIEWPORTS) {
    test(`lands on /partners#partner-signup at ${viewport.width}x${viewport.height} (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const aborted: string[] = [];
      page.on('requestfailed', (request) => {
        if (request.failure()?.errorText === 'net::ERR_ABORTED' && request.resourceType() === 'document') {
          aborted.push(request.url());
        }
      });

      await page.goto('/partner-signup', { waitUntil: 'commit' });
      await page.waitForURL((url) => url.pathname === '/partners' && url.hash === '#partner-signup', { timeout: 15_000 });

      const landed = new URL(page.url());
      expect(landed.pathname).toBe('/partners');
      expect(landed.hash).toBe('#partner-signup');
      expect(aborted).toEqual([]);
    });
  }

  test('the interstitial ships the fallback link in server HTML, before any script runs', async ({ request }) => {
    const response = await request.get('/partner-signup', { maxRedirects: 5 });
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('href="/partners#partner-signup"');
  });
});
