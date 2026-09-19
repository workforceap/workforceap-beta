import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: Request,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: vi.fn(async (fn: () => Promise<unknown>) => fn()) }));
vi.mock('@/lib/webhooks/logEvent', () => ({ logWebhookEvent: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/stripe/subscriptionPersistence', () => ({
  reconcileOrganizationSubscription: vi.fn(async () => 'applied'),
  reconcileEmployerSubscription: vi.fn(async (...args: unknown[]) => {
    const mirror = args[4] as undefined | ((tx: unknown, next: unknown) => Promise<void>);
    if (mirror) {
      const { prisma } = await import('@/lib/db/prisma');
      await mirror(prisma as never, { status: 'active' });
    }
    return 'applied';
  }),
}));
vi.mock('@/lib/stripe/stripeSubscriptionSnapshot', () => ({
  canonicalSubscriptionSnapshot: vi.fn((subscription: any) => ({
    id: subscription.id,
    customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? 'cus-1',
    status: subscription.status,
    organizationId: subscription.metadata?.organizationId,
    employerId: subscription.metadata?.employerId,
    userId: subscription.metadata?.userId,
  })),
}));
vi.mock('@/lib/db/prisma', () => {
  const employer = { findUnique: vi.fn(), count: vi.fn() };
  const employerSubscription = { updateMany: vi.fn(), count: vi.fn(async () => 1) };
  const tx = { employer, employerSubscription, partner: { updateMany: vi.fn() } };
  return { prisma: { ...tx, $transaction: vi.fn(async (arg: unknown) => typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as Promise<unknown>[])) } };
});
vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
  getStripeWebhookSecret: vi.fn(() => 'whsec_platform'),
  getStripeConnectWebhookSecret: vi.fn(() => 'whsec_connect'),
}));

import { POST } from '@/app/api/stripe/webhook/route';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/stripe/client';
import {
  reconcileEmployerSubscription,
  reconcileOrganizationSubscription,
} from '@/lib/stripe/subscriptionPersistence';

const request = () => new Request('http://localhost/api/stripe/webhook', {
  method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}',
});
function deliver(event: Record<string, unknown>, currentSubscription?: Record<string, unknown>) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn(() => event) },
    subscriptions: {
      retrieve: vi.fn(async () => currentSubscription ?? (event.data as { object: Record<string, unknown> }).object),
    },
  } as never);
  return POST(request() as never);
}

