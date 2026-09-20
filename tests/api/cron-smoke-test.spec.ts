import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───
vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: vi.fn(),
  startCronExecution: vi.fn().mockResolvedValue('exec-id'),
  completeCronExecution: vi.fn(),
  runWithCronExecution: vi.fn(async (_id, fn) => fn()),
  getCronRecordsProcessed: vi.fn(() => undefined),
  hasCronDiagnosticBeenLogged: vi.fn(() => false),
}));

vi.mock('@/lib/cron/authorizeCronRequest', () => ({
  authorizeCronRequest: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/cron/isCronEnabled', () => ({
  isCronEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as smokeGET } from '@/app/api/cron/smoke-test/route';
import { logCronRun } from '@/lib/admin/logCronRun';
import { captureApiError } from '@/lib/observability/captureApiError';

describe('GET /api/cron/smoke-test', () => {
  const originalFetch = global.fetch;

  function successfulProbe(url: string) {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/health') {
      return {
        status: 200,
        url,
        text: vi.fn().mockResolvedValue(JSON.stringify({ status: 'ok' })),
      };
    }
    if (parsed.pathname === '/api/health/ready') {
      return {
        status: 200,
        url,
        text: vi.fn().mockResolvedValue(JSON.stringify({ status: 'ok', rateLimiter: 'redis' })),
      };
    }
    if (parsed.pathname === '/login') {
      return { status: 200, url, text: vi.fn().mockResolvedValue('<title>Sign In</title>') };
    }
    if (parsed.pathname === '/programs') {
      return {
        status: 200,
        url,
        text: vi
          .fn()
          .mockResolvedValue(
            '<h1>Find the right program <span class="shimmer">for your goals</span></h1>',
          ),
      };
    }
    return {
      status: 200,
      url: `https://test.workforceap.org/en/login?redirectTo=${encodeURIComponent(parsed.pathname)}`,
      text: vi.fn().mockResolvedValue('<title>Sign In</title>'),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://test.workforceap.org');
    global.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      return Promise.resolve(successfulProbe(url));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('returns ok when all endpoints respond with 200', async () => {
    const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.checked).toBe(7);
    expect(json.failed).toEqual([]);
    expect(json.results.readiness.finalPath).toBe('/api/health/ready');
    expect(json.results.dashboard.finalPath).toBe('/en/login?redirectTo=%2Fdashboard');
  });

  it('reports failures when endpoints return non-200', async () => {
    global.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/health/ready')) {
        return Promise.resolve({
          status: 503,
          url,
          text: () => Promise.resolve(JSON.stringify({ status: 'fail' })),
        });
      }
      return Promise.resolve(successfulProbe(url));
    });

    const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.failed).toEqual(['readiness']);
    expect(captureApiError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Production smoke failed: readiness' }),
      expect.objectContaining({ route: '/api/cron/smoke-test' }),
    );
  });

  it.each(['fail-open', 'fail-closed', undefined])(
    'fails readiness when production rate limiting is not on Redis (mode %s) (WAP-13)',
    async (mode) => {
      global.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/health/ready')) {
          return Promise.resolve({
            status: 200,
            url,
            text: () => Promise.resolve(JSON.stringify({ status: 'ok', ...(mode ? { rateLimiter: mode } : {}) })),
          });
        }
        return Promise.resolve(successfulProbe(url));
      });

      const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.failed).toEqual(['readiness']);
      expect(json.results.readiness.reason).toBe(`rate limiter mode ${String(mode)} (expected redis)`);
      expect(json.results.liveness.ok).toBe(true);
      expect(captureApiError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Production smoke failed: readiness' }),
        expect.objectContaining({ route: '/api/cron/smoke-test' }),
      );
    },
  );

  it('fails when a protected portal no longer redirects to its login target', async () => {
    global.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/dashboard')) {
        return Promise.resolve({
          status: 200,
          url,
          text: () => Promise.resolve('<title>Unexpected page</title>'),
        });
      }
      return Promise.resolve(successfulProbe(url));
    });

    const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.failed).toEqual(['dashboard']);
    expect(json.results.dashboard.reason).toContain('unexpected redirect target');
  });

  it.each([
    [
      'an off-origin login',
      'https://evil.example/en/login?redirectTo=%2Fdashboard',
    ],
    [
      'a same-origin nested login path',
      'https://test.workforceap.org/fake/login?redirectTo=%2Fdashboard',
    ],
  ])('rejects %s as a protected portal redirect', async (_description, finalUrl) => {
    global.fetch = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/dashboard')) {
        return Promise.resolve({
          status: 200,
          url: finalUrl,
          text: () => Promise.resolve('<title>Sign In</title>'),
        });
      }
      return Promise.resolve(successfulProbe(url));
    });

    const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.failed).toEqual(['dashboard']);
    expect(json.results.dashboard.reason).toContain('unexpected redirect target');
  });

  it('aborts probes that exceed the timeout', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      }),
    );

    const responsePromise = smokeGET(
      new Request('http://localhost:3000/api/cron/smoke-test'),
    );
    await vi.advanceTimersByTimeAsync(12_000);

    const res = await responsePromise;
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.failed).toHaveLength(7);
    expect(json.results.liveness).toMatchObject({
      ok: false,
      status: 0,
      durationMs: 12_000,
      reason: 'timed out after 12000ms',
    });
  });

  it('handles network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const res = await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.failed.length).toBe(7);
    expect(json.results.liveness.ok).toBe(false);
    expect(json.results.liveness.status).toBe(0);
    expect(json.results.liveness.reason).toBe('Network failure');
  });

  it('logs cron run on success', async () => {
    await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_smoke_test',
      expect.objectContaining({ ok: true }),
      'ok'
    );
  });

  it('logs cron run with error when endpoints fail', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    await smokeGET(new Request('http://localhost:3000/api/cron/smoke-test'));
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_smoke_test',
      expect.objectContaining({ ok: false }),
      'error'
    );
  });
});
