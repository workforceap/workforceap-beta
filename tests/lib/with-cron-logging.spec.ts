import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

vi.mock('@/lib/db/gucContext', () => ({
  getGucContext: vi.fn(() => ({ userId: null, organizationId: null, role: 'system' })),
  SYSTEM_GUC_CONTEXT: { userId: null, organizationId: null, role: 'system' },
  runWithGucContext: vi.fn((_context, callback) => callback()),
}));

vi.mock('@/lib/cron/authorizeCronRequest', () => ({
  authorizeCronRequest: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/cron/isCronEnabled', () => ({
  isCronEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  startCronExecution: vi.fn().mockResolvedValue('execution-1'),
  completeCronExecution: vi.fn(),
  runWithCronExecution: vi.fn((_executionId, callback) => callback()),
  getCronRecordsProcessed: vi.fn(() => undefined),
  hasCronDiagnosticBeenLogged: vi.fn(() => false),
}));

import { completeCronExecution } from '@/lib/cron/cronExecution';
import { withCronLogging } from '@/lib/cron/withCronLogging';

describe('withCronLogging response status tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a successful handler response as SUCCESS', async () => {
    const wrapped = withCronLogging('cron_test', async () => Response.json({ ok: true }));

    const response = await wrapped(new Request('http://localhost/api/cron/test'));

    expect(response.status).toBe(200);
    expect(completeCronExecution).toHaveBeenCalledWith('execution-1', 'SUCCESS');
  });

  it('marks a failing handler response as FAILED without replacing its body', async () => {
    const wrapped = withCronLogging('cron_test', async () =>
      Response.json({ ok: false, failed: ['readiness'] }, { status: 503 }),
    );

    const response = await wrapped(new Request('http://localhost/api/cron/test'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, failed: ['readiness'] });
    expect(completeCronExecution).toHaveBeenCalledWith(
      'execution-1',
      'FAILED',
      'Cron handler returned HTTP 503',
    );
  });
});
