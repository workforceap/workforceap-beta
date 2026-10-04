import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { inspectPortalPage } from './lib/portal-audit-browser.mjs';
import {
  classifyCollectedPortalAuditRow,
  trackSameOriginDataRequests,
} from './lib/portal-audit-data-requests.mjs';

// Disposable localhost fixture only: no app server, credentials, database or preview.
const billingPath = '/admin/members/fixture/billing';
const apiPath = '/api/admin/members/fixture/billing/two-stage/cases';
const native503 = 'Failed to load resource: the server responded with a status of 503';
const gateBody = (code) => JSON.stringify({ code, message: 'fixture unavailable state' });
let scenario;
let responseIndex = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (url.pathname === billingPath) {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><html data-portal-read-only-audit="1"><head>
      <title>Member billing</title></head><body><main id="main-content">
      <h1>Member billing</h1><p>Two-stage billing is not available in this environment yet.</p>
      <div data-portal-audit-suppressed="root-gtm-sentry-utm-and-provider-metrics"></div>
      </main></body></html>`);
    return;
  }
  if (url.pathname === '/admin/members' && url.searchParams.has('_rsc')) {
    return; // The browser's AbortController cancels this prefetch.
  }
  response.writeHead(503, { 'content-type': 'application/json' });
  response.flushHeaders();
  if (scenario.hung) return;
  if (scenario.unreadable) {
    response.write('{"code":');
    setTimeout(() => response.destroy(), 10);
    return;
  }
  response.end(scenario.bodies[Math.min(responseIndex++, scenario.bodies.length - 1)]);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const receipts = [];

async function check(name, configuration, verify) {
  scenario = configuration;
  responseIndex = 0;
  const context = await browser.newContext();
  const page = await context.newPage();
  const dataRequests = trackSameOriginDataRequests(page, { trustedOrigin: origin });
  const nativeMessages = [];
  const pageErrors = [];
  page.on('console', (message) => {
    dataRequests.recordConsoleError(message);
    if (message.text().startsWith(native503) && message.args().length === 0) {
      nativeMessages.push({ text: message.text(), url: message.location().url });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    const documentResponse = await page.goto(`${origin}${billingPath}`);
    const endpoint = configuration.otherPath ? '/api/health' : apiPath;
    if (configuration.hung) {
      const receivedHeaders = page.waitForResponse((response) => response.url() === `${origin}${endpoint}`);
      await page.evaluate((path) => { void fetch(path).then((response) => response.text()).catch(() => {}); }, endpoint);
      await receivedHeaders;
    } else {
      await page.evaluate(async ({ path, count }) => {
        for (let index = 0; index < count; index += 1) {
          await fetch(path).then((response) => response.text()).catch(() => {});
        }
      }, { path: endpoint, count: configuration.bodies?.length ?? 1 });
    }
    if (configuration.appError) {
      await page.evaluate((text) => console.error(text), configuration.appError);
    }
    if (configuration.prefetch) {
      const started = page.waitForRequest((request) => request.url() === `${origin}/admin/members?_rsc=fixture`);
      await page.evaluate(() => {
        window.fixtureAbort = new AbortController();
        void fetch('/admin/members?_rsc=fixture', {
          headers: { rsc: '1', 'next-router-prefetch': '1' }, signal: window.fixtureAbort.signal,
        }).catch(() => {});
      });
      await started;
      const canceled = page.waitForEvent('requestfailed', {
        predicate: (request) => request.url().endsWith('/admin/members?_rsc=fixture'),
      });
      await page.evaluate(() => window.fixtureAbort.abort());
      await canceled;
    }
    const startedAt = Date.now();
    await dataRequests.waitForSettlement(configuration.hung ? 100 : 2_000);
    const inspection = await inspectPortalPage(page);
    const row = classifyCollectedPortalAuditRow({
      ...inspection,
      path: billingPath, finalUrl: page.url(), sectionRoot: '/admin',
      originMatched: new URL(page.url()).origin === origin,
      documentStatus: documentResponse.status(), title: await page.title(), pageErrors,
    }, dataRequests);
    assert.ok(nativeMessages.length > 0, `${name}: Chromium emitted its real resource diagnostic`);
    assert.ok(nativeMessages.every(({ url }) => url === `${origin}${endpoint}`), `${name}: native resource location`);
    verify({ row, dataRequests, elapsedMs: Date.now() - startedAt });
    receipts.push({ name, ok: true, nativeResourceDiagnosticCount: nativeMessages.length,
      consoleErrorCount: row.consoleErrorCount, pageErrorCount: row.pageErrorCount,
      abortedDataRequestCount: row.abortedDataRequestCount });
  } finally {
    dataRequests.detach();
    await context.close();
  }
}

try {
  browser = await chromium.launch({ headless: true });
  await check('expected gate plus verified prefetch abort', {
    bodies: [gateBody('MIGRATION_NOT_APPLIED')], prefetch: true,
  }, ({ row }) => {
    assert.equal(row.ok, true);
    assert.equal(row.consoleErrorCount, 0);
    assert.equal(row.pageErrorCount, 0);
    assert.equal(row.abortedDataRequestCount, 1);
    assert.equal(row.abortedDataRequests[0].prefetch, true);
    assert.equal(row.abortedDataRequests[0].rsc, true);
  });
  for (const appError of ['TypeError: unrelated billing UI crash', `${native503} (Service Unavailable)`]) {
    await check('application console error remains fatal', {
      bodies: [gateBody('MIGRATION_NOT_APPLIED')], appError,
    }, ({ row }) => {
      assert.equal(row.ok, false);
      assert.equal(row.consoleErrorCount, 1);
      assert.ok(row.failureReasons.includes('console_errors'));
    });
  }
  for (const body of [gateBody('SOMETHING_ELSE_BROKE'), gateBody('PROVIDER_ORG_MISCONFIGURED'), '<html>503</html>']) {
    await check('unknown, audited or malformed gate stays fatal', { bodies: [body] }, ({ row }) => {
      assert.equal(row.ok, false);
      assert.equal(row.consoleErrorCount, 1);
      assert.ok(row.failureReasons.includes('page_errors'));
    });
  }
  await check('mixed gate bodies at the same URL stay fatal', {
    bodies: [gateBody('MIGRATION_NOT_APPLIED'), gateBody('SOMETHING_ELSE_BROKE')],
  }, ({ row }) => {
    assert.equal(row.ok, false);
    assert.ok(row.consoleErrorCount > 0);
    assert.ok(row.pageErrorCount > 0);
  });
  await check('unrelated API 503 stays fatal', {
    bodies: [gateBody('MIGRATION_NOT_APPLIED')], otherPath: true,
  }, ({ row }) => assert.equal(row.ok, false));
  await check('unreadable gate body stays fatal', { unreadable: true }, ({ row }) => {
    assert.equal(row.ok, false);
    assert.ok(row.pageErrorCount > 0);
  });
  await check('hung gate body fails within settlement deadline', { hung: true }, ({ row, elapsedMs }) => {
    assert.equal(row.ok, false);
    assert.ok(row.pageErrorCount > 0);
    assert.ok(elapsedMs < 1_000);
  });
  console.log(JSON.stringify({ fixture: 'disposable_localhost_chromium', checks: receipts }, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
