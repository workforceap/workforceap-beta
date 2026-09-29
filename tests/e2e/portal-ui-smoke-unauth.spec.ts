import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR ?? path.join(process.cwd(), 'test-results', 'artifacts');

function artifactPath(name: string): string {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return path.join(ARTIFACTS_DIR, name);
}

/**
 * Portal UI smoke (unauth).
 * Verifies key pages render and shared primitives exist without needing credentials.
 */
test.describe('Portal UI smoke (unauth)', () => {
  test('login page shows new labels and portal destination links', async ({ page }) => {
    await page.goto('/login');
    // Client component — wait for hydration before checking visible elements
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /choose portal destination/i })).toBeVisible();
    await page.screenshot({ path: artifactPath('login_page.png'), fullPage: true });
  });

  test('protected portal pages redirect to login (baseline guardrail)', async ({ page }) => {
    const protectedPaths = ['/dashboard/messages', '/partner/messages', '/employer/messages', '/counselor/messages', '/admin/messages'];
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
    await page.screenshot({ path: artifactPath('protected_route_redirects_to_login.png'), fullPage: true });
  });
});

