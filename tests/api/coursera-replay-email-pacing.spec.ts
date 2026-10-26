import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replay: vi.fn(),
  heal: vi.fn(),
  ignored: vi.fn(),
  queue: vi.fn(),
  withPacer: vi.fn(),
  createPacer: vi.fn(),
  pacer: { run: vi.fn(), summary: vi.fn(() => ({ admitted: 0, skipped: 0 })), deadlineAtMs: 270_000 },
}));
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_name: string, handler: unknown) => handler }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/coursera/replayPendingXapi', () => ({ replayPendingXapiStatements: mocks.replay }));
vi.mock('@/lib/xapi/reprocess', () => ({ autoHealUnmatchedXapiEvents: mocks.heal, reprocessIgnoredXapiEventsWithMappings: mocks.ignored }));
vi.mock('@/lib/cron/courseraHealQueue', () => ({ countCourseraHealQueue: mocks.queue }));
vi.mock('@/lib/coursera/programContentsCache', () => ({
  loadB4BContents: vi.fn(),
  loadB4BContentsChecked: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock('@/lib/coursera/seedCanonicalMappingsFromB4B', () => ({ seedCanonicalMappingsFromB4B: vi.fn() }));
vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: mocks.createPacer,
  withBulkEmailCronPacer: mocks.withPacer,
}));

import { GET as trainingSync } from '@/app/api/cron/coursera-training-sync/route';
import { GET as autoHeal } from '@/app/api/cron/coursera-auto-heal/route';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';
import type { ReplayPendingXapiResult } from '@/lib/coursera/replayPendingXapi';
import schedules from '@/vercel.json';

const completedReplay = (): ReplayPendingXapiResult => ({
  scanned: 1,
  replayed: 1,
  skippedUnparsed: 0,
  skippedUnresolvedOrganization: 0,
  completionsEmitted: 1,
  orgsRepaired: 0,
  breakdown: { completedOk: 1, errored: 0, ignored: 0, unresolvedCourse: 0, unmatched: 0 },
});

describe('scheduled Coursera replay email pacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPacer.mockReturnValue(mocks.pacer);
    mocks.withPacer.mockImplementation((_pacer, operation) => operation());
    mocks.replay.mockResolvedValue(completedReplay());
    mocks.queue.mockResolvedValue({ unmatched: 1, ignoredWithSlug: 0 });
    mocks.heal.mockResolvedValue({ processed: 1, matched: 1, errors: 0 });
  });

  it('installs one request-scoped pacer around conditional training replay', async () => {
    const response = await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));
    expect(response.status).toBe(200);
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(1);
    expect(logCronRun).toHaveBeenCalledWith('cron_coursera_training_sync', { xapi: completedReplay() }, 'ok');
    expect(mocks.createPacer).toHaveBeenCalledOnce();
    expect(mocks.withPacer).toHaveBeenCalledOnce();
    expect(mocks.replay).toHaveBeenCalledOnce();
    expect(mocks.withPacer.mock.invocationCallOrder[0]).toBeLessThan(mocks.replay.mock.invocationCallOrder[0]);
  });

  it.each([
    { completedOk: 1, errored: 1 },
    { completedOk: 0, errored: 2 },
  ])('reports aggregate failures after the batch completes: %o', async (counts) => {
    const xapi = {
      ...completedReplay(),
      scanned: 2,
      replayed: 2,
      completionsEmitted: counts.completedOk,
      breakdown: { ...completedReplay().breakdown, ...counts },
    };
    mocks.replay.mockResolvedValueOnce(xapi);

    const response = await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ xapi });
    expect(mocks.replay).toHaveBeenCalledOnce();
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(counts.completedOk);
    expect(logCronRun).toHaveBeenCalledWith('cron_coursera_training_sync', { xapi }, 'error');
    expect(captureApiError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Pending xAPI replay had processing failures' }),
      { route: 'cron/coursera-training-sync', extra: { scanned: 2, replayed: 2, errored: counts.errored } },
    );
    expect(mocks.replay.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(logCronRun).mock.invocationCallOrder[0],
    );
  });

  it('keeps unresolved attribution visible as pending without declaring a processing failure', async () => {
    const xapi = {
      ...completedReplay(),
      breakdown: { ...completedReplay().breakdown, completedOk: 0, unresolvedCourse: 1 },
    };
    mocks.replay.mockResolvedValueOnce(xapi);

    const response = await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ xapi });
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(0);
    expect(logCronRun).toHaveBeenCalledWith('cron_coursera_training_sync', { xapi }, 'ok');
    expect(captureApiError).not.toHaveBeenCalled();
  });

  it('counts acknowledged non-completion, unmatched and unparsed rows without counting retained rows', async () => {
    const xapi = {
      ...completedReplay(),
      scanned: 6,
      replayed: 4,
      skippedUnparsed: 1,
      skippedUnresolvedOrganization: 1,
      breakdown: { completedOk: 1, errored: 0, ignored: 1, unresolvedCourse: 1, unmatched: 1 },
    };
    mocks.replay.mockResolvedValueOnce(xapi);

    await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));

    expect(setCronRecordsProcessed).toHaveBeenCalledWith(4);
  });

  it('preserves failure reporting when pending-row selection throws before a batch result exists', async () => {
    const failure = new Error('selection unavailable');
    mocks.replay.mockRejectedValueOnce(failure);

    const response = await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Cron failed' });
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
    expect(captureApiError).toHaveBeenCalledExactlyOnceWith(failure, { route: 'cron/coursera-training-sync' });
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_coursera_training_sync', { error: 'selection unavailable' }, 'error',
    );
  });

  it('installs one request-scoped pacer around conditional auto-heal replay', async () => {
    await autoHeal(new Request('http://test/api/cron/coursera-auto-heal'));
    expect(mocks.createPacer).toHaveBeenCalledOnce();
    expect(mocks.withPacer).toHaveBeenCalledOnce();
    expect(mocks.heal).toHaveBeenCalledOnce();
  });

  it('keeps both bulk replay schedules off the top of the hour', () => {
    for (const path of ['/api/cron/coursera-training-sync', '/api/cron/coursera-auto-heal']) {
      const cron = schedules.crons.find((entry) => entry.path === path);
      expect(cron?.schedule.split(/\s+/)[0]).not.toBe('0');
    }
  });
});
