#!/usr/bin/env node
/**
 * Real Chromium regression for the production message components. All transport
 * is mocked. Run with Node 22 and installed Playwright Chromium:
 *   node scripts/test-member-message-continuity-browser.mjs [output-directory]
 * Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH selects an existing browser.
 * No Next server, credentials, database, email or hosted writes are involved.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// esbuild is the installed tsx runtime's dependency; no new package is needed.
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
const postcss = createRequire(require.resolve('tailwindcss/package.json'))('postcss');
const tailwind = require('tailwindcss');
const loadTailwindConfig = require('tailwindcss/loadConfig');
const temp = await mkdtemp(path.join(tmpdir(), 'wap-message-browser-'));
const output = path.resolve(process.argv[2] ?? path.join(temp, 'evidence'));
await mkdir(output, { recursive: true });
const components = ['DesignSurface', 'Avatar', 'ChatThread', 'KitEmptyState', 'PageOpener'];
let browser;
const checks = [];

try {
  await build({
    absWorkingDir: root,
    entryPoints: ['tests/fixtures/member-message-continuity/browser.tsx'],
    outfile: path.join(temp, 'fixture.js'), bundle: true, platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'local-mocked-transport',
      setup(plugin) {
        plugin.onResolve({ filter: /^(@\/lib\/supabase\/browser|@\/components\/portal\/kit|next\/link)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({
          loader: 'tsx', resolveDir: root,
          contents: name === '@/components/portal/kit'
            ? components.map((item) => `export { ${item} } from ${JSON.stringify(path.join(root, 'components/portal/kit', `${item}.tsx`))};`).join('\n')
            : name === 'next/link'
              ? 'export default function Link(props) { return <a {...props} />; }'
              : `export function createSupabaseBrowserClient() { return {
                  channel() { const channel = {
                    on(_event, filter, callback) {
                      if (filter.filter !== 'thread_id=eq.fixture-thread') throw new Error('Unexpected fixture thread');
                      window.messageFixture.insert = callback; return channel;
                    }, subscribe() { return channel; }
                  }; return channel; }, removeChannel() { delete window.messageFixture.insert; }
                }; }`,
        }));
      },
    }],
  });
  const mainCss = path.join(root, 'css/main.css');
  const config = loadTailwindConfig(path.join(root, 'tailwind.config.ts'));
  config.content = config.content.map((pattern) => path.join(root, pattern));
  const compiledCss = await postcss([tailwind(config)]).process(await readFile(mainCss, 'utf8'), { from: mainCss });
  // esbuild emits the current inbox's CSS module with the class names used by
  // the bundled component. Include it so this proof exercises its real layout.
  const css = [compiledCss.css, await readFile(path.join(temp, 'fixture.css'), 'utf8')];
  for (const name of ['wa-brand-tokens.css', 'portal-tokens.css', 'portal-kit.css']) {
    css.push((await readFile(path.join(root, 'css', name), 'utf8')).replace(/^@import[^;]+;/gm, ''));
  }
  css.push('body{margin:0;background:var(--wa-bg);color:var(--wa-text);font-family:Arial,sans-serif}.fixture-banner{padding:20px 24px;display:flex;gap:20px;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid var(--wa-border)}main{padding:24px 8px}.fixture-footer{min-height:360px;padding:24px;color:var(--wa-muted);font-size:14px}');
  const js = await readFile(path.join(temp, 'fixture.js'));
  const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Member message continuity · mocked component review</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
  // Fulfil the entire fixture in memory. No listening port or outbound request
  // is necessary, including for HTML, scripts and production stylesheets.
  const assets = { '/': ['text/html', html], '/fixture.js': ['text/javascript', js], '/fixture.css': ['text/css', css.join('\n')] };
  const origin = 'http://member-message-fixture.test';
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });

  for (const width of [375, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      const blocked = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('**/*', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const asset = url.origin === origin && request.method() === 'GET' ? assets[url.pathname] : undefined;
        if (asset) return route.fulfill({ status: 200, contentType: asset[0], body: asset[1] });
        blocked.push(`${request.method()} ${request.url()}`);
        return route.abort();
      });
      await page.goto(origin);
      if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
      const log = page.getByRole('log', { name: 'Message history' });
      await expect(log).toBeVisible();
      await page.waitForFunction(() => Boolean(window.messageFixture.insert));
      await expect.poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 40));
      await log.evaluate((node) => new Promise((resolve) => {
        node.addEventListener('scroll', () => resolve(undefined), { once: true });
        node.scrollTop = 120;
      }));
      await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(120);
      const before = await page.evaluate(() => ({ outer: window.scrollY, inner: document.querySelector('[role="log"]').scrollTop }));
      await page.evaluate(() => window.messageFixture.insert({ new: { id: 'new-reply', author_id: 'fixture-counselor', body: 'New counselor reply while you read earlier messages.\n' + 'LongUnbrokenMessage'.repeat(20), created_at: '2026-10-20T17:00:00.000Z' } }));
      const latest = page.getByRole('button', { name: 'New message — show latest', exact: true });
      await expect(latest).toBeVisible();
      assert.equal(await log.evaluate((node) => node.scrollTop), before.inner, 'incoming reply keeps reading position');
      assert.equal(await page.evaluate(() => window.scrollY), before.outer, 'incoming reply does not scroll the page');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'long messages do not overflow the viewport');
      await page.screenshot({ path: path.join(output, `messages-${width}-${theme}-reading.png`), fullPage: true });
      await latest.click();
      await expect(latest).toHaveCount(0);
      await expect(log).toBeFocused();
      await expect.poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
      assert.equal(await page.evaluate(() => window.scrollY), before.outer, 'show latest scrolls only the message log');

      const composer = page.getByRole('textbox');
      await composer.fill('Submitted fixture draft');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      const pending = page.locator('[data-message-id^="temp-"]');
      await expect(pending).toContainText('Sending…');
      await expect(pending.locator('time')).toHaveCount(0);
      await composer.fill('New draft while the first send is pending');
      await page.evaluate(() => window.messageFixture.settle(true, true));
      await expect(page.locator('[data-message-id="saved-fixture"]')).toHaveCount(1);
      await expect(page.locator('[data-message-id="saved-fixture"] time')).toHaveAttribute('datetime', '2026-10-20T17:30:00.000Z');
      await expect(composer).toHaveValue('New draft while the first send is pending');
      await expect(pending).toHaveCount(0);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.waitForFunction(() => Boolean(window.messageFixture.settle));
      await page.evaluate(() => window.messageFixture.settle(false));
      await expect(page.getByRole('alert')).toContainText('Fixture send failed');
      await expect(composer).toHaveValue('New draft while the first send is pending');
      if (width < 768) {
        await log.evaluate((node) => new Promise((resolve) => {
          node.addEventListener('scroll', () => resolve(undefined), { once: true });
          node.scrollTop = 120;
        }));
        await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(120);
        await page.getByRole('button', { name: 'Back to messages' }).click();
        await expect(log).not.toBeVisible();
        await page.getByRole('button', { name: /Fixture Counselor Assigned counselor/ }).click();
        await expect(log).toBeVisible();
        await expect(composer).toHaveValue('New draft while the first send is pending');
        assert.equal(await log.evaluate((node) => node.scrollTop), 120, 'mobile return preserves the reading position');
      }
      await page.screenshot({ path: path.join(output, `messages-${width}-${theme}-latest.png`), fullPage: true });
      const requests = await page.evaluate(() => window.messageFixture.requests);
      assert.equal(requests.filter(({ method }) => method === 'POST').length, 2);
      assert.ok(requests.every(({ method, url }) => url === '/api/member/messages' && ['POST', 'PATCH'].includes(method)));
      assert.deepEqual(errors, []);
      assert.deepEqual(blocked, []);
      checks.push({ width, theme, reducedMotion: true, status: 'passed', checks: ['bounded inner scroll', 'reader position', 'outer page position', 'new-message action', 'focus continuity', 'long text wrap', 'pending without time', 'server timestamp', 'realtime echo dedupe', 'pending edit retained', 'failed draft retained', ...(width < 768 ? ['mobile back/return'] : [])], pageErrors: errors, unexpectedNetwork: blocked, mockedPostCount: 2 });
      if (width === 375 && theme === 'light') {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(`${origin}/?feedback=1`);
        const draft = page.getByRole('textbox');
        await expect(draft).toHaveValue('Course feedback fixture draft. Please help me review the next assignment.');
        await draft.evaluate((node) => { node.style.height = '1000px'; });
        const logHeight = await log.evaluate((node) => node.clientHeight);
        await page.screenshot({ path: path.join(output, 'messages-375-feedback-resize.png'), fullPage: true });
        assert.ok(logHeight > 80, `resizing a feedback draft leaves readable message history (${logHeight}px)`);
        const bounds = await draft.boundingBox();
        assert.ok(bounds && bounds.height <= 667 * 0.24 + 1, 'multiline composer stays within its viewport bound');
        await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
        assert.deepEqual(errors, []);
        assert.deepEqual(blocked, []);
        await page.screenshot({ path: path.join(output, 'messages-375-feedback-resize.png'), fullPage: true });
        checks.push({ width: 375, height: 667, theme: 'light', reducedMotion: true, status: 'passed', checks: ['feedback context retained', 'resizable composer capped', 'history remains readable', 'send action remains visible'], pageErrors: errors, unexpectedNetwork: blocked });
      }
      await context.close();
    }
  }
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ fixture: 'production message components with mocked transport; not hosted acceptance', checks }, null, 2) + '\n');
  console.log(JSON.stringify({ output, checks }, null, 2));
} finally {
  await browser?.close();
  // An explicitly requested output directory survives; otherwise keep the
  // evidence printed above and only discard build assets.
  if (process.argv[2]) await rm(temp, { recursive: true, force: true });
}
