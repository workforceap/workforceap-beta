import { test, expect } from '@playwright/test';
import { addAuthCookie } from './auth-helpers';

/**
 * Signed-in tests require valid Supabase auth. The cookie approach works when
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and the
 * cookie contains a valid session. For CI without test auth, signed-in tests may fail.
 */

test.describe('Member Portal MVP', () => {
  test('unauthenticated user cannot access dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.url()).toContain('redirectTo');
  });

  test('unauthenticated user cannot access resources', async ({ page }) => {
    await page.goto('/resources');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user cannot access ai-tools', async ({ page }) => {
    await page.goto('/dashboard/ai-tools');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user cannot access career-brief', async ({ page }) => {
    await page.goto('/dashboard/career-brief');
    await expect(page).toHaveURL(/\/login/);
  });

  // The member home is the kit home (MemberHomeKit); the legacy "Start here"
  // card went with the retired ?ui=legacy home (WAP-195).
  test('signed-in member sees the kit home opener and certification path', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/welcome back|home/i, { timeout: 10000 });
    await expect(page.getByText('Certification path')).toBeVisible();
  });

  test('signed-in member on a retired ?ui=legacy / ?tab= link lands on the one home', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/dashboard?ui=legacy&tab=learning');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Certification path')).toBeVisible({ timeout: 10000 });
  });

  test('signed-in member sees Resources page and filters', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/resources');
    await expect(page.getByRole('heading', { name: /career resources/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/filter by category/i)).toBeVisible();
    await expect(page.getByLabel(/filter by career stage/i)).toBeVisible();
  });

  test('signed-in member sees AI Tools route', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/dashboard/ai-tools');
    await expect(page.getByRole('heading', { name: /ai career toolkit/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/resume rewriter/i)).toBeVisible();
  });

  // Member benefits and how to request them live on Help, not the home.
  test('signed-in member sees benefit access on Help', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/dashboard/help');
    await expect(page.getByRole('heading', { name: /request benefit access/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Coursera Access')).toBeVisible();
  });

  test('signed-in member sees Career Brief list with dated rows', async ({ context, page, baseURL }) => {
    await addAuthCookie(context, baseURL || 'http://localhost:3000');
    await page.goto('/dashboard/career-brief');
    await expect(page.getByRole('heading', { name: /weekly career brief/i })).toBeVisible({ timeout: 10000 });
    const list = page.getByTestId('career-brief-list');
    await expect(list).toBeVisible();
    const firstRow = list.getByTestId('career-brief-row').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('.career-brief-date')).toHaveText(/\d{4}-\d{2}-\d{2}/);
  });
});