describe('Stripe webhook revision reconciliation wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['invoice.payment_succeeded', 'invoice_succeeded'],
    ['invoice.payment_failed', 'invoice_failed'],
  ] as const)('routes %s with string and expanded subscription IDs', async (type, kind) => {
    for (const subscription of ['sub-1', { id: 'sub-1' }]) {
      await deliver({ id: `evt_${kind}`, type, created: 100, data: { object: {
        subscription,
        metadata: { organizationId: 'org-1' },
      } } }, { id: 'sub-1', customer: 'cus-1', status: 'active', metadata: { organizationId: 'org-1' } });
    }
    expect(reconcileOrganizationSubscription).toHaveBeenCalledTimes(2);
    expect(reconcileOrganizationSubscription).toHaveBeenLastCalledWith(
      prisma,
      { organizationId: 'org-1' },
      expect.objectContaining({ subscriptionId: 'sub-1', kind }),
      expect.any(Function),
    );
  });

  it.each([
    ['active', 'past_due'],
    ['past_due', 'active'],
  ] as const)('reconciles same-second %s delivery through a canonical fetch', async (delivered, current) => {
    await deliver({ id: `evt_${delivered}`, type: 'customer.subscription.updated', created: 100, data: { object: {
      id: 'sub-1', status: delivered, metadata: { organizationId: 'org-1' },
    } } }, { id: 'sub-1', customer: 'cus-1', status: current, metadata: { organizationId: 'org-1' } });
    const call = vi.mocked(reconcileOrganizationSubscription).mock.calls.at(-1)!;
    expect(call[2]).toEqual(expect.objectContaining({ subscriptionId: 'sub-1', kind: 'subscription_updated' }));
    expect(await call[3]()).toEqual(expect.objectContaining({ id: 'sub-1', status: current }));
  });

  it('routes deletion as terminal but still fetches canonical ownership', async () => {
    await deliver({ id: 'evt-delete', type: 'customer.subscription.deleted', created: 101, data: { object: {
      id: 'sub-1', customer: 'cus-1', status: 'canceled', metadata: { organizationId: 'org-1' },
    } } }, { id: 'sub-1', customer: 'cus-1', status: 'canceled', metadata: { organizationId: 'org-1' } });
    expect(reconcileOrganizationSubscription).toHaveBeenCalledWith(
      prisma,
      { organizationId: 'org-1' },
      expect.objectContaining({ subscriptionId: 'sub-1', kind: 'subscription_deleted' }),
      expect.any(Function),
    );
  });

  it('passes exact predecessor for authorized checkout replacement', async () => {
    await deliver({ id: 'evt-checkout', type: 'checkout.session.completed', created: 102, data: { object: {
      payment_status: 'paid', subscription: { id: 'sub-new' },
      metadata: { organizationId: 'org-1', replacesSubscriptionId: 'sub-old' },
    } } }, { id: 'sub-new', customer: 'cus-1', status: 'active', metadata: { organizationId: 'org-1' } });
    expect(reconcileOrganizationSubscription).toHaveBeenCalledWith(
      prisma,
      { organizationId: 'org-1' },
      expect.objectContaining({ subscriptionId: 'sub-new', kind: 'checkout', replacesSubscriptionId: 'sub-old' }),
      expect.any(Function),
    );
  });

  it('terminal userId fallback mirror receives canceled status and basic tier only after commit', async () => {
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ id: 'emp-1', stripeCustomerId: 'cus-1' } as never);
    vi.mocked(reconcileEmployerSubscription).mockImplementationOnce(async (...args: unknown[]) => {
      const mirror = args[4] as (tx: any, next: any) => Promise<void>;
      await mirror(prisma, { status: 'canceled', tier: 'basic' });
      return 'applied';
    });
    await deliver({ id: 'evt-delete-user', type: 'customer.subscription.deleted', created: 103, data: { object: {
      id: 'sub-1', metadata: { userId: 'user-1' },
    } } }, { id: 'sub-1', customer: 'cus-1', status: 'canceled', metadata: { userId: 'user-1' } });
    expect(prisma.employerSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', stripeSubscriptionId: 'sub-1' },
      data: { status: 'canceled', tier: 'basic' },
    });
  });

  it('userId fallback uses same reconciler and mirrors only from committed callback', async () => {
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ id: 'emp-1', stripeCustomerId: 'cus-1' } as never);
    await deliver({ id: 'evt-user', type: 'customer.subscription.updated', created: 103, data: { object: {
      id: 'sub-1', status: 'active', metadata: { userId: 'user-1' },
    } } }, { id: 'sub-1', customer: 'cus-1', status: 'active', metadata: { userId: 'user-1' } });
    expect(reconcileEmployerSubscription).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ employerId: 'emp-1', userId: 'user-1' }),
      expect.objectContaining({ subscriptionId: 'sub-1', kind: 'subscription_updated' }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(prisma.employerSubscription.updateMany).toHaveBeenCalledTimes(1);
  });

  it('provider fetch failure returns non-2xx', async () => {
    vi.mocked(reconcileOrganizationSubscription).mockImplementationOnce(async (...args: any[]) => {
      await args[3]();
      return 'applied';
    });
    const event = { id: 'evt-provider', type: 'invoice.payment_failed', created: 104, data: { object: { subscription: 'sub-1', metadata: { organizationId: 'org-1' } } } };
    vi.mocked(getStripe).mockReturnValue({
      webhooks: { constructEvent: vi.fn(() => event) },
      subscriptions: { retrieve: vi.fn(async () => { throw new Error('provider failed'); }) },
    } as never);
    expect((await POST(request() as never)).status).toBe(500);
  });

  it('CAS exhaustion returns non-2xx', async () => {
    vi.mocked(reconcileOrganizationSubscription).mockRejectedValueOnce(new Error('contended'));
    const event = { id: 'evt-cas', type: 'invoice.payment_failed', created: 104, data: { object: { subscription: 'sub-1', metadata: { organizationId: 'org-1' } } } };
    vi.mocked(getStripe).mockReturnValue({ webhooks: { constructEvent: vi.fn(() => event) } } as never);
    expect((await POST(request() as never)).status).toBe(500);
  });

  it('atomic mirror failure returns non-2xx', async () => {
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ id: 'emp-1', stripeCustomerId: 'cus-1' } as never);
    vi.mocked(reconcileEmployerSubscription).mockRejectedValueOnce(new Error('mirror failed'));
    const event = { id: 'evt-mirror', type: 'customer.subscription.updated', created: 104, data: { object: { id: 'sub-1', metadata: { userId: 'user-1' } } } };
    vi.mocked(getStripe).mockReturnValue({ webhooks: { constructEvent: vi.fn(() => event) } } as never);
    expect((await POST(request() as never)).status).toBe(500);
  });

});
