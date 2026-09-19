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
const req = (secret = 'test-secret') => new Request('https://example.test/api/cron/test', { headers: { authorization: `Bearer ${secret}` } });

describe('cron failures are observable without unauthorized database writes', () => {
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
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('throttles rejected-auth reporting and performs no database work', async () => {
    const handler = vi.fn();
    const route = withCronLogging('cron_test', handler);
    expect((await route(req('wrong'))).status).toBe(401);
    expect((await route(req('wrong-again'))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.cronExecution.create).not.toHaveBeenCalled();
    expect(prisma.workflowDiagnostic.create).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(Sentry.captureException).mock.calls)).not.toContain('wrong');
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
});
