import { expect, test } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

function luminance(color: string) {
  const rgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!rgb || rgb.length !== 3) throw new Error(`Expected computed RGB color: ${color}`);
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

for (const theme of ['light', 'dark'] as const) for (const width of [375, 768, 1440]) {
  test(`kit toggles expose their state and keyboard focus in ${theme} theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('wap-theme', value), theme);
    await page.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['GET', 'HEAD'].includes(request.method())) return route.abort();
      if (url.pathname === '/api/auth/me') return route.fulfill({ status: 200, json: { user: null } });
      return route.continue();
    });
    await page.goto('/dev/kit', { waitUntil: 'domcontentloaded' });

    for (const surface of ['warm', 'dense']) {
      for (const checked of [false, true]) {
        const toggle = page.locator(`[data-surface="${surface}"] .wa-kit-toggle[data-checked="${checked}"]`);
        await expect(toggle).toHaveCount(1);
        const input = toggle.locator('input');
        await expect(input).toHaveAccessibleName(checked ? 'Job matches' : 'Course reminders');
        if (checked) await expect(input).toBeChecked();
        else await expect(input).not.toBeChecked();

        const colors = await toggle.evaluate((element) => {
          const track = element.querySelector<HTMLElement>('.wa-kit-toggle-track')!;
          const thumb = element.querySelector<HTMLElement>('.wa-kit-toggle-thumb')!;
          return {
            track: getComputedStyle(track).backgroundColor,
            thumb: getComputedStyle(thumb).backgroundColor,
            targetHeight: element.getBoundingClientRect().height,
            transition: getComputedStyle(thumb).transitionDuration,
          };
        });
        const a = luminance(colors.track);
        const b = luminance(colors.thumb);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${surface} ${checked ? 'on' : 'off'} thumb contrast`).toBeGreaterThanOrEqual(3);
        expect(colors.targetHeight).toBeGreaterThanOrEqual(44);
        expect(colors.transition).toBe('0s');

        await input.focus();
        await page.keyboard.press('Shift');
        expect(await input.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
        expect(await toggle.locator('.wa-kit-toggle-track').evaluate((element) => getComputedStyle(element).boxShadow)).toMatch(/0px 0px 0px 2px, .* 0px 0px 0px 4px/);
      }
    }
  });
}
