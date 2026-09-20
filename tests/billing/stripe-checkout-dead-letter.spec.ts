import { beforeEach, describe, expect, it, vi } from 'vitest';

// WAP-179: a paid checkout.session.completed without metadata.organizationId
// used to `break` and answer 200 — charged, never provisioned, recorded
// nowhere. It must now leave a dead letter and an error capture.

vi.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: vi.fn(async (fn: () => Promise<unknown>) => fn()) }));
vi.mock('@/lib/webhooks/logEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webhooks/logEvent')>()),
  logWebhookEvent: vi.fn(),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: vi.fn() }));
vi.mock('@/lib/stripe/subscriptionPersistence', () => ({
  reconcileOrganizationSubscription: vi.fn(async () => 'applied'),
  reconcileEmployerSubscription: vi.fn(async () => 'applied'),
}));
vi.mock('@/lib/stripe/stripeSubscriptionSnapshot', () => ({ canonicalSubscriptionSnapshot: vi.fn((s: unknown) => s) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    webhookEvent: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
  getStripeWebhookSecret: vi.fn(() => 'whsec_platform'),
  getStripeConnectWebhookSecret: vi.fn(() => 'whsec_connect'),
}));

import { POST } from '@/app/api/stripe/webhook/route';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/stripe/client';
import { captureApiError } from '@/lib/observability/captureApiError';
import { reconcileOrganizationSubscription } from '@/lib/stripe/subscriptionPersistence';

const payload = '{"id":"evt_1"}';
const request = () => new Request('http://localhost/api/stripe/webhook', {
  method: 'POST', headers: { 'stripe-signature': 'sig' }, body: payload,
});

function deliverCheckout(session: Record<string, unknown>, eventId = 'evt_checkout_1') {
  const event = { id: eventId, type: 'checkout.session.completed', created: 100, data: { object: session } };
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => event) },
    subscriptions: { retrieve: vi.fn(async () => ({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: {} })) },
  } as never);
  return POST(request() as never);
}

const paidOrphan = {
  id: 'cs_test_orphan',
  mode: 'subscription',
  payment_status: 'paid',
  subscription: 'sub_1',
  customer: 'cus_1',
  amount_total: 49900,
  currency: 'usd',
  metadata: {},
};

describe('Stripe checkout.session.completed without an organization (WAP-179)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: 'wh_1' } as never);
  });

  it('writes a dead-letter row, captures the error with the session id, and provisions nothing', async () => {
    const res = await deliverCheckout(paidOrphan);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deadLettered: true });
    expect(reconcileOrganizationSubscription).not.toHaveBeenCalled();

    expect(prisma.webhookEvent.create).toHaveBeenCalledTimes(1);
    const row = vi.mocked(prisma.webhookEvent.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(row).toMatchObject({
      source: 'stripe',
      eventType: 'checkout.session.completed',
      eventId: 'evt_checkout_1',
      status: 'dead_letter',
      httpStatusCode: 200,
      payloadSize: Buffer.byteLength(payload, 'utf8'),
      retryCount: 0,
      nextRetryAt: null,
    });
    expect(String(row.errorMessage)).toContain('cs_test_orphan');
    expect(String(row.errorMessage)).toContain('metadata.organizationId');

    expect(captureApiError).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(captureApiError).mock.calls[0];
    expect((error as Error).message).toContain('cs_test_orphan');
    expect(context).toMatchObject({
      route: 'stripe/webhook',
      extra: expect.objectContaining({
        sessionId: 'cs_test_orphan',
        eventId: 'evt_checkout_1',
        missing: ['metadata.organizationId'],
        customerId: 'cus_1',
      }),
    });
  });

  it('dead-letters a paid session with an organization but no subscription to provision', async () => {
    const res = await deliverCheckout({ ...paidOrphan, id: 'cs_no_sub', subscription: null, metadata: { organizationId: 'org_1' } });

    expect(res.status).toBe(200);
    expect(reconcileOrganizationSubscription).not.toHaveBeenCalled();
    const row = vi.mocked(prisma.webhookEvent.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(row.status).toBe('dead_letter');
    expect(String(row.errorMessage)).toContain('cs_no_sub');
    expect(String(row.errorMessage)).toContain('subscription');
    expect(String(row.errorMessage)).not.toContain('metadata.organizationId');
  });

  it('leaves the provisioning path unchanged when the organization is present', async () => {
    const res = await deliverCheckout({ ...paidOrphan, id: 'cs_ok', metadata: { organizationId: 'org_1', tier: 'growth' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(reconcileOrganizationSubscription).toHaveBeenCalledWith(
      prisma,
      { organizationId: 'org_1' },
      expect.objectContaining({ subscriptionId: 'sub_1', kind: 'checkout', eventId: 'evt_checkout_1', tier: 'growth' }),
      expect.any(Function),
    );
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(captureApiError).not.toHaveBeenCalled();
  });

  it('records nothing for a session that was not paid', async () => {
    const res = await deliverCheckout({ ...paidOrphan, payment_status: 'unpaid' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(captureApiError).not.toHaveBeenCalled();
    expect(reconcileOrganizationSubscription).not.toHaveBeenCalled();
  });

  it('does not duplicate the dead letter when Stripe redelivers the same event', async () => {
    vi.mocked(prisma.webhookEvent.findFirst).mockResolvedValue({ id: 'wh_existing' } as never);

    const res = await deliverCheckout(paidOrphan);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deadLettered: true });
    expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: 'stripe', eventId: 'evt_checkout_1', status: 'dead_letter' } }),
    );
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('answers 500 so Stripe retries when the dead letter itself cannot be stored', async () => {
    vi.mocked(prisma.webhookEvent.create).mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await deliverCheckout(paidOrphan);

    expect(res.status).toBe(500);
    expect(reconcileOrganizationSubscription).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
