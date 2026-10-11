import { expect, test, type Page } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/** Local proofs only: all writes and provider traffic are intercepted. */
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Requires a disposable local application; never submits to a live site.');
  await page.route('**/*', (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) return route.abort();
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/auth/me') {
      return route.fulfill({ status: 200, json: { user: null } });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      return route.fulfill({ status: 503, json: { error: 'Synthetic local QA request intercepted.' } });
    }
    return route.continue();
  });
});

async function openHydratedProof(page: Page, path: string) {
  const hydrated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/me');
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await hydrated;
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 375]) {
  test(`coach selection survives all tabs and refresh at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await openHydratedProof(page, '/dev/member/toolkit');
    await page.getByRole('button', { name: /Resume Coach.*Start session/i }).click();
    await expect(page).toHaveURL(/agent=resume/);
    for (const label of ['Resume', 'All Tools', 'Coaches']) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
      await expect(page).toHaveURL(/agent=resume/);
      const expectedTab = label === 'Resume' ? 'studio' : label === 'All Tools' ? 'toolkit' : null;
      await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe(expectedTab);
      const hydrated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/me');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await hydrated;
      await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
      await page.getByRole('radio', { name: 'Practice', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Practice', exact: true }).getByRole('heading', { name: 'Resume Coach', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/agent=resume/);
      await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('session');
      await expectNoOverflow(page);
    }
    expect(errors.filter((error) => /MISSING_MESSAGE|aiToolsDiscovery/.test(error))).toEqual([]);
    await testInfo.attach(`coach-refresh-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

const surfaces = [
  { name: 'hub', path: '/dev/member/toolkit?tab=session&agent=resume', endpoint: '**/api/member/resume-coach/session', start: /^start session$/i, width: 320 },
  { name: 'shared', path: '/dev/member/career-business-coach', endpoint: '**/api/member/career-business-coach/voice-session', start: /^start voice session$/i, width: 375 },
];

for (const surface of surfaces) {
  test.describe(`${surface.name} mobile voice recovery`, () => {
    test.use({ viewport: { width: surface.width, height: 812 }, contextOptions: { reducedMotion: 'reduce' } });

    test('microphone denial returns an enabled start control without an API request', async ({ page }) => {
      const requested: string[] = [];
      await page.route(surface.endpoint, (route) => { requested.push(route.request().url()); return route.abort(); });
      await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => { throw new DOMException('Synthetic permission denial', 'NotAllowedError'); },
      }));
      await openHydratedProof(page, surface.path);
      await page.getByRole('button', { name: surface.start }).click();
      await expect(page.getByRole('alert').filter({ hasText: /microphone/i })).toContainText(/allow.*try again/i);
      await expect(page.getByRole('button', { name: surface.start })).toBeEnabled();
      expect(requested).toEqual([]);
      await expectNoOverflow(page);
    });

    for (const failure of ['outage', 'network', 'timeout'] as const) {
      test(`${failure} gives a retry and preserves the mobile layout`, async ({ page }, testInfo) => {
        await page.addInitScript(() => {
          localStorage.setItem('wap-theme', 'dark');
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            value: async () => ({ getTracks: () => [{ stop() {} }] }),
          });
        });
        await page.route(surface.endpoint, (route) => {
          if (failure === 'outage') return route.fulfill({ status: 503, contentType: 'text/html', body: '<title>Internal provider error</title>' });
          if (failure === 'network') return route.abort('internetdisconnected');
          return new Promise(() => {});
        });
        await openHydratedProof(page, surface.path);
        if (failure === 'timeout') await page.clock.install();
        const request = page.waitForRequest((request) => request.method() === 'POST' && /voice-session|resume-coach\/session/.test(new URL(request.url()).pathname));
        await page.getByRole('button', { name: surface.start }).click();
        await request;
        if (failure === 'timeout') await page.clock.fastForward(60_001);
        const message = failure === 'outage' ? /temporarily unavailable/i : failure === 'network' ? /check your connection/i : /longer than expected/i;
        await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
        await expect(page.getByRole('button', { name: surface.start })).toBeEnabled();
        await expectNoOverflow(page);
        await testInfo.attach(`${surface.name}-${failure}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    }
  });
}
