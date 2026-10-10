// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cronExecution: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    workflowDiagnostic: { create: vi.fn() },
  },
}));
vi.mock('@/lib/cron/isCronEnabled', () => ({ isCronEnabled: vi.fn() }));
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db/prisma';
import { isCronEnabled } from '@/lib/cron/isCronEnabled';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { logCronRun } from '@/lib/admin/logCronRun';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getCurrentCronExecutionId, setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { getGucContext } from '@/lib/db/gucContext';
import { runWithApiErrorScope } from '@/lib/observability/apiErrorScope';
import { GET as deployHealthGET, POST as deployHealthPOST } from '@/app/api/cron/deploy-health/route';
import { GET as smokeTestGET, POST as smokeTestPOST } from '@/app/api/cron/smoke-test/route';
const req = (secret = 'test-secret') => new Request('https://example.test/api/cron/test', { headers: { authorization: `Bearer ${secret}` } });

describe('cron failures are observable and unauthorized traces are bounded', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.cronExecution.create).mockResolvedValue({ id: 'execution-1' } as never);
    vi.mocked(prisma.cronExecution.findUnique).mockResolvedValue({ startedAt: new Date() } as never);
    vi.mocked(prisma.cronExecution.update).mockResolvedValue({} as never);
    vi.mocked(prisma.workflowDiagnostic.create).mockResolvedValue({} as never);
    vi.mocked(isCronEnabled).mockResolvedValue(true);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('records one throttled FAILED: unauthorized trace and never repeats it inside the window (WAP-177)', async () => {
    const handler = vi.fn();
    const route = withCronLogging('cron_test', handler);
    expect((await route(req('wrong'))).status).toBe(401);
    expect((await route(req('wrong-again'))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    // The first rejection leaves a trace so a missing/rotated secret is visible on
    // /admin/crons: one execution row marked FAILED and one error diagnostic.
    expect(prisma.cronExecution.create).toHaveBeenCalledOnce();
    expect(prisma.cronExecution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jobName: 'cron_test', status: 'RUNNING' }),
    }));
    expect(prisma.cronExecution.update).toHaveBeenCalledOnce();
    expect(prisma.cronExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', errorMessage: 'unauthorized: unauthorized' }),
    }));
    expect(prisma.workflowDiagnostic.create).toHaveBeenCalledOnce();
    expect(prisma.workflowDiagnostic.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflow: 'cron_test', status: 'error' }),
    }));
    // The repeat inside the five-minute window adds nothing: unauthenticated
    // traffic cannot become an unbounded database write amplifier.
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const persisted = JSON.stringify([
      vi.mocked(prisma.cronExecution.create).mock.calls,
      vi.mocked(prisma.cronExecution.update).mock.calls,
      vi.mocked(prisma.workflowDiagnostic.create).mock.calls,
      vi.mocked(Sentry.captureException).mock.calls,
    ]);
    expect(persisted).not.toContain('wrong');
    expect(persisted).not.toContain('test-secret');
  });

  it('reports missing configuration even after an earlier wrong-secret rejection', async () => {
    const route = withCronLogging('cron_test', vi.fn());
    await route(req('wrong'));
    vi.stubEnv('CRON_SECRET', '');
    await route(req());
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Sentry.captureException).mock.calls[1][1]).toEqual(expect.objectContaining({
      extra: expect.objectContaining({ reason: 'missing_secret' }),
    }));
  });

  it('reports start tracking failure and never runs work', async () => {
    vi.mocked(prisma.cronExecution.create).mockRejectedValueOnce(new Error('DB offline'));
    const handler = vi.fn();
    const response = await withCronLogging('cron_test', handler)(req());
    expect(response.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('captures settings failure and marks the started execution failed', async () => {
    vi.mocked(isCronEnabled).mockRejectedValueOnce(new Error('toggle lookup failed'));
    const handler = vi.fn();
    expect((await withCronLogging('cron_test', handler)(req())).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.cronExecution.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('records a disabled job as skipped, not as a failure', async () => {
    vi.mocked(isCronEnabled).mockResolvedValueOnce(false);
    const handler = vi.fn();
    const response = await withCronLogging('cron_test', handler)(req());
    expect(await response.json()).toEqual({ skipped: true, reason: 'disabled' });
    expect(handler).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('preserves returned error response while recording and reporting failure', async () => {
    const original = new Response('original', { status: 503 });
    const response = await withCronLogging('cron_test', async () => original)(req());
    expect(response).toBe(original);
    expect(original.bodyUsed).toBe(false);
    expect(prisma.cronExecution.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('does not duplicate a handler diagnostic or explicit report', async () => {
    await withCronLogging('cron_test', async () => {
      captureApiError(new Error('known failure'), { route: 'cron/cron_test' });
      await logCronRun('cron_test', { ok: false }, 'error');
      return new Response(null, { status: 500 });
    })(req());
    expect(prisma.workflowDiagnostic.create).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('reports a failed terminal-status write instead of claiming success', async () => {
    vi.mocked(prisma.cronExecution.update).mockRejectedValueOnce(new Error('status unavailable'));
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    expect((await withCronLogging('cron_test', handler)(req())).status).toBe(500);
    expect(handler).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('reports diagnostic-storage failure without replacing a completed handler result', async () => {
    vi.mocked(prisma.workflowDiagnostic.create).mockRejectedValueOnce(new Error('diagnostic unavailable'));
    const original = new Response(null, { status: 200 });
    expect(await withCronLogging('cron_test', async () => original)(req())).toBe(original);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toEqual(expect.objectContaining({
      extra: expect.objectContaining({ phase: 'write_diagnostic' }),
    }));
  });

  describe('read-only monitors survive initial tracking failure', () => {
    beforeEach(() => {
      vi.mocked(prisma.cronExecution.create).mockRejectedValue(new Error('DB offline'));
    });

    it.each(['cron_deploy_health', 'cron_smoke_test'])('runs %s once without inventing an execution', async (workflow) => {
      const original = new Response('probe result', { headers: { 'x-probe': 'retained' } });
      const handler = vi.fn(async () => {
        expect(getCurrentCronExecutionId()).toBeUndefined();
        expect(getGucContext()?.role).toBe('system');
        await setCronRecordsProcessed(7);
        return original;
      });
      const response = await withCronLogging(workflow, handler)(req());
      expect(handler).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.create).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.update).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('x-probe')).toBe('retained');
      expect(response.headers.get('x-cron-execution-tracking')).toBe('unavailable');
      expect(original.bodyUsed).toBe(false);
      expect(await response.text()).toBe('probe result');
      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toEqual(expect.objectContaining({
        extra: expect.objectContaining({ phase: 'start_execution', executionTracking: 'unavailable' }),
      }));
    });

    it('does not allow other jobs to run untracked work', async () => {
      const handler = vi.fn();
      expect((await withCronLogging('cron_weekly_recap_email', handler)(req())).status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
      expect(isCronEnabled).not.toHaveBeenCalled();
    });

    it.each(['cron_deploy_health', 'cron_smoke_test'])('honors a readable disabled setting for %s', async (workflow) => {
      vi.mocked(isCronEnabled).mockResolvedValueOnce(false);
      const handler = vi.fn();
      const response = await withCronLogging(workflow, handler)(req());
      expect(await response.json()).toEqual({ skipped: true, reason: 'disabled' });
      expect(response.headers.get('x-cron-execution-tracking')).toBe('unavailable');
      expect(handler).not.toHaveBeenCalled();
      expect(prisma.cronExecution.update).not.toHaveBeenCalled();
    });

    it.each(['cron_deploy_health', 'cron_smoke_test'])('reports unavailable settings separately and still probes for %s', async (workflow) => {
      vi.mocked(isCronEnabled).mockRejectedValueOnce(new Error('Cron setting could not be loaded'));
      const handler = vi.fn(async () => Response.json({ ok: true }));
      const response = await withCronLogging(workflow, handler)(req());
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      expect(isCronEnabled).toHaveBeenCalledWith(workflow);
      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
      expect(vi.mocked(Sentry.captureException).mock.calls[1][1]).toEqual(expect.objectContaining({
        extra: expect.objectContaining({ phase: 'monitor_settings_unavailable', executionTracking: 'unavailable' }),
      }));
    });

    it.each(['wrong', ''])('never runs an allowlisted monitor without valid authorization (%s)', async (secret) => {
      const handler = vi.fn();
      expect((await withCronLogging('cron_smoke_test', handler)(req(secret))).status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
      expect(isCronEnabled).not.toHaveBeenCalled();
    });

    it('preserves and reports a failed probe independently from the storage error', async () => {
      const original = new Response('unhealthy', { status: 503 });
      const handler = vi.fn(async () => original);
      const response = await withCronLogging('cron_deploy_health', handler)(req());
      expect(handler).toHaveBeenCalledOnce();
      expect(response.status).toBe(503);
      expect(original.bodyUsed).toBe(false);
      expect(await response.text()).toBe('unhealthy');
      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
      expect(vi.mocked(Sentry.captureException).mock.calls[1][1]).toEqual(expect.objectContaining({
        extra: expect.objectContaining({ phase: 'monitor_handler', status: 503, executionTracking: 'unavailable' }),
      }));
    });

    it('uses a fresh reporting scope even when invoked inside an existing API scope', async () => {
      const response = await runWithApiErrorScope(async () => {
        captureApiError(new Error('outer failure'), { route: 'outer' });
        return withCronLogging('cron_deploy_health', async () => new Response(null, { status: 503 }))(req());
      });
      expect(response.status).toBe(503);
      expect(Sentry.captureException).toHaveBeenCalledTimes(3);
    });

    it('reports a thrown handler failure once and never retries the handler', async () => {
      const handler = vi.fn(async () => { throw new Error('probe crashed'); });
      const response = await withCronLogging('cron_smoke_test', handler)(req());
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Cron failed' });
      expect(response.headers.get('x-cron-execution-tracking')).toBe('unavailable');
      expect(handler).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.create).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.update).not.toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it.each(['return', 'throw'])('does not duplicate an explicitly reported monitor failure on %s', async (mode) => {
      const failure = new Error('probe failed');
      const handler = vi.fn(async () => {
        captureApiError(failure, { route: '/api/cron/smoke-test' });
        if (mode === 'throw') throw failure;
        return new Response(null, { status: 503 });
      });
      expect((await withCronLogging('cron_smoke_test', handler)(req())).status).toBe(mode === 'throw' ? 500 : 503);
      expect(handler).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
      expect(vi.mocked(Sentry.captureException).mock.calls[1][0]).toBe(failure);
    });

    it.each(['start', 'settings', 'handler'])('preserves Next control flow during %s', async (phase) => {
      const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
      if (phase === 'start') vi.mocked(prisma.cronExecution.create).mockRejectedValueOnce(redirect);
      if (phase === 'settings') vi.mocked(isCronEnabled).mockRejectedValueOnce(redirect);
      const handler = vi.fn(async () => { throw redirect; });
      await expect(withCronLogging('cron_smoke_test', handler)(req())).rejects.toBe(redirect);
      expect(handler).toHaveBeenCalledTimes(phase === 'handler' ? 1 : 0);
      expect(Sentry.captureException).toHaveBeenCalledTimes(phase === 'start' ? 0 : 1);
    });

    it('does not retry an allowlisted monitor after a terminal write fails on a tracked run', async () => {
      vi.mocked(prisma.cronExecution.create).mockResolvedValueOnce({ id: 'execution-1' } as never);
      vi.mocked(prisma.cronExecution.update).mockRejectedValueOnce(new Error('terminal write failed'));
      const handler = vi.fn(async () => Response.json({ ok: true }));
      const response = await withCronLogging('cron_deploy_health', handler)(req());
      expect(response.status).toBe(500);
      expect(response.headers.get('x-cron-execution-tracking')).toBeNull();
      expect(handler).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.create).toHaveBeenCalledOnce();
    });

    it.each([
      ['deploy-health GET', deployHealthGET, 1],
      ['deploy-health POST', deployHealthPOST, 1],
      ['smoke-test GET', smokeTestGET, 7],
      ['smoke-test POST', smokeTestPOST, 7],
    ] as const)('runs the real %s route and preserves probe results through diagnostic-storage failure', async (_name, route, count) => {
      vi.stubEnv('VERCEL_TOKEN', '');
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test');
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(prisma.workflowDiagnostic.create).mockRejectedValue(new Error('diagnostic unavailable'));
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const path = url.pathname;
        const protectedPath = ['/dashboard', '/admin', '/counselor'].includes(path);
        const body = path.startsWith('/api/health')
          ? JSON.stringify({ status: 'ok', rateLimiter: 'redis' })
          : path === '/programs' ? 'Find the right program' : 'Sign In';
        return Object.defineProperty(new Response(body), 'url', {
          value: protectedPath ? `https://example.test/login?redirectTo=${path}` : url.toString(),
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const response = await route(req());
      expect(response.status).toBe(200);
      expect(response.headers.get('x-cron-execution-tracking')).toBe('unavailable');
      expect(await response.json()).toEqual(expect.objectContaining({ ok: true }));
      expect(fetchMock).toHaveBeenCalledTimes(count);
      expect(prisma.cronExecution.create).toHaveBeenCalledOnce();
      expect(prisma.cronExecution.update).not.toHaveBeenCalled();
      expect(prisma.workflowDiagnostic.create).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });
  });
});
