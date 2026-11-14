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

const runDataCleanup = vi.hoisted(() => vi.fn());
const failStaleCronExecutions = vi.hoisted(() => vi.fn());
const logCronRun = vi.hoisted(() => vi.fn());
const setCronRecordsProcessed = vi.hoisted(() => vi.fn());
const captureApiError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/retention/cleanup', () => ({ runDataCleanup }));
vi.mock('@/lib/cron/staleExecutions', () => ({ failStaleCronExecutions }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key: string, handler: (req: Request) => Promise<Response>) => handler),
}));

import { GET } from '@/app/api/cron/data-cleanup/route';
import { logCronRun as logged } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed as recorded } from '@/lib/cron/cronExecution';

const okReport = {
  startedAt: '2026-10-31T12:00:00.000Z',
  completedAt: '2026-10-31T12:00:01.000Z',
  results: [{ model: 'auditLog', deleted: 4, batchCount: 1 }],
  totalDeleted: 4,
  emailFailuresSnapshotted: 0,
  emailFailuresScanned: 0,
  deletedAccounts: 0,
  blockedAccounts: [],
};

function request() {
  return new Request('http://localhost/api/cron/data-cleanup');
}

describe('GET /api/cron/data-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runDataCleanup.mockResolvedValue(okReport);
    failStaleCronExecutions.mockResolvedValue({
      failed: 1,
      cutoff: '2026-10-31T11:45:00.000Z',
      thresholdMinutes: 15,
    });
  });

  it('answers 200 and records ok when every table and the stale sweep succeed', async () => {
    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.totalDeleted).toBe(4);
    expect(json.staleCronExecutions).toEqual({
      failed: 1,
      cutoff: '2026-10-31T11:45:00.000Z',
      thresholdMinutes: 15,
    });
    expect(json.failedModels).toBeUndefined();
    expect(recorded).toHaveBeenCalledWith(4);
    expect(logged).toHaveBeenCalledWith(
      'data_cleanup',
      expect.objectContaining({ totalDeleted: 4 }),
      'ok',
    );
  });

  it('answers 500 and records error when a retention table reports a failure', async () => {
    runDataCleanup.mockResolvedValue({
      ...okReport,
      results: [
        { model: 'auditLog', deleted: 4, batchCount: 1 },
        { model: 'workflowDiagnostic', deleted: 0, batchCount: 0, error: 'snapshot failed' },
      ],
    });

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.failedModels).toEqual(['workflowDiagnostic']);
    expect(logged).toHaveBeenCalledWith(
      'data_cleanup',
      expect.objectContaining({ failedModels: ['workflowDiagnostic'] }),
      'error',
    );
  });

  it('answers 500 when the stale CronExecution sweep throws', async () => {
    failStaleCronExecutions.mockRejectedValueOnce(new Error('relation cron_executions is missing'));

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.staleCronExecutions).toEqual({
      failed: 0,
      error: 'relation cron_executions is missing',
    });
    expect(captureApiError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: 'cron/data_cleanup' }),
    );
    expect(logged).toHaveBeenCalledWith('data_cleanup', expect.any(Object), 'error');
  });
});
