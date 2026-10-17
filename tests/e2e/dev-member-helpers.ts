import { expect, type Page } from '@playwright/test';

export const DEV_MEMBER_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const BANNED = [/\bpartner\b/i, /\bportfolio\b/i, /exam voucher/i];

const IGNORED_CONSOLE = [
  /\/api\/tours\//i,
  /\/api\/onboarding\//i,
  /Failed to load resource: the server responded with a status of 401/,
  /Failed to load resource: the server responded with a status of 404/,
  /net::ERR_/,
  /vercel\.live/i,
  /Content Security Policy/i,
  /feedback\.js/i,
];

export async function stubDevMemberNoise(page: Page): Promise<void> {
  await page.route('**/api/tours/**', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/onboarding/**', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/member/messages**', (route) => {
    if (route.request().method() === 'GET' || route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  return errors;
}

export async function openDevMember(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
}

export async function expectExampleDataBanner(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /example data/i }).first()).toBeVisible();
}

export async function expectNoBannedHarnessCopy(page: Page): Promise<void> {
  const text = (await page.locator('[data-dev-member-harness]').innerText()).replace(/\s+/g, ' ');
  for (const pattern of BANNED) {
    expect(text, `banned copy matching ${pattern}`).not.toMatch(pattern);
  }
}

export async function expectPrimaryCtasNotInfoBlue(page: Page): Promise<void> {
  const blueLabels = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--wa-info)';
    document.body.appendChild(probe);
    const info = getComputedStyle(probe).color;
    probe.remove();
    const root = document.querySelector('[data-dev-member-harness]');
    if (!root) return ['missing harness root'];
    const ctas = [
      ...root.querySelectorAll('.wa-kit-cta:not(.wa-kit-cta--ghost), .wa-kit-cta--xl:not(.wa-kit-cta--ghost)'),
    ];
    return ctas
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') return false;
        return style.backgroundColor === info;
      })
      .map((el) => (el.textContent ?? '').trim() || el.outerHTML.slice(0, 80));
  });
  expect(blueLabels, 'primary CTAs must not use --wa-info blue').toEqual([]);
}

export async function expectDevMemberSmoke(page: Page, errors: string[]): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectExampleDataBanner(page);
  await expectNoBannedHarnessCopy(page);
  await expectPrimaryCtasNotInfoBlue(page);
  expect(errors, errors.join('\n')).toEqual([]);
}
