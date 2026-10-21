import path from 'node:path';
import { expect, test } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/**
 * The real stylesheet cascade, isolated from authentication and data loaders.
 * These are rendered CSS assertions, not source-string checks. In particular,
 * a more-specific generic dark card rule used to erase both hero gradients.
 */
const stylesheetPaths = [
  'css/main.css',
  'css/wa-brand-tokens.css',
  'css/astryx-brand-bridge.css',
  'css/portal-tokens.css',
  'css/portal-main-extracted.css',
  'css/portal-ui-kit.css',
  'css/portal-kit.css',
  'css/portal.css',
];

for (const theme of ['light', 'dark'] as const) {
  for (const surface of ['warm', 'dense'] as const) {
    for (const width of [375, 768, 1440]) {
      test(`${surface} cards retain their intended contrast in ${theme} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        // The fixture never needs a server, network request, or user data.
        await page.route('**/*', (route) => route.abort());
        const role = surface === 'warm' ? 'member' : 'admin';
        await page.setContent(`<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}" data-theme="${theme}" data-portal-role="${role}">
          <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body><div class="workspace-shell-root" data-workspace-role="${role}">
            <header class="workspace-shell-header"><span class="wa-kit-meta">WorkforceAP workspace</span></header>
            <main data-surface="${surface}" style="padding:24px;display:grid;gap:24px">
              <section class="wa-kit-card" data-card="standard"><h2>My program</h2><p class="wa-kit-meta">Your next step and saved progress.</p></section>
              <section class="astryx-card" data-card="astryx" style="padding:24px"><h2>Messages</h2><p class="wa-kit-meta">A clear place to read and respond.</p></section>
              <section class="wa-kit-card wa-kit-card--tinted" data-card="tinted"><p>Program guidance</p></section>
              <section class="wa-kit-card wa-kit-card--gradient-crimson" data-card="crimson"><p>Continue your program</p></section>
              <section class="wa-kit-card wa-kit-card--gradient-gold" data-card="gold"><p>Your certification path</p></section>
              <section class="astryx-card wa-kit-card--gradient-gold" data-card="astryx-gold" style="padding:24px"><p>Certifications</p></section>
            </main>
          </div></body></html>`);
        // Imports are represented explicitly so about:blank does not require
        // a file server; the same app styles still compete in their real order.
        for (const stylesheet of stylesheetPaths) {
          await page.addStyleTag({ path: path.resolve(stylesheet) });
        }
        // Legacy Astryx styles reduce transitions to a tiny duration instead
        // of removing them. Sample the settled surface, not its first frame.
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().map((animation) => animation.finished));
        });

        const rendered = await page.evaluate(() => {
          const ctx = document.createElement('canvas').getContext('2d')!;
          const rgba = (css: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
            return { r, g, b, a: alpha / 255 };
          };
          type Color = ReturnType<typeof rgba>;
          const over = (a: Color, b: Color): Color => ({
            r: a.r * a.a + b.r * (1 - a.a),
            g: a.g * a.a + b.g * (1 - a.a),
            b: a.b * a.a + b.b * (1 - a.a),
            a: 1,
          });
          const luminance = (c: Color) => {
            const values = [c.r, c.g, c.b].map((v) => {
              const n = v / 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            });
            return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
          };
          const contrast = (fg: Color, bg: Color) => {
            const a = luminance(over(fg, bg)), b = luminance(bg);
            return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          };
          const canvas = rgba(getComputedStyle(document.body).backgroundColor);
          const root = document.querySelector('main')!;
          const token = (name: string) => {
            const probe = document.createElement('span');
            probe.style.color = `var(${name})`;
            root.append(probe);
            const color = rgba(getComputedStyle(probe).color);
            probe.remove();
            return color;
          };
          const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')].map((card) => {
            const style = getComputedStyle(card);
            const background = over(rgba(style.backgroundColor), canvas);
            const stops = (style.backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)/g) ?? []).map(rgba);
            return {
              name: card.dataset.card!,
              image: style.backgroundImage,
              background: rgba(style.backgroundColor),
              stops,
              textRatios: (stops.length ? stops : [background]).map((stop) => contrast(
                rgba(getComputedStyle(card.querySelector('p')!).color), over(stop, canvas),
              )),
              mutedRatio: card.querySelector('.wa-kit-meta')
                ? contrast(rgba(getComputedStyle(card.querySelector('.wa-kit-meta')!).color), background)
                : null,
            };
          });
          const header = rgba(getComputedStyle(document.querySelector('header')!).backgroundColor);
          return {
            cards, headerOpacity: header.a,
            width: document.documentElement.scrollWidth,
            tokens: Object.fromEntries([
              '--wa-surface', '--wa-accent-soft', '--wa-gold-soft',
              '--wa-hero-crimson', '--wa-hero-crimson-dark', '--wa-hero-gold', '--wa-hero-gold-dark',
            ].map((name) => [name, token(name)])),
          };
        });

        expect(rendered.width, 'fixture must fit the viewport').toBeLessThanOrEqual(width);
        expect(rendered.headerOpacity, 'navigation remains readable over scrolled content').toBeGreaterThanOrEqual(.95);
        for (const card of rendered.cards) {
          if (['standard', 'astryx'].includes(card.name)) {
            expect(card.image, `${card.name} is a solid reading surface`).toBe('none');
            expect(card.background, `${card.name} uses the reading surface token`).toEqual(rendered.tokens['--wa-surface']);
            expect(card.mutedRatio!).toBeGreaterThanOrEqual(4.5);
          } else if (card.name === 'tinted') {
            expect(card.image).toBe('none');
            expect(card.background).toEqual(rendered.tokens['--wa-accent-soft']);
          } else {
            const hue = card.name === 'crimson' ? 'crimson' : 'gold';
            if (surface === 'warm') {
              expect(card.stops, `${card.name} retains its hero gradient`).toEqual([
                rendered.tokens[`--wa-hero-${hue}`], rendered.tokens[`--wa-hero-${hue}-dark`],
              ]);
            } else {
              expect(card.image, `${card.name} is a calm dense tint`).toBe('none');
              expect(card.background).toEqual(rendered.tokens[hue === 'crimson' ? '--wa-accent-soft' : '--wa-gold-soft']);
            }
          }
          for (const ratio of card.textRatios) expect(ratio, `${card.name} text contrast`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
}
