/** Browser-level regressions for the acceptance harness; all responses are disposable local fixtures. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { beginStaffDataReadiness, navigateMemberInventoryRoute } from '../../scripts/lib/portal-c-browser-readiness.mjs';

let server: Server;
let origin: string;
let heldResponses: Array<() => void> = [];
test.use({ extraHTTPHeaders: {}, trace: 'off', video: 'off' });

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    const scenario = url.searchParams.get('case') ?? '';
    const html = (content: string, script = '') => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><html><head><title>Portal C readiness fixture</title></head><body>${content}<script>${script}</script></body></html>`);
    };
    if (url.pathname === '/dashboard/mentor') return html('<h1>Previous member page</h1>', "setTimeout(() => location.replace('/mentor/apply'), 100)");
    if (url.pathname === '/mentor/apply') return html('<h1>Mentor with WorkforceAP</h1>', "fetch('/api/member-ready').then(() => document.body.dataset.ready = 'true')");
    if (url.pathname === '/dashboard/help') return html('<h1>Help</h1><p>Reach your advisor for help with your program.</p>');
    if (url.pathname === '/partner/attention') return html('<h1>Attention</h1><p>Loading…</p><button disabled>Refresh queue</button>', `
      Promise.all(['members/needs-attention', 'outreach', 'referral-members', 'team-assign'].map(path =>
        fetch('/api/partner/' + path + '?case=${scenario}').then(response => response.json())
      )).then(() => { document.querySelector('p').textContent = 'No logs yet.'; document.querySelector('button').disabled = false; });
    `);
    if (url.pathname === '/counselor/students/fixture-member') return html('<h1>Member</h1><p>Loading resume…</p>', `
      fetch('/api/counselor/members/fixture-member/resume?case=${scenario}').then(response => response.json())
        .then(() => { document.querySelector('p').textContent = 'No resume on file yet.'; });
    `);
    const bodies: Record<string, unknown> = {
      '/api/member-ready': { ready: true },
      '/api/partner/members/needs-attention': scenario === 'malformed' ? { members: [] } : {
        members: [], counts: { all: 0, high: 0, medium: 0, low: 0, watch: 0 }, total: 0, nextCursor: null,
      },
      '/api/partner/outreach': { logs: [] },
      '/api/partner/referral-members': { members: [] },
      '/api/partner/team-assign': { users: [] },
      '/api/counselor/members/fixture-member/resume': { hasOriginal: false, hasEnhanced: false },
    };
    if (url.pathname in bodies) {
      const status = scenario === 'failed' ? 500 : 200;
      const delay = url.pathname.endsWith('/outreach') || url.pathname.endsWith('/resume') ? 250 : 50;
      const send = () => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(bodies[url.pathname]));
      };
      if (scenario === 'held') heldResponses.push(send);
      else setTimeout(send, delay);
      return;
    }
    response.writeHead(404); response.end('Not found');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
test.beforeEach(() => { heldResponses = []; });

test('waits for the streamed mentor redirect before navigating to Help', async ({ page }) => {
  await navigateMemberInventoryRoute(page, `${origin}/dashboard/mentor`, { trustedOrigin: origin, expectedPath: '/mentor/apply' });
  await expect(page).toHaveURL(`${origin}/mentor/apply`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await navigateMemberInventoryRoute(page, `${origin}/dashboard/help`, { trustedOrigin: origin, expectedPath: '/dashboard/help' });
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
});

test('waits for every partner response and loaded UI before a screenshot', async ({ page }, info) => {
  const ready = beginStaffDataReadiness(page, '/partner/attention', origin);
  await page.goto(`${origin}/partner/attention?case=held`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading…', { exact: true })).toBeVisible();
  await expect.poll(() => heldResponses.length).toBe(4);
  let completed = false;
  const completion = ready().then(() => { completed = true; });
  expect(completed).toBe(false);
  heldResponses.forEach(send => send());
  await completion;
  await expect(page.getByText('No logs yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh queue' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('partner-readiness-fixture.png'), fullPage: true });
});

test('rejects malformed queue data even when the page renders an empty-looking state', async ({ page }) => {
  const ready = beginStaffDataReadiness(page, '/partner/attention', origin);
  await page.goto(`${origin}/partner/attention?case=malformed`);
  await expect(ready()).rejects.toThrow('attention queue response was not healthy');
});

test('waits for the member resume to replace its loading text', async ({ page }, info) => {
  const path = '/counselor/students/fixture-member';
  const ready = beginStaffDataReadiness(page, path, origin);
  await page.goto(`${origin}${path}?case=held`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading resume…', { exact: true })).toBeVisible();
  await expect.poll(() => heldResponses.length).toBe(1);
  const completion = ready();
  heldResponses.forEach(send => send());
  await completion;
  await expect(page.getByText('No resume on file yet.', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('resume-readiness-fixture.png'), fullPage: true });
});

test('rejects a failed resume response even if a heading and empty state are present', async ({ page }) => {
  const path = '/counselor/students/fixture-member';
  const ready = beginStaffDataReadiness(page, path, origin);
  await page.goto(`${origin}${path}?case=failed`);
  await expect(ready()).rejects.toThrow('member resume response was not healthy');
});

test('fails when the expected staff response never starts', async ({ page }) => {
  const ready = beginStaffDataReadiness(page, '/counselor/students/fixture-member', origin, 500);
  await page.goto(`${origin}/dashboard/help`);
  await expect(ready()).rejects.toThrow('member resume response did not complete');
});
