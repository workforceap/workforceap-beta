// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The webhook retry cron runs every 10 minutes and usually finds nothing to
 * do. Only a batch that processed at least one retry is an audit event; an
 * empty run must not add an `admin_webhook_retries_processed` row.
 */
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/webhooks/retry', () => ({ getPendingRetryEvents: vi.fn() }));
vi.mock('@/app/api/admin/webhooks/process-retries/_processRetries', () => ({ processRetryEvent: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/cron/authorizeCronRequest', () => ({ authorizeCronRequest: vi.fn(() => null) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { GET, POST } from '@/app/api/admin/webhooks/process-retries/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getPendingRetryEvents } from '@/lib/webhooks/retry';
import { processRetryEvent } from '@/app/api/admin/webhooks/process-retries/_processRetries';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';

const pendingEvent = (id: string) => ({ id, source: 'learning-completion' });

function cronRequest() {
  return new NextRequest('http://localhost/api/admin/webhooks/process-retries', {
    headers: { authorization: 'Bearer cron-secret' },
  });
}

describe('process-retries audit noise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cron caller: no session, CRON_SECRET accepted.
    vi.mocked(getUser).mockResolvedValue(null as never);
    vi.mocked(isAdmin).mockResolvedValue(false as never);
    vi.mocked(authorizeCronRequest).mockReturnValue(null as never);
    vi.mocked(processRetryEvent).mockImplementation(async (event: { id: string; source: string }) => ({
      id: event.id,
      source: event.source,
      result: 'success' as const,
    }));
  });

  it('writes no audit rows for a run that processed nothing, then exactly one for a run that did', async () => {
    vi.mocked(getPendingRetryEvents).mockResolvedValueOnce([] as never);
    const empty = await GET(cronRequest());
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ processed: 0, summary: {}, results: [] });
    expect(auditLog).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();

    vi.mocked(getPendingRetryEvents).mockResolvedValueOnce([pendingEvent('wh-1'), pendingEvent('wh-2')] as never);
    const busy = await GET(cronRequest());
    expect(busy.status).toBe(200);
    expect((await busy.json()).processed).toBe(2);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith({
      actorUserId: null,
      action: 'admin_webhook_retries_processed',
      targetType: 'WebhookRetryBatch',
      targetId: 'cron',
      metadata: { processed: 2, triggeredBy: 'cron', summary: { success: 2 } },
    });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'created', object: { type: 'WebhookRetryBatch', id: 'cron' } }),
    );
  });

  it('stays silent across repeated empty cron runs', async () => {
    vi.mocked(getPendingRetryEvents).mockResolvedValue([] as never);

    await GET(cronRequest());
    await POST(cronRequest());
    await GET(cronRequest());

    expect(getPendingRetryEvents).toHaveBeenCalledTimes(3);
    expect(auditLog).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps attributing a manual admin run that processed retries', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as never);
    vi.mocked(isAdmin).mockResolvedValue(true as never);
    vi.mocked(getPendingRetryEvents).mockResolvedValueOnce([] as never);

    await POST(cronRequest());
    expect(auditLog).not.toHaveBeenCalled();

    vi.mocked(getPendingRetryEvents).mockResolvedValueOnce([pendingEvent('wh-9')] as never);
    await POST(cronRequest());

    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        targetId: 'admin',
        metadata: { processed: 1, triggeredBy: 'admin', summary: { success: 1 } },
      }),
    );
  });
});
