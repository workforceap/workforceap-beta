import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Local-only: load `.env.e2e.local` (gitignored) so E2E_* reach Playwright workers. */
function loadE2EEnvFile(): void {
  const f = join(process.cwd(), '.env.e2e.local');
  if (!existsSync(f)) return;
  const raw = readFileSync(f, 'utf8');
  for (const line of raw.split(/\n/)) {
    const t = line.replace(/^\uFEFF/, '').trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t
      .slice(eq + 1)
      .trim()
      .replace(/\r$/, '');
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadE2EEnvFile();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
/** Staging/prod URL — do not boot `npm run dev`. */
const isRemoteBase =
  /^https?:\/\//i.test(baseURL) && !/localhost|127\.0\.0\.1/i.test(baseURL);
const vercelBypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '').trim();
const isVercelPreview = /\.vercel\.app$/i.test(new URL(baseURL).hostname);

type TraceSetting =
  | 'off'
  | 'on'
  | 'on-first-retry'
  | 'on-all-retries'
  | 'retain-on-failure'
  | 'retain-on-first-failure'
  | 'retain-on-failure-and-retries';

function parseTraceSetting(raw: string | undefined): TraceSetting | undefined {
  if (!raw) return undefined;
  const v = raw.trim() as TraceSetting;
  switch (v) {
    case 'off':
    case 'on':
    case 'on-first-retry':
    case 'on-all-retries':
    case 'retain-on-failure':
    case 'retain-on-first-failure':
    case 'retain-on-failure-and-retries':
      return v;
    default:
      return undefined;
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    ...((vercelBypass || isVercelPreview)
      ? {
          extraHTTPHeaders: {
            ...(vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : {}),
            ...(isVercelPreview ? { 'x-vercel-skip-toolbar': '1' } : {}),
          },
        }
      : {}),
    trace: parseTraceSetting(process.env.PLAYWRIGHT_TRACE) ?? 'on-first-retry',
    video: process.env.PLAYWRIGHT_VIDEO ? 'on' : 'off',
    screenshot: process.env.PLAYWRIGHT_SCREENSHOT ? 'on' : 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer:
    process.env.CI || isRemoteBase
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000/en/login',
          reuseExistingServer: !process.env.CI,
        },
});
