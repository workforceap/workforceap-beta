import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { buildPreviewEnv } from './local-preview.mjs';

const require = createRequire(import.meta.url);
const { assertLocalOnly } = require('./lib/local-only-guard.cjs');
const env = buildPreviewEnv();
assertLocalOnly(env);
const base = `http://localhost:${env.PREVIEW_WEB_PORT}`;
const browser = await chromium.launch();
try {
  for (const [role, email, password] of [
    ['admin', env.PREVIEW_ADMIN_EMAIL, env.PREVIEW_ADMIN_PASSWORD],
    ['student', env.PREVIEW_STUDENT_EMAIL, env.PREVIEW_STUDENT_PASSWORD],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/en/login`);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 60000, waitUntil: 'domcontentloaded' });
    console.log(`${role}: login destination=${new URL(page.url()).pathname}`);
    const response = await page.goto(`${base}/admin/attendance/draft`);
    const heading = await page.locator('h1').first().textContent().catch(() => null);
    const result = { role, status: response?.status(), url: new URL(page.url()).pathname, heading };
    console.log(JSON.stringify(result));
    if (role === 'admin' && !(result.status === 200 && heading?.includes('Attendance draft PDF'))) throw new Error('admin did not reach draft page');
    if (role === 'student' && !(result.status === 403 || (result.url !== '/admin/attendance/draft' && result.url !== '/en/admin/attendance/draft'))) throw new Error('student was not denied admin draft page');
    await context.close();
  }
} finally {
  await browser.close();
}
