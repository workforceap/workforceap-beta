// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: (fn: () => unknown) => fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => null) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/rate-limit', () => ({ checkWebhookRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/workflows/careerOS', () => ({ handleLearningCompletion: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    xapiStatement: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    webhookEvent: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}));
import { prisma } from '@/lib/db/prisma';
import { handleLearningCompletion } from '@/lib/workflows/careerOS';
import { captureApiError } from '@/lib/observability/captureApiError';
import { markWebhookForRetry, getPendingRetryEvents } from '@/lib/webhooks/retry';
import { WebhookStatusPersistenceError } from '@/lib/webhooks/logEvent';
import { processRetryEvent } from '@/app/api/admin/webhooks/process-retries/_processRetries';
import { POST } from '@/app/api/webhooks/learning-completion/route';
import { GET } from '@/app/api/admin/webhooks/process-retries/route';
import type { NextRequest } from 'next/server';

const event = { id: 'retry-1', source: 'learning-completion', eventType: 'learning.completion', eventId: 'delivery-1',
  payloadSize: 20, processingTimeMs: null, status: 'retrying', httpStatusCode: 500, errorMessage: null,
  retryCount: 1, nextRetryAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0) };
const payload = { memberId: 'fixture-member', courseName: 'Fixture course' };
const request = (eventId?: string) => new Request('https://example.test/api/webhooks/learning-completion', {
  method: 'POST', headers: { 'x-webhook-secret': 'test-secret' }, body: JSON.stringify({ ...payload, ...(eventId ? { eventId } : {}) }),
});

describe('durable webhook retry outcomes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.xapiStatement.create).mockResolvedValue({} as never);
    vi.mocked(prisma.xapiStatement.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: 'retry-1' } as never);
    vi.mocked(prisma.webhookEvent.update).mockResolvedValue({} as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([0, 4])('propagates persistence failure while scheduling/dead-lettering count %s', async (count) => {
    const failure = new Error('database unavailable');
    vi.mocked(prisma.webhookEvent.update).mockRejectedValueOnce(failure);
    await expect(markWebhookForRetry('retry-1', count)).rejects.toMatchObject({
      name: 'WebhookStatusPersistenceError', cause: failure,
    });
  });

  it('dead-letters only after persistence and clears the due date', async () => {
    expect(await markWebhookForRetry('retry-1', 4)).toBe('max_retries_exceeded');
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'dead_letter', nextRetryAt: null, retryCount: 4 }),
    }));
  });

  it('does not consume a retry when only terminal success persistence fails', async () => {
    vi.mocked(prisma.webhookEvent.update).mockRejectedValueOnce(new Error('status write failed'));
    const reschedule = vi.fn();
    await expect(processRetryEvent(event, {
      reprocessWebhookEvent: async () => 'success', markForRetry: reschedule,
    })).rejects.toBeInstanceOf(WebhookStatusPersistenceError);
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('propagates failed retry rescheduling after a downstream failure', async () => {
    vi.mocked(prisma.webhookEvent.update).mockRejectedValueOnce(new Error('reschedule failed'));
    await expect(processRetryEvent(event, {
      reprocessWebhookEvent: async () => { throw new Error('workflow failed'); },
    })).rejects.toBeInstanceOf(WebhookStatusPersistenceError);
  });

  it('repairs terminal status without repeating an already-processed workflow', async () => {
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValueOnce({ processed: true, payload } as never);
    expect((await processRetryEvent(event)).result).toBe('success');
    expect(handleLearningCompletion).not.toHaveBeenCalled();
    expect(prisma.xapiStatement.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the fourth already-scheduled attempt discoverable', async () => {
    const fourth = { ...event, retryCount: 4 };
    vi.mocked(prisma.webhookEvent.findMany).mockImplementation((args: any) => {
      const condition = args.where.retryCount;
      return Promise.resolve([fourth].filter((row) => condition.lt !== undefined ? row.retryCount < condition.lt : row.retryCount <= condition.lte)) as never;
    });
    expect(await getPendingRetryEvents()).toEqual([fourth]);
  });

  it('returns retryScheduled false when the durable retry update fails', async () => {
    vi.mocked(handleLearningCompletion).mockRejectedValueOnce(new Error('workflow failed'));
    vi.mocked(prisma.webhookEvent.update).mockRejectedValueOnce(new Error('retry write failed'));
    const response = await POST(request('delivery-1'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error', retryScheduled: false });
    expect(captureApiError).toHaveBeenCalledTimes(2);
  });

  it('returns a controlled 500 when even the failed-event insert fails', async () => {
    vi.mocked(handleLearningCompletion).mockRejectedValueOnce(new Error('workflow failed'));
    vi.mocked(prisma.webhookEvent.create).mockRejectedValueOnce(new Error('insert failed'));
    const response = await POST(request('delivery-1'));
    expect(await response.json()).toEqual({ error: 'Internal Server Error', retryScheduled: false });
    expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
  });

  it('does not schedule a replay if the payload was never persisted', async () => {
    vi.mocked(prisma.xapiStatement.create).mockRejectedValueOnce(new Error('payload persistence failed'));
    const response = await POST(request('delivery-1'));
    expect((await response.json()).retryScheduled).toBe(false);
    expect(handleLearningCompletion).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
  });

  it('stores a usable replay reference for a delivery without provider eventId', async () => {
    vi.mocked(handleLearningCompletion).mockRejectedValueOnce(new Error('workflow failed'));
    const response = await POST(request());
    expect((await response.json()).retryScheduled).toBe(true);
    const statementId = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0].data.statementId;
    const replayId = vi.mocked(prisma.webhookEvent.create).mock.calls[0][0].data.eventId;
    expect(replayId).toMatch(/^[a-f0-9]{64}$/);
    expect(statementId).toBe(`wh:learning-completion:${replayId}`);

    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValueOnce({ processed: false, payload } as never);
    vi.mocked(handleLearningCompletion).mockResolvedValueOnce({} as never);
    expect((await processRetryEvent({ ...event, eventId: replayId! })).result).toBe('success');
    expect(prisma.xapiStatement.findUnique).toHaveBeenLastCalledWith({
      where: { statementId }, select: { payload: true, processed: true },
    });
  });

  it('processor endpoint reports a terminal persistence failure instead of success summary', async () => {
    vi.mocked(prisma.webhookEvent.findMany).mockResolvedValueOnce([event] as never);
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValueOnce({ processed: true } as never);
    vi.mocked(prisma.webhookEvent.update).mockRejectedValueOnce(new Error('terminal write failed'));
    const response = await GET(new Request('https://example.test/api/admin/webhooks/process-retries', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }) as NextRequest);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to process retries' });
    expect(captureApiError).toHaveBeenCalledOnce();
  });
});
