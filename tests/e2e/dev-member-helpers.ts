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

const C_NAV_LABELS = ['Home', 'My program', 'Job board', 'AI Career Tools', 'Messages'];

/**
 * Phone pass for the five direction-C screens: the page does not scroll
 * sideways, KPI and card text stay inside their boxes, the five-link nav
 * keeps its labels, and tables are stacked cards.
 */
export async function expectCScreenPhoneLayout(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const clipped: string[] = [];
    for (const el of document.querySelectorAll('.wa-kit-stat-label, .wa-kit-stat-tile__value')) {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
        clipped.push((el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
      }
    }
    for (const card of document.querySelectorAll('.wa-kit-card')) {
      const box = card.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      for (const child of card.querySelectorAll('h1, h2, h3, p, strong')) {
        const style = getComputedStyle(child);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = child.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.right > box.right + 2 || r.left < box.left - 2) {
          clipped.push((child.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60));
        }
      }
    }
    const nav = document.querySelector('.member-home-compact-nav');
    const top = document.querySelector('.member-portal-top-nav');
    const labels = nav
      ? [...nav.querySelectorAll('.member-home-compact-nav__link')].map((link) =>
          (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
        )
      : [];
    const tables = [...document.querySelectorAll('table')].filter((table) => {
      const r = table.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(table).display !== 'none';
    }).length;
    return {
      overflow: root.scrollWidth - root.clientWidth,
      clipped: [...new Set(clipped)].slice(0, 8),
      navDisplay: nav ? getComputedStyle(nav).display : 'missing',
      topDisplay: top ? getComputedStyle(top).display : 'missing',
      labels,
      tables,
    };
  });

  expect(result.overflow, 'phone page scrolls sideways').toBeLessThanOrEqual(1);
  expect(result.clipped, 'text past its card or KPI tile').toEqual([]);
  expect(result.navDisplay, 'labeled C nav is hidden').toBe('block');
  expect(result.topDisplay, 'icon strip is still showing').toBe('none');
  expect(result.labels).toEqual(C_NAV_LABELS);
  expect(result.tables, 'a table is still showing on the phone').toBe(0);
}

export async function expectDevMemberSmoke(page: Page, errors: string[]): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectExampleDataBanner(page);
  await expectNoBannedHarnessCopy(page);
  await expectPrimaryCtasNotInfoBlue(page);
  expect(errors, errors.join('\n')).toEqual([]);
}
