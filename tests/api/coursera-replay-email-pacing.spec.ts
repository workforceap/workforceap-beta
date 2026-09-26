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
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown) => Response.json(body) } }));
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
import schedules from '@/vercel.json';

describe('scheduled Coursera replay email pacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPacer.mockReturnValue(mocks.pacer);
    mocks.withPacer.mockImplementation((_pacer, operation) => operation());
    mocks.replay.mockResolvedValue({ replayed: 1 });
    mocks.queue.mockResolvedValue({ unmatched: 1, ignoredWithSlug: 0 });
    mocks.heal.mockResolvedValue({ processed: 1, matched: 1, errors: 0 });
  });

  it('installs one request-scoped pacer around conditional training replay', async () => {
    await trainingSync(new Request('http://test/api/cron/coursera-training-sync'));
    expect(mocks.createPacer).toHaveBeenCalledOnce();
    expect(mocks.withPacer).toHaveBeenCalledOnce();
    expect(mocks.replay).toHaveBeenCalledOnce();
    expect(mocks.withPacer.mock.invocationCallOrder[0]).toBeLessThan(mocks.replay.mock.invocationCallOrder[0]);
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
