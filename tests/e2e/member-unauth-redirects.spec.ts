import { expect, test, type Page } from '@playwright/test';
import { DEV_MEMBER_ALIASES, DEV_MEMBER_AUTH_PATHS } from '../../app/dev/member/harness/registry';

async function sentToLogin(page: Page, path: string): Promise<string | null> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (/\/login(?:\?|$)/.test(page.url())) return null;
  try {
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible({
      timeout: 8000,
    });
    return null;
  } catch {
    return `${path} landed on ${page.url()}`;
  }
}

test.describe('member routes — logged-out redirects', () => {
  test('every inventory member path sends visitors to login', async ({ page }) => {
    test.setTimeout(180_000);
    const failures: string[] = [];
    for (const path of DEV_MEMBER_AUTH_PATHS) {
      const failure = await sentToLogin(page, path);
      if (failure) failures.push(failure);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('inventory aliases reach login (or their target, then login)', async ({ page, request }) => {
    test.setTimeout(120_000);
    const hopFailures: string[] = [];
    for (const alias of DEV_MEMBER_ALIASES) {
      const response = await request.get(alias.path, { maxRedirects: 0 });
      const location = response.headers().location ?? '';
      const redirected = [301, 302, 303, 307, 308].includes(response.status());
      const toLogin = /\/login(?:\?|$)/.test(location);
      const toTarget = location.includes(alias.target.split('?')[0]!.split('#')[0]!);
      if (response.status() !== 200 && !(redirected && (toLogin || toTarget || alias.authFirst))) {
        hopFailures.push(`${alias.path} hop ${response.status()} ${location || '(no location)'}`);
      }
    }
    expect(hopFailures, hopFailures.join('\n')).toEqual([]);

    const landFailures: string[] = [];
    for (const alias of DEV_MEMBER_ALIASES) {
      const failure = await sentToLogin(page, alias.path);
      if (failure) landFailures.push(failure);
    }
    expect(landFailures, landFailures.join('\n')).toEqual([]);
  });
});
