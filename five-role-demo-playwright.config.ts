import { defineConfig } from '@playwright/test';

// A dedicated config prevents inherited retries, bypass headers and sensitive traces.
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'five-role-demo-acceptance.spec.ts',
  retries: 0, workers: 1, timeout: 600_000,
  reporter: [['list']],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, trace: 'off', video: 'off', screenshot: 'off' },
});
