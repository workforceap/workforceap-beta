/** Capture the already-validated artifact without repeating the full test matrix. */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fixturePath, titleFor } from './review-model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.WAP_REVIEW_EVIDENCE_DIR || resolve(here, 'evidence'));
const validationPath = process.argv[2];
assert.ok(validationPath, 'Pass the successful full review-results.json.');
const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
const artifactSha256 = createHash('sha256').update(readFileSync(resolve(here, 'index.html'))).digest('hex');
assert.equal(validation.artifactSha256, artifactSha256, 'Capture must use the validated artifact.');
assert.equal(validation.summary.routePass, 1596);
assert.equal(validation.summary.routeFail, 0);
assert.equal(validation.summary.interactionFail, 0);
assert.equal(validation.summary.pageErrors, 0);
assert.equal(validation.summary.externalRequests, 0);
const inventory = JSON.parse(readFileSync(resolve(here, 'route-inventory.json'), 'utf8'));
mkdirSync(resolve(out, 'screens'), { recursive: true });
const receipt = { artifactSha256, baseSha: inventory.baseSha, validationPath, screenshots: [], errors: [], externalRequests: [] };
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const url = pathToFileURL(resolve(here, 'index.html')).href;

try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 900 : 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => {
      const address = route.request().url();
      if (!address.startsWith('file:') && !address.startsWith('data:')) {
        receipt.externalRequests.push(address);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => receipt.errors.push(error.message));
    for (const item of inventory.routes) {
      await page.goto(url + '#' + encodeURI(fixturePath(item.route)));
      await page.locator('main h1').waitFor({ state: 'visible' });
      assert.equal(await page.locator('main h1').innerText(), item.kind === 'not-found' ? 'Screen not found' : titleFor(item));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const file = (item.route === '/' ? 'root' : item.route.replaceAll('/', '_').replaceAll('[', '').replaceAll(']', '').replaceAll('.', '')) + `-${width}-light.png`;
      await page.screenshot({ path: resolve(out, 'screens', file), fullPage: true });
      receipt.screenshots.push({ route: item.route, width, theme: 'light', file: 'screens/' + file, kind: item.kind });
      if (receipt.screenshots.length % 50 === 0) console.log(JSON.stringify({ captured: receipt.screenshots.length, target: 532 }));
    }
    await context.close();
  }
  assert.equal(receipt.screenshots.length, 532);
  assert.equal(receipt.errors.length, 0);
  assert.equal(receipt.externalRequests.length, 0);
  receipt.result = 'pass';
  // Preserve the original validation and capture receipts. This aggregate
  // explicitly joins two runs of the same immutable HTML, not one invented run.
  writeFileSync(resolve(out, 'review-results.json'), JSON.stringify({
    ...validation,
    combinedEvidence: true,
    validationReceipt: validationPath,
    captureReceipt: 'capture-results.json',
    screenshots: receipt.screenshots,
    summary: { ...validation.summary, screenshots: receipt.screenshots.length },
  }, null, 2));
} finally {
  await browser.close();
  writeFileSync(resolve(out, 'capture-results.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ result: receipt.result || 'incomplete', screenshots: receipt.screenshots.length, errors: receipt.errors.length, externalRequests: receipt.externalRequests.length }));
}
