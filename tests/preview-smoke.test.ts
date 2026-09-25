import { describe, expect, it } from 'vitest';
import {
  PREVIEW_EXTRA_PROBES,
  buildPreviewProbes,
  isVercelDeploymentOrigin,
  loadRouteProbes,
  parseRouteProbes,
  runPreviewSmoke,
} from '../scripts/lib/preview-smoke.mjs';

const ORIGIN = 'https://workforceap-beta-abc123-example.vercel.app';
const SHA = 'abc1234def5678901234567890123456789abcde';

const ROUTE_SOURCE = `
const PROBES: Probe[] = [
  { path: '/api/health', name: 'liveness', kind: 'json-health' },
  { path: '/api/health/ready', name: 'readiness', kind: 'json-health', requireRedisRateLimiter: true },
  { path: '/login', name: 'login', kind: 'public-page', bodyMarker: 'Sign In' },
  {
    path: '/programs',
    name: 'programs',
    kind: 'public-page',
    bodyMarker: 'Find the right program',
  },
  { path: '/dashboard', name: 'dashboard', kind: 'protected-redirect' },
];
`;

type Handler = (path: string) => { status: number; body?: string; headers?: Record<string, string> };

function fakeFetch(handler: Handler, seen: Array<{ url: string; headers: Record<string, string> }> = []) {
  return async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    const u = new URL(url);
    const { status, body = '', headers = {} } = handler(`${u.pathname}${u.search}`);
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { status, headers: { get: (name: string) => lower[name.toLowerCase()] ?? null }, text: async () => body };
  };
}

