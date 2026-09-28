import { expect, test, type Page } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/**
 * Regression for the partner disclosure inside the crimson /apply hero: the
 * callout used `color: inherit`, so it took the hero's white text onto its
 * pale pink box (about 1.1:1). Measures the rendered text against the
 * callout's own background on every page that shows it, in both themes.
 *
 * Needs an active partner referral code on the target deployment
 * (E2E_PARTNER_REF). Viewing the pages submits nothing.
 */
const partnerRef = process.env.E2E_PARTNER_REF?.trim();

type Contrast = { label: number; body: number; tone: string | null };

async function disclosureContrast(page: Page): Promise<Contrast> {
  const note = page.locator('[data-partner-disclosure]').first();
  await expect(note).toBeVisible({ timeout: 20_000 });
  return note.evaluate((el) => {
    type Rgba = [number, number, number, number];
    const probe = document.createElement('canvas').getContext('2d')!;
    const rgba = (css: string): Rgba => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: Rgba, under: Rgba): Rgba => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    // Backdrop: composite translucent backgrounds up the tree; a gradient
    // counts as its first colour stop (the /apply hero is a crimson gradient).
    const layers: Rgba[] = [];
    let base: Rgba = [255, 255, 255, 1];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const stop = style.backgroundImage.match(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\))/i);
      if (stop) { base = rgba(stop[1]); break; }
      const color = rgba(style.backgroundColor);
      if (color[3] > 0) {
        layers.push(color);
        if (color[3] >= 1) break;
      }
    }
    let backdrop = base;
    for (const layer of layers.reverse()) backdrop = over(layer, backdrop);
    const luminance = ([r, g, b]: Rgba) => {
      const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (text: Element | null) => {
      if (!text) return 0;
      const fg = over(rgba(getComputedStyle(text).color), backdrop);
      const [hi, lo] = [luminance(fg), luminance(backdrop)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    };
    return {
      label: ratio(el.querySelector('span')),
      body: ratio(el.querySelector('p')),
      tone: el.getAttribute('data-disclosure-tone'),
    };
  });
}

test.describe('partner disclosure contrast', () => {
  test.beforeEach(() => {
    test.skip(!partnerRef, 'Set E2E_PARTNER_REF to an active partner referral code');
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} theme`, () => {
      test.use({ colorScheme });

      test('the /apply hero disclosure uses the on-hero tone and meets 4.5:1', async ({ page }) => {
        await page.goto(`/apply?ref=${encodeURIComponent(partnerRef!)}`, { waitUntil: 'domcontentloaded' });
        const contrast = await disclosureContrast(page);
        expect(contrast.tone).toBe('onHero');
        expect(contrast.label, 'label contrast').toBeGreaterThanOrEqual(4.5);
        expect(contrast.body, 'body contrast').toBeGreaterThanOrEqual(4.5);
      });

      test('the /signup disclosure meets 4.5:1', async ({ page }) => {
        await page.goto(`/signup?ref=${encodeURIComponent(partnerRef!)}`, { waitUntil: 'domcontentloaded' });
        const contrast = await disclosureContrast(page);
        expect(contrast.label, 'label contrast').toBeGreaterThanOrEqual(4.5);
        expect(contrast.body, 'body contrast').toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
