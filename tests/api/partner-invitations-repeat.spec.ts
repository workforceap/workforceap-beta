// @vitest-environment node
/**
 * P01 "duplicate-safe referral": when this partner (the caller or any teammate
 * on the same partner) already invited an email in the last
 * PARTNER_REINVITE_WINDOW_HOURS, POST /api/partner/invitations sends no second
 * email and writes no new partner_invite_sent event. It answers 200 with
 * `alreadyInvited: true` and a plain sentence naming the earlier date.
 *
 * The memberEvent lookup below applies the route's `where` to an in-memory
 * event list, so the window, entity and email filters are all exercised.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type StoredEvent = {
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type FindFirstArgs = {
  where: {
    eventName: { in: string[] };
    entityType: string;
    entityId: string;
    createdAt: { gte: Date };
    metadata: { path: string[]; equals: unknown };
  };
  orderBy: { createdAt: 'desc' };
  select: { createdAt: true };
};

const h = vi.hoisted(() => ({
  user: { id: 'partner-user-1' } as { id: string } | null,
  partnerCtx: { partnerId: 'partner-1' } as { partnerId: string } | null,
  rateLimitOk: true,
  events: [] as StoredEvent[],
  findFirst: vi.fn(),
  send: vi.fn(),
  trackEvent: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
  recordPartnerWorkflowEvent: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextRequest: Request, NextResponse: MockNextResponse };
});
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    partner: {
      findUnique: vi.fn(async () => ({ id: 'partner-1', name: 'Partner Org', slug: 'partner-org', referralCode: 'PARTNER1' })),
    },
    user: { findUnique: vi.fn(async () => ({ fullName: 'Pat Partner', email: 'pat@partner.example' })) },
    memberEvent: { findFirst: h.findFirst },
  };
  return { prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => h.user) }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn(async () => h.partnerCtx) }));
vi.mock('@/lib/rate-limit', () => ({ checkAdminInviteRateLimit: vi.fn(async () => ({ success: h.rateLimitOk })) }));
vi.mock('@/lib/email', () => ({ sendPartnerReferralInviteEmail: h.send }));
vi.mock('@/lib/events/track', () => ({ trackEvent: h.trackEvent }));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: h.recordPartnerWorkflowEvent }));
vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

import { POST } from '@/app/api/partner/invitations/route';

const NOW = new Date('2026-09-23T17:00:00Z');
const HOUR = 60 * 60 * 1000;
const EMAIL = 'new.member@example.com';

function priorInvite(hoursAgo: number, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    eventName: 'partner_invite_sent',
    entityType: 'partner',
    entityId: 'partner-1',
    metadata: { inviteeEmail: EMAIL },
    createdAt: new Date(NOW.getTime() - hoursAgo * HOUR),
    ...overrides,
  };
}

/** Applies the route's findFirst `where` the way Postgres would. */
function queryEvents(args: FindFirstArgs) {
  const { where } = args;
  const matches = h.events
    .filter((e) => where.eventName.in.includes(e.eventName))
    .filter((e) => e.entityType === where.entityType && e.entityId === where.entityId)
    .filter((e) => e.createdAt.getTime() >= where.createdAt.gte.getTime())
    .filter((e) => {
      let value: unknown = e.metadata;
      for (const key of where.metadata.path) {
        value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
      }
      return value === where.metadata.equals;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0] ? { createdAt: matches[0].createdAt } : null;
}

const invite = (email = EMAIL) =>
  POST(
    new Request('http://localhost/api/partner/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }) as never,
  );

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  h.user = { id: 'partner-user-1' };
  h.partnerCtx = { partnerId: 'partner-1' };
  h.rateLimitOk = true;
  h.events = [];
  h.findFirst.mockImplementation(async (args: FindFirstArgs) => queryEvents(args));
  h.send.mockResolvedValue({ ok: true });
  h.trackEvent.mockResolvedValue(undefined);
  h.auditLog.mockResolvedValue(undefined);
  h.logAuditEvent.mockResolvedValue(undefined);
  h.recordPartnerWorkflowEvent.mockResolvedValue(undefined);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('POST /api/partner/invitations repeat guard (P01)', () => {
  it('tells the partner it was already sent and sends nothing when this partner invited the email 2 h ago', async () => {
    h.events = [priorInvite(2)];

    const res = await invite();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      alreadyInvited: true,
      inviteUrl: 'https://www.workforceap.org/apply?ref=PARTNER1',
      message: "You already invited new.member@example.com on Sep 23. We didn't send another email.",
    });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.trackEvent).not.toHaveBeenCalled();
    expect(h.recordPartnerWorkflowEvent).not.toHaveBeenCalled();
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'partner-user-1',
        action: 'partner_invitation_repeat_suppressed',
        metadata: expect.objectContaining({ partnerId: 'partner-1', inviteeEmail: EMAIL }),
      }),
    );
    expect(h.auditLog).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'partner_invitation_sent' }));
  });

  it('matches a teammate invite: the lookup is keyed on the partner, not the caller, over a 24 h window', async () => {
    h.events = [priorInvite(2)];
    h.user = { id: 'teammate-user-2' };

    const res = await invite('New.Member@Example.com');

    expect(res.status).toBe(200);
    expect((await res.json()).alreadyInvited).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    const args = h.findFirst.mock.calls[0]![0] as FindFirstArgs;
    expect(args.where.eventName.in).toContain('partner_invite_sent');
    expect(args.where.entityType).toBe('partner');
    expect(args.where.entityId).toBe('partner-1');
    expect(args.where.metadata).toEqual({ path: ['inviteeEmail'], equals: EMAIL });
    expect(args.where.createdAt.gte.getTime()).toBe(NOW.getTime() - 24 * HOUR);
    expect(args.where).not.toHaveProperty('userId');
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('sends as today when the earlier invite is 25 h old', async () => {
    h.events = [priorInvite(25)];

    const res = await invite();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      inviteUrl: 'https://www.workforceap.org/apply?ref=PARTNER1',
      message: `Invitation sent to ${EMAIL}.`,
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'partner_invite_sent', entityId: 'partner-1', metadata: { inviteeEmail: EMAIL } }),
    );
  });

  it('sends when the recent invite was to a different email', async () => {
    h.events = [priorInvite(2, { metadata: { inviteeEmail: 'someone.else@example.com' } })];

    const res = await invite();

    expect(res.status).toBe(200);
    expect((await res.json()).alreadyInvited).toBeUndefined();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
  });

  it('sends when the recent invite of that email came from a different partner', async () => {
    h.events = [priorInvite(2, { entityId: 'partner-2' })];

    const res = await invite();

    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('fails open: a lookup that throws is logged and the invite still sends', async () => {
    h.events = [priorInvite(2)];
    h.findFirst.mockRejectedValue(new Error('connection reset'));

    const res = await invite();

    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe(`Invitation sent to ${EMAIL}.`);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('401 without a session, before any lookup or send', async () => {
    h.user = null;
    const res = await invite();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('403 for a signed-in user who is not a partner', async () => {
    h.partnerCtx = null;
    const res = await invite();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('429 when the per-user rate limit is exhausted, even for a repeat', async () => {
    h.rateLimitOk = false;
    h.events = [priorInvite(2)];
    const res = await invite();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Try again in a little while.' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});