const page = (title: string, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function healthyPreview(overrides: Record<string, ReturnType<Handler>> = {}): Handler {
  return (path) => {
    if (overrides[path]) return overrides[path];
    switch (path) {
      case '/api/health':
        return { status: 200, body: JSON.stringify({ status: 'ok', version: SHA.slice(0, 7), supabaseRef: 'esbdrgaonplpvzmtrdhw' }) };
      case '/api/health/ready':
        return { status: 200, body: JSON.stringify({ status: 'ok', rateLimiter: 'fail-open' }) };
      case '/login':
      case '/login?redirectTo=%2Fdashboard':
      case '/login?redirectTo=/dashboard':
        return { status: 200, body: page('Sign in — WorkforceAP', 'Sign In') };
      case '/programs':
        return { status: 308, headers: { location: '/en/programs' } };
      case '/en/programs':
        return { status: 200, body: page('Programs — WorkforceAP', 'Find the right program') };
      case '/dashboard':
        return { status: 307, headers: { location: '/login?redirectTo=%2Fdashboard' } };
      case '/en':
        return { status: 200, body: page('Career Training | Workforce Advancement Project') };
      case '/en/program-comparison':
        return { status: 200, body: page('Compare programs — WorkforceAP') };
      default:
        return { status: 404, body: 'not found' };
    }
  };
}

const parsed = parseRouteProbes(ROUTE_SOURCE);
const probes = parsed.ok ? buildPreviewProbes(parsed.probes) : [];
const run = (handler: Handler, extra: Partial<Parameters<typeof runPreviewSmoke>[0]> = {}) =>
  runPreviewSmoke({ origin: ORIGIN, probes, fetchImpl: fakeFetch(handler), expectedSha: SHA, retryDelayMs: 0, ...extra });

describe('parseRouteProbes', () => {
  it('reads single-line and multi-line entries, markers and the redis flag', () => {
    expect(parsed).toEqual({
      ok: true,
      probes: [
        { path: '/api/health', name: 'liveness', kind: 'json-health' },
        { path: '/api/health/ready', name: 'readiness', kind: 'json-health', requireRedisRateLimiter: true },
        { path: '/login', name: 'login', kind: 'public-page', bodyMarker: 'Sign In' },
        { path: '/programs', name: 'programs', kind: 'public-page', bodyMarker: 'Find the right program' },
        { path: '/dashboard', name: 'dashboard', kind: 'protected-redirect' },
      ],
    });
  });

  it('fails closed on a missing array or an entry it cannot read', () => {
    expect(parseRouteProbes('export const GET = () => null;').ok).toBe(false);
    expect(parseRouteProbes("const PROBES: Probe[] = [\n  { path: PATH, name: 'x', kind: 'public-page' },\n];").ok).toBe(false);
  });

  it('parses the real smoke-test route and covers every WAP-202 path', () => {
    const real = loadRouteProbes();
    expect(real.ok).toBe(true);
    const paths = buildPreviewProbes(real.ok ? real.probes : []).map((p) => p.path);
    for (const required of ['/api/health/ready', '/en', '/dashboard', '/admin', '/en/program-comparison']) {
      expect(paths).toContain(required);
    }
  });

  it('adds the preview-only pages after the shared ones', () => {
    expect(probes.slice(-PREVIEW_EXTRA_PROBES.length).map((p) => p.path)).toEqual(['/en', '/en/program-comparison']);
  });
});

describe('runPreviewSmoke', () => {
  it('passes a healthy preview', async () => {
    const outcome = await run(healthyPreview());
    expect(outcome.results.filter((r) => !r.ok)).toEqual([]);
    expect(outcome.result).toBe('pass');
  });

  it('fails a 500 on a protected route', async () => {
    const outcome = await run(healthyPreview({ '/dashboard': { status: 500, body: 'boom' } }));
    expect(outcome.result).toBe('fail');
    expect(outcome.results.find((r) => r.name === 'dashboard')?.reason).toBe('HTTP 500 at /dashboard');
  });

  it('fails a 200 that rendered the Next error shell', async () => {
    const outcome = await run(
      healthyPreview({ '/en': { status: 200, body: '<html id="__next_error__"><head><title>WorkforceAP</title></head></html>' } }),
    );
    expect(outcome.results.find((r) => r.name === 'home-en')?.reason).toMatch(/__next_error__/);
  });

  it('fails a home page without the site title and a redirect that lands elsewhere', async () => {
    const outcome = await run(
      healthyPreview({
        '/en': { status: 200, body: page('Untitled') },
        '/dashboard': { status: 307, headers: { location: '/' } },
        '/': { status: 200, body: page('WorkforceAP') },
      }),
    );
    const reasons = Object.fromEntries(outcome.results.map((r) => [r.name, r.reason]));
    expect(reasons['home-en']).toBe('missing the site title in <title>');
    expect(reasons.dashboard).toMatch(/expected \/login\?redirectTo=\/dashboard/);
  });

  it('fails a preview serving a different commit', async () => {
    const outcome = await run(healthyPreview(), { expectedSha: 'fffffff'.padEnd(40, '0') });
    expect(outcome.results.find((r) => r.name === 'liveness')?.reason).toMatch(/serves abc1234, expected fffffff/);
  });

  it('retries a cold-start 503 before failing', async () => {
    let calls = 0;
    const handler: Handler = (path) => {
      if (path === '/api/health/ready') {
        calls += 1;
        return calls < 2 ? { status: 503, body: '{}' } : { status: 200, body: '{"status":"ok"}' };
      }
      return healthyPreview()(path);
    };
    const outcome = await run(handler);
    expect(outcome.result).toBe('pass');
    expect(outcome.results.find((r) => r.name === 'readiness')?.attempts).toBe(2);
  });

  it('reports Vercel Deployment Protection instead of a failure', async () => {
    const outcome = await run(() => ({
      status: 401,
      body: 'Authentication Required',
      headers: { 'set-cookie': '_vercel_sso_nonce=x; Path=/' },
    }));
    expect(outcome.result).toBe('protected');
  });

  it('sends the bypass header only to the Vercel deployment origin', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    await runPreviewSmoke({
      origin: ORIGIN,
      probes,
      fetchImpl: fakeFetch(healthyPreview(), seen),
      bypassSecret: 's3cret',
      retryDelayMs: 0,
    });
    expect(seen.every((r) => r.headers['x-vercel-protection-bypass'] === 's3cret')).toBe(true);

    const local: typeof seen = [];
    await runPreviewSmoke({
      origin: 'http://127.0.0.1:3000',
      probes,
      fetchImpl: fakeFetch(healthyPreview(), local),
      bypassSecret: 's3cret',
      retryDelayMs: 0,
    });
    expect(local.some((r) => 'x-vercel-protection-bypass' in r.headers)).toBe(false);
    expect(isVercelDeploymentOrigin('https://evil.example.com')).toBe(false);
  });

  it('times out a response whose body stalls after the headers (WAP-222)', async () => {
    const stalled = (async (url: string, init?: { signal?: AbortSignal }) => {
      const path = new URL(url).pathname;
      if (path !== '/api/health') return fakeFetch(healthyPreview())(url, init as never);
      return {
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          }),
      };
    }) as never;

    const outcome = await runPreviewSmoke({ origin: ORIGIN, probes, fetchImpl: stalled, timeoutMs: 20, attempts: 1, retryDelayMs: 0 });

    expect(outcome.result).toBe('fail');
    expect(outcome.results.find((r) => r.name === 'liveness')?.reason).toBe('timed out after 20ms');
  });
});
