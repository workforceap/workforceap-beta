/** Functional, dummy-token regression for a trusted-host redirect to another host. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { installReadOnlyAuditCookie } from '../../scripts/lib/portal-audit-cookie.mjs';
import { safeToolbarNavigationHeaders } from '../../scripts/lib/portal-audit-environment.mjs';

const dummyToken = 'dummy-audit-token-'.repeat(3);

test('audit capability stays on the trusted host across a cross-host redirect', async ({ browser }) => {
  const seen = new Map<string, { method: string; accept: string; cookie: string; tokenHeader: string; toolbarHeader: string }>();
  let port = 0;
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    seen.set(path, {
      method: request.method ?? '',
      accept: request.headers.accept ?? '',
      cookie: request.headers.cookie ?? '',
      tokenHeader: String(request.headers['x-workforceap-read-only-audit-token'] ?? ''),
      toolbarHeader: String(request.headers['x-vercel-skip-toolbar'] ?? ''),
    });
    if (path === '/redirect') {
      response.writeHead(302, { location: `http://localhost:${port}/sink` });
      response.end();
      return;
    }
    if (path === '/external') response.setHeader('access-control-allow-origin', '*');
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>audit-cookie-probe</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
  const trustedOrigin = `http://127.0.0.1:${port}`;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installReadOnlyAuditCookie(context, trustedOrigin, dummyToken);
    await context.route('**/*', (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && new URL(request.url()).origin === trustedOrigin) {
        return route.continue({
          headers: {
            ...safeToolbarNavigationHeaders(request.headers()),
            'x-vercel-skip-toolbar': '1',
          },
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${trustedOrigin}/check`);
    const apiResponse = await page.request.get(`${trustedOrigin}/api-check`);
    expect(apiResponse.ok()).toBe(true);
    const externalFetchOk = await page.evaluate(async (url) => (await fetch(url)).ok, `http://localhost:${port}/external`);
    expect(externalFetchOk).toBe(true);
    await page.goto(`${trustedOrigin}/redirect`);

    for (const path of ['/check', '/api-check', '/redirect']) {
      expect(seen.get(path)?.cookie).toContain(`${dummyToken}`);
      expect(seen.get(path)?.tokenHeader).toBe('');
    }
    expect(seen.get('/check')?.toolbarHeader).toBe('1');
    expect(seen.get('/check')?.accept).toContain('text/html');
    expect(seen.get('/api-check')?.toolbarHeader).toBe('');
    expect(seen.get('/redirect')?.toolbarHeader).toBe('1');
    expect(seen.get('/external')?.method).toBe('GET');
    expect(seen.get('/external')?.toolbarHeader).toBe('');
    expect(seen.get('/external')?.cookie).not.toContain(dummyToken);
    expect(seen.get('/sink')?.cookie ?? '').not.toContain(dummyToken);
    expect(seen.get('/sink')?.tokenHeader).toBe('');
    expect(seen.get('/sink')?.toolbarHeader).toBe('1');

    const offContext = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await installReadOnlyAuditCookie(offContext, trustedOrigin, dummyToken);
      const offPage = await offContext.newPage();
      await offPage.goto(`${trustedOrigin}/off`);
      expect(seen.get('/off')?.cookie).toContain(dummyToken);
      expect(seen.get('/off')?.toolbarHeader).toBe('');
    } finally {
      await offContext.close();
    }
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
