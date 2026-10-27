import { defineConfig } from '@playwright/test';
import { PORTAL_REVIEW_FIXTURES } from './lib/dev/portalReviewFixtures';

/** Separate from product smoke config: no inherited URL, secrets, retries or global headers. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'portal-browser-acceptance.spec.mts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  metadata: { portalReviewFixtures: PORTAL_REVIEW_FIXTURES },
  timeout: 60 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/portal-browser-acceptance',
  snapshotPathTemplate: '{testDir}/../../test-results/portal-browser-acceptance-snapshots/{arg}{ext}',
  reporter: [['line']],
  use: { browserName: 'chromium', serviceWorkers: 'block', trace: 'off', video: 'off', screenshot: 'off' },
});
