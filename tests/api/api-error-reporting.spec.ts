// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ resolveAuthGucContext: vi.fn() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => { if ((error as { digest?: string })?.digest === 'NEXT_REDIRECT') throw error; },
}));
import * as Sentry from '@sentry/nextjs';
import { resolveAuthGucContext } from '@/lib/auth/server';
import { withApiGuc, withAuthenticatedApiGuc } from '@/lib/db/withRequestGuc';
import { captureApiError } from '@/lib/observability/captureApiError';
import { apiRouteLabel } from '@/lib/observability/apiErrorScope';

const auth = { userId: 'member-1', orgId: 'org-1', role: 'member', employerId: null, partnerId: null } as const;
const request = () => new Request('https://example.test/api/member/example?token=secret');

describe('shared API error reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAuthGucContext).mockResolvedValue(auth);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('captures a thrown handler error with actor context and returns generic 500', async () => {
    const failure = new Error('database unavailable');
    const response = await withApiGuc(async (): Promise<Response> => { throw failure; })(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, expect.objectContaining({
      tags: { api_route: '/api/member/example' }, user: { id: 'member-1' },
    }));
  });

  it('observes an inner-caught 503 without consuming its stream or changing headers', async () => {
    const original = new Response('private body', { status: 503, headers: { 'retry-after': '30', 'set-cookie': 'marker=1' } });
    const result = await withApiGuc(async () => original)(request());
    expect(result).toBe(original);
    expect(result.bodyUsed).toBe(false);
    expect(result.headers.get('retry-after')).toBe('30');
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(Sentry.captureException).mock.calls)).not.toContain('private body');
    expect(await result.text()).toBe('private body');
  });

  it.each([200, 400, 401, 403, 404, 429])('does not report expected HTTP %s', async (status) => {
    await withApiGuc(async () => new Response(null, { status }))(request());
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('deduplicates an explicitly captured error rethrown through nested wrappers', async () => {
    const failure = new Error('same failure');
    const inner = withApiGuc(async (): Promise<Response> => { captureApiError(failure, { route: '/api/test' }); throw failure; });
    const result = await withApiGuc(inner)(request());
    expect(result.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('keeps reporting scopes isolated across concurrent requests', async () => {
    await Promise.all([
      withApiGuc(async () => {
        captureApiError(new Error('first'), { route: '/api/first' });
        await Promise.resolve();
        return new Response(null, { status: 500 });
      })(request()),
      withApiGuc(async () => new Response(null, { status: 503 }))(request()),
    ]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('preserves Next control-flow throws', async () => {
    const redirect = Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT' });
    await expect(withApiGuc(async () => { throw redirect; })(request())).rejects.toBe(redirect);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('rejects anonymous authenticated requests without running or reporting the handler', async () => {
    vi.mocked(resolveAuthGucContext).mockResolvedValue({ ...auth, userId: null, orgId: null, role: 'anonymous' });
    const handler = vi.fn(async () => new Response());
    expect((await withAuthenticatedApiGuc(handler)(request())).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('authenticated wrapper reports failures and preserves user argument', async () => {
    const handler = vi.fn(async (_request: Request, _userId: string) => new Response(null, { status: 502 }));
    const response = await withAuthenticatedApiGuc(handler)(request());
    expect(response.status).toBe(502);
    expect(handler.mock.calls[0][1]).toBe('member-1');
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('captures auth-context lookup failure and never invokes the handler', async () => {
    vi.mocked(resolveAuthGucContext).mockRejectedValueOnce(new Error('auth lookup failed'));
    const handler = vi.fn(async () => new Response());
    expect((await withApiGuc(handler)(request())).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('telemetry SDK failure cannot replace the original response', async () => {
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => { throw new Error('reporter failed'); });
    const response = new Response(null, { status: 503 });
    expect(await withApiGuc(async () => response)(request())).toBe(response);
  });

  it('redacts dynamic and catch-all parameters and never includes query values', async () => {
    const req = new Request('https://example.test/api/members/private%40example.test/files/folder/file?secret=hidden');
    const label = await apiRouteLabel(req, { params: Promise.resolve({ id: 'private@example.test', path: ['folder', 'file'] }) });
    expect(label).toBe('/api/members/[id]/files/[...path]');
    expect(await apiRouteLabel(req, { params: Promise.reject(new Error('params unavailable')) })).toBe('/api/[route]');
  });
});
