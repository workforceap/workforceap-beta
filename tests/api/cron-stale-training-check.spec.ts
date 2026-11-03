import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));
vi.mock('@/lib/member/staleTrainingCron', () => ({
  runStaleCourseraTrainingCheck: vi.fn(),
}));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { GET } from '@/app/api/cron/stale-training-check/route';
import { runStaleCourseraTrainingCheck } from '@/lib/member/staleTrainingCron';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';

const request = () => new Request('http://localhost/api/cron/stale-training-check');

describe('GET /api/cron/stale-training-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the helper result and counts newly flagged members', async () => {
    vi.mocked(runStaleCourseraTrainingCheck).mockResolvedValue({
      enrollmentsChecked: 12,
      newlyFlagged: 3,
      cleared: 1,
      unchangedStale: 4,
      reStamped: 4,
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enrollmentsChecked: 12,
      newlyFlagged: 3,
      cleared: 1,
      unchangedStale: 4,
      reStamped: 4,
    });
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(3);
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_stale_training_check',
      expect.objectContaining({ newlyFlagged: 3 }),
      'ok',
    );
  });

  it('answers 500 and logs error when the helper throws', async () => {
    vi.mocked(runStaleCourseraTrainingCheck).mockRejectedValue(new Error('progress query failed'));

    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Cron failed' });
    expect(captureApiError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'progress query failed' }),
      { route: 'cron/stale-training-check' },
    );
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_stale_training_check',
      { error: 'progress query failed' },
      'error',
    );
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
  });
});
