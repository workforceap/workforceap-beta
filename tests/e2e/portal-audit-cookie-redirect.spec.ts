/** Functional, dummy-token regression for a trusted-host redirect to another host. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { installReadOnlyAuditCookie } from '../../scripts/lib/portal-audit-cookie.mjs';

const dummyToken = 'dummy-audit-token-'.repeat(3);

test('audit capability stays on the trusted host across a cross-host redirect', async ({ browser }) => {
  const seen = new Map<string, { cookie: string; tokenHeader: string }>();
  let port = 0;
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    seen.set(path, {
      cookie: request.headers.cookie ?? '',
      tokenHeader: String(request.headers['x-workforceap-read-only-audit-token'] ?? ''),
    });
    if (path === '/redirect') {
      response.writeHead(302, { location: `http://localhost:${port}/sink` });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>audit-cookie-probe</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
  const trustedOrigin = `http://127.0.0.1:${port}`;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installReadOnlyAuditCookie(context, trustedOrigin, dummyToken);
    await context.route('**/*', (route) => route.continue());
    const page = await context.newPage();
    await page.goto(`${trustedOrigin}/check`);
    const apiResponse = await page.request.get(`${trustedOrigin}/api-check`);
    expect(apiResponse.ok()).toBe(true);
    await page.goto(`${trustedOrigin}/redirect`);

    for (const path of ['/check', '/api-check', '/redirect']) {
      expect(seen.get(path)?.cookie).toContain(`${dummyToken}`);
      expect(seen.get(path)?.tokenHeader).toBe('');
    }
    expect(seen.get('/sink')?.cookie ?? '').not.toContain(dummyToken);
    expect(seen.get('/sink')?.tokenHeader).toBe('');
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
