import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  inspectPortalPage,
  observeRedirectTargetCommit,
  waitForPortalReady,
  waitForRedirectTargetCommit as currentWaitForRedirectTargetCommit,
} from './lib/portal-audit-browser.mjs';
import {
  classifyReadOnlyAuditRequest,
  consumedNoticeAuditUrl,
  redirectDestinationFailureReasons,
  redirectTargetMatches,
} from './lib/portal-audit-actions.mjs';

// Disposable localhost fixtures only; no app, account, database or hosted target.
// --baseline imports the old waiter unchanged. The observer remains passive:
// an old waiter ignores it, exposing the original post-navigation ordering bug.
const baselineIndex = process.argv.indexOf('--baseline');
const waitForRedirectTargetCommit = baselineIndex < 0
  ? currentWaitForRedirectTargetCommit
  : (await import(pathToFileURL(resolve(process.argv[baselineIndex + 1])).href)).waitForRedirectTargetCommit;
const earlyOnly = process.argv.includes('--early-only');
const target = '/dashboard/program?error=course_not_assigned';
const notice = { param: 'error', selector: '[data-coursera-launch-error="course_not_assigned"]' };
let scenario;
let writesReachedServer = 0;
const handler = (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'POST') writesReachedServer += 1;
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (url.pathname === '/source') {
    response.writeHead(302, { location: scenario.destination });
    response.end();
    return;
  }
  response.writeHead(scenario.status ?? 200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><html ${scenario.noCapability ? '' : 'data-portal-read-only-audit="1"'}>
    <head><title>Redirect fixture</title><script>
    window.fixtureTiming = [{ actor: 'destination_head', at: performance.now(), url: location.href }];
    ${scenario.consume ? `const destination = new URL(location.href); destination.searchParams.delete('error');
      history.replaceState(null, '', destination);
      window.fixtureTiming.push({ actor: 'query_consumed', at: performance.now(), url: location.href });` : ''}
    </script></head><body><main id="main-content">
    ${scenario.notReady ? '<button>Fixture control</button>' : '<h1>Training program</h1>'}
    <p>Your training program information is available here.</p>
    ${scenario.missingNotice ? '' : `<div data-coursera-launch-error="course_not_assigned"
      ${scenario.hiddenNotice ? 'hidden' : ''}>The requested course is not assigned.</div>`}
    <div data-portal-audit-suppressed="root-gtm-sentry-utm-and-provider-metrics"></div>
    ${scenario.write ? '<script>void fetch("/api/member/fixture", { method: "POST" }).catch(() => {});</script>' : ''}
    </main></body></html>`);
};
const servers = [createServer(handler), createServer(handler)];
for (const server of servers) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
}
const [origin, otherOrigin] = servers.map((server) => `http://127.0.0.1:${server.address().port}`);
const receipts = [];
let browser;

async function check(name, configuration, expectedFailure = null) {
  scenario = { destination: `${origin}${target}`, ...configuration };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let blockedWrites = 0;
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (classifyReadOnlyAuditRequest(request.method(), request.url(), origin) === 'block') {
      blockedWrites += 1;
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  const page = await context.newPage();
  const matches = (url) => redirectTargetMatches(url.toString(), target, origin);
  const observation = observeRedirectTargetCommit(page, matches);
  const documentResponses = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'document') documentResponses.push(response);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  let committedUrl = null;
  let failures = [];
  let probeError = null;
  try {
    await page.goto(`${origin}/source`, { waitUntil: 'domcontentloaded', timeout: 3_000 });
    try {
      committedUrl = await waitForRedirectTargetCommit(page, matches, 400, observation);
    } catch (error) {
      failures.push('redirect_commit_missing');
      probeError = error.message;
    }
    if (committedUrl !== null) {
      await waitForPortalReady(page, 1_000);
      const noticeVisible = await page.locator(notice.selector).first()
        .waitFor({ state: 'visible', timeout: 150 }).then(() => true, () => false);
      if (!noticeVisible) failures.push('consumed_notice_missing');
      const finalUrl = consumedNoticeAuditUrl(page.url(), target, notice, noticeVisible);
      const inspection = await inspectPortalPage(page);
      failures.push(...redirectDestinationFailureReasons({
        finalUrl, expectedTarget: target, trustedOrigin: origin,
        documentStatus: documentResponses.at(-1)?.status() ?? null, inspection,
        consoleErrorCount: consoleErrors.length, pageErrorCount: pageErrors.length,
        blockedWriteRequestCount: blockedWrites,
      }));
    }
    const timing = await page.evaluate(() => window.fixtureTiming);
    if (name === 'query consumed before the post-navigation check') {
      assert.ok(timing.some((event) => event.actor === 'query_consumed'));
      assert.equal(new URL(page.url()).search, '');
      assert.equal(timing[0].url, `${origin}${target}`);
    }
    const receipt = { name, committedUrl, finalUrl: page.url(), failures, probeError, timing };
    console.log(JSON.stringify(receipt));
    if (expectedFailure) assert.ok(failures.includes(expectedFailure), `${name}: ${JSON.stringify(failures)}`);
    else assert.deepEqual(failures, [], name);
    if (configuration.write) {
      assert.equal(blockedWrites, 1);
      assert.equal(writesReachedServer, 0);
    }
    receipts.push({ name, ok: true });
  } finally {
    observation.detach();
    await context.close();
  }
}

try {
  browser = await chromium.launch({ headless: true });
  await check('query consumed before the post-navigation check', { consume: true });
  if (!earlyOnly) {
    await check('query still present when checked', { consume: false });
    for (const [name, destination] of [
      ['wrong origin', `${otherOrigin}${target}`],
      ['wrong path', `${origin}/dashboard/other?error=course_not_assigned`],
      ['wrong query', `${origin}/dashboard/program?error=unexpected`],
      ['extra query', `${origin}${target}&unexpected=1`],
      ['duplicate unexpected parameters', `${origin}${target}&unexpected=1&unexpected=2`],
      ['duplicate error after expected value', `${origin}${target}&error=unexpected`],
      ['duplicate error before expected value', `${origin}/dashboard/program?error=unexpected&error=course_not_assigned`],
      ['duplicate identical error', `${origin}${target}&error=course_not_assigned`],
      ['wrong fragment', `${origin}${target}#unexpected`],
    ]) await check(name, { destination, consume: true }, 'redirect_commit_missing');
    await check('missing notice', { consume: true, missingNotice: true }, 'consumed_notice_missing');
    await check('hidden notice', { consume: true, hiddenNotice: true }, 'consumed_notice_missing');
    await check('destination document 500', { consume: true, status: 500 }, 'redirect_destination_document_not_200');
    await check('destination not ready', { consume: true, notReady: true }, 'redirect_destination_not_ready');
    await check('read-only capability missing', { consume: true, noCapability: true }, 'read_only_audit_capability_not_active');
    await check('write request blocked and fatal', { consume: true, write: true }, 'non_get_request_blocked');
  }
  console.log(JSON.stringify({ fixture: 'disposable_localhost_chromium', baseline: baselineIndex >= 0,
    passed: receipts.length, checks: receipts }, null, 2));
} finally {
  await browser?.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}
