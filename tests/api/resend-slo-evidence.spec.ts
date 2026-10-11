// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), mute: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  emailSendLog: { findUnique: fixture.findUnique, update: fixture.update },
  workflowDiagnostic: { create: fixture.create },
  user: { updateMany: fixture.mute },
} }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: (fn: () => Promise<Response>) => fn() }));
vi.mock('@/lib/billing/twoStage/api/webhookLinkage', () => ({ billingDeliveryLinker: () => async () => ({ matched: false }) }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({ checkWebhookRateLimit: async () => ({ success: true }) }));
vi.mock('@/lib/webhooks/logEvent', () => ({ logWebhookEvent: vi.fn() }));

import { POST } from '@/app/api/webhooks/resend/route';
import { signSvixPayload } from '@/lib/email/webhookSignature';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const SECRET = `whsec_${Buffer.from('slo-regression-signing-secret-32bytes').toString('base64')}`;

function signedRequest(createdAt: string | undefined, badSignature = false, event = 'delivered', bounceType?: string) {
  const rawBody = JSON.stringify({ type: `email.${event}`, created_at: createdAt, data: {
    email_id: 'private-provider-id', ...(bounceType ? { bounce: { type: bounceType } } : {}),
  } });
  const msgId = 'fixture-receipt';
  const timestamp = String(NOW / 1_000);
  return new Request('https://example.test/api/webhooks/resend', {
    method: 'POST',
    body: rawBody,
    headers: {
      'svix-id': msgId, 'svix-timestamp': timestamp,
      'svix-signature': badSignature ? 'v1,invalid' : `v1,${signSvixPayload(SECRET, msgId, timestamp, rawBody)}`,
    },
  });
}

describe('signed delivery evidence and event ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
    fixture.findUnique.mockResolvedValue({ id: 'send-log-1', userId: 'member-fixture', lastEventAt: new Date(NOW - 100_000), templateKey: 'welcome', entityType: null });
    fixture.update.mockResolvedValue({ id: 'send-log-1' });
    fixture.create.mockResolvedValue({ id: 'evidence-1' });
    fixture.mute.mockResolvedValue({ count: 1 });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('preserves an older delivered timestamp after a newer opened/clicked event', async () => {
    const response = await POST(signedRequest(new Date(NOW - 500_000).toISOString()));
    expect(response.status).toBe(200);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      workflow: 'email_delivery_slo', entityType: 'email_send_log', entityId: 'send-log-1',
      metadata: { version: 1, event: 'delivered', eventAtMs: NOW - 500_000 },
    }) });
    expect(JSON.stringify(fixture.create.mock.calls)).not.toMatch(/private-provider-id|member-fixture/);
  });

  it('does not substitute receipt time for missing or future sender event time', async () => {
    for (const timestamp of [undefined, new Date(NOW + 1).toISOString()]) {
      await POST(signedRequest(timestamp));
      expect(fixture.create.mock.lastCall?.[0].data.metadata.eventAtMs).toBeNull();
    }
  });

  it('rejects unsigned evidence and does not attribute unmatched receipts', async () => {
    expect((await POST(signedRequest(new Date(NOW).toISOString(), true))).status).toBe(401);
    expect(fixture.findUnique).not.toHaveBeenCalled();
    fixture.findUnique.mockResolvedValue(null);
    expect((await POST(signedRequest(new Date(NOW).toISOString()))).status).toBe(200);
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('keeps a telemetry failure from changing the provider response or latest event update', async () => {
    fixture.create.mockRejectedValue(new Error('observation store unavailable'));
    expect((await POST(signedRequest(new Date(NOW).toISOString()))).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledTimes(1);
  });

  it.each([['failed', undefined], ['bounced', 'Permanent']])('persists only signature-verified %s terminal evidence on the matched send', async (event, bounceType) => {
    const timestamp = new Date(NOW).toISOString();
    expect((await POST(signedRequest(timestamp, true, event, bounceType))).status).toBe(401);
    expect(fixture.update).not.toHaveBeenCalled();
    expect((await POST(signedRequest(timestamp, false, event, bounceType))).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({
      where: { id: 'send-log-1' }, data: expect.objectContaining({
        lastEvent: event, lastEventAt: new Date(NOW), ...(event === 'bounced' ? { bounceType } : {}),
      }),
    });
  });
});
