import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo-only synthetic fixture check. No server, provider calls, or live credentials.
// Requires the existing local repo dependencies and a supplied local Chromium.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const require = createRequire(path.join(repoRoot, 'package.json'));
const { chromium } = require('@playwright/test');
const sourcePath = 'docs/mockups/portal-review/skill-mapper-review.js';
const cssPaths = [
  'css/wa-brand-tokens.css',
  'css/portal-tokens.css',
  'docs/mockups/portal-review/review.css',
  'docs/mockups/portal-review/theme-review.css',
  'docs/mockups/portal-review/skill-mapper-review.css',
];
const source = readFileSync(path.join(repoRoot, sourcePath), 'utf8');
const css = cssPaths.map(file => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
const inputs = Object.fromEntries([sourcePath, ...cssPaths].map(file => [
  file, createHash('sha256').update(readFileSync(path.join(repoRoot, file))).digest('hex'),
]));
const browser = await chromium.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
const report = [];

try {
  for (const inline of [false, true]) for (const width of [375, 768, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce', acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', request => {
      requests.push(request.request().url());
      return request.abort();
    });
    await page.setContent('<!doctype html><html data-theme="' + (inline ? 'host-light' : theme) + '"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="scope" data-theme="' + theme + '" style="max-width:1000px;margin:0 auto;padding:16px"><div id="mount"></div></div></body></html>');
    await page.addStyleTag({ content: css + '\n#scope[data-theme=light]{color-scheme:light}#scope[data-theme=dark]{color-scheme:dark}' });
    await page.evaluate(() => {
      window.__calls = [];
      window.fetch = () => { window.__calls.push('fetch'); throw Error('Network forbidden'); };
    });
    await page.addScriptTag({ content: source });
    await page.evaluate(inline => {
      const root = inline ? document.getElementById('scope') : document;
      document.getElementById('mount').innerHTML = window.skillMapperRouteView('/dashboard/ai-tools/skill-mapper');
      window.bindSkillMapperReview(root);
      window.bindSkillMapperReview(root);
    }, inline);
    assert.equal(await page.evaluate(() => window.skillMapperRouteView('/admin/members')), null);
    const query = page.getByLabel('Search sample occupations');
    await query.fill('z');
    await page.getByRole('button', { name: 'Search occupations', exact: true }).click();
    assert.equal(await query.getAttribute('aria-invalid'), 'true');
    await query.fill('no-such-fixture-role');
    await page.getByRole('button', { name: 'Search occupations', exact: true }).click();
    assert.ok((await page.locator('.sm-search-results').innerText()).includes('No match in this limited sample catalog'));
    await query.fill('IT support');
    await page.getByRole('button', { name: 'Search occupations', exact: true }).click();
    await page.locator('.sm-search-results button').filter({ hasText: 'Computer User Support Specialists' }).click();
    assert.equal(await page.locator('.sm-score-table:visible tbody tr').count(), 6);
    const ink = () => page.locator('canvas:visible').evaluate(element => Array.from(element.getContext('2d').getImageData(0, 0, element.width, element.height).data).filter((_, index) => index % 4 === 3).reduce((total, alpha) => total + alpha, 0));
    assert.ok(await ink() > 100000, 'Radar was not painted');

    await query.fill('An unsent search draft');
    await query.evaluate(element => { element.dataset.probe = 'same-input'; element.setSelectionRange(3, 9); });
    const before = await page.locator('canvas:visible').evaluate(element => element.toDataURL());
    await page.evaluate(({ inline, theme }) => {
      const element = inline ? document.getElementById('scope') : document.documentElement;
      element.dataset.theme = theme === 'dark' ? 'light' : 'dark';
      document.getElementById('scope').dataset.theme = element.dataset.theme;
    }, { inline, theme });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await query.inputValue(), 'An unsent search draft');
    assert.equal(await query.getAttribute('data-probe'), 'same-input');
    assert.deepEqual(await query.evaluate(element => [element.selectionStart, element.selectionEnd]), [3, 9]);
    assert.notEqual(await page.locator('canvas:visible').evaluate(element => element.toDataURL()), before, 'Canvas did not follow theme');
    if (inline) assert.equal(await page.locator('html').getAttribute('data-theme'), 'host-light');

    await page.getByRole('tab', { name: 'Occupation search', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'My skills profile', exact: true }).getAttribute('aria-selected'), 'true');
    const engineering = page.locator('.sm-score-table:visible tbody tr').filter({ hasText: 'Engineering' });
    assert.deepEqual(await engineering.locator('td').allTextContents(), ['48', '74', '+26']);
    assert.equal(await page.locator('.sm-grouped-row:visible').count(), 6);
    assert.ok((await page.locator('.sm-gaps:visible').innerText()).includes('+26 points'));
    await page.locator('.sm-training:visible summary').first().click();
    assert.ok((await page.locator('.sm-training:visible details[open]').innerText()).includes('enrollment'));

    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export sample JSON', exact: true }).click();
    const download = await downloaded;
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.sample, true);
    assert.equal(exported.liveOnet, false);
    assert.equal(exported.scores.length, 6);
    assert.equal(exported.occupation.code, '15-1232.00');
    assert.ok(exported.training.length > 0);
    assert.deepEqual(JSON.parse(await page.getByLabel('Sample report contents').inputValue()), exported);
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export sample CSV', exact: true }).click();
    const csv = await csvDownload;
    assert.ok(readFileSync(await csv.path(), 'utf8').includes('Synthetic / no live O*NET'));

    await page.evaluate(inline => {
      document.getElementById('mount').innerHTML = '<p>Another review route</p>';
      document.getElementById('mount').innerHTML = window.skillMapperRouteView({ route: '/dashboard/ai-tools/skill-mapper' });
      window.bindSkillMapperReview(inline ? document.getElementById('scope') : document);
    }, inline);
    assert.equal(await page.locator('.sm-history li').count(), 1);
    assert.equal(await query.inputValue(), 'An unsent search draft');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Horizontal overflow');
    await page.evaluate(() => window.resetSkillMapperReview());
    assert.equal(await page.locator('.sm-history li').count(), 0);
    assert.equal(await query.inputValue(), '');
    assert.equal(await page.locator('canvas:visible').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    assert.deepEqual(await page.evaluate(() => window.__calls), []);
    report.push({ inline, width, theme, result: 'pass' });
    await context.close();
  }
  const receipt = {
    kind: 'isolated-synthetic-skill-mapper-module-check',
    timestamp: new Date().toISOString(),
    passed: report.length,
    cases: report,
    checks: 'Search validation/empty/results; painted radar; exact comparison/gaps; course detail; JSON/CSV contents; copy fallback; keyboard tabs; theme draft and selection continuity; route rerender continuity; reset; no overflow/errors/network',
    limitations: 'This fixture checks the module with actual repository CSS. It does not exercise the assembled hosted artifact, production O*NET, provider/API health, or real user data.',
    inputs,
  };
  const receiptPath = process.env.WAP_SKILL_CHECK_RECEIPT || '/tmp/wap-skill-mapper-module-check.json';
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
} finally {
  await browser.close();
}
