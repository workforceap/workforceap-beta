// @vitest-environment node
/**
 * The partner minor rule (lib/partner/dataAccess.ts) on the partner write and
 * outreach routes. A referred member who is a minor with no FERPA consent on
 * file is hidden from every non-school partner: the portal pages already 404
 * on them, and these routes now answer the same way.
 *
 *  - GET   /api/partner/outreach            lists no outreach about a hidden member
 *  - POST  /api/partner/outreach            404, and no log row or workflow event
 *  - POST  /api/partner/referrals           404
 *  - PATCH /api/partner/referrals/[memberId] 404, and no update or workflow event
 *
 * The Prisma fake evaluates the exact `where` each route issues against
 * fixture rows (tests/helpers/prismaWhereMatches.ts), so a route that drops
 * the visibility filter finds the hidden member again and fails here. Every
 * case has a visible-member control, and a high-school partner (which works
 * with minors by design) keeps seeing its minor.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  const ORG = 'org-1';
  const ids = {
    adult: '11111111-0000-4000-8000-000000000001',
    minorFlag: '11111111-0000-4000-8000-000000000002',
    minorDob: '11111111-0000-4000-8000-000000000003',
    consentedMinor: '11111111-0000-4000-8000-000000000004',
  };
  const year = new Date().getUTCFullYear();
  const member = (id: string, fullName: string, profile: Record<string, unknown>) => ({
    id,
    fullName,
    email: `${id}@example.test`,
    organizationId: ORG,
    deletedAt: null,
    profile: { role: 'member', ...profile },
    userRoles: [{ role: { name: 'member' } }],
  });
  const users: Record<string, ReturnType<typeof member>> = {
    [ids.adult]: member(ids.adult, 'Adult Member', { isMinor: false, dob: new Date('1990-04-01'), ferpaConsentGiven: false }),
    [ids.minorFlag]: member(ids.minorFlag, 'Flagged Minor', { isMinor: true, dob: null, ferpaConsentGiven: false }),
    [ids.minorDob]: member(ids.minorDob, 'Dob Minor', { isMinor: false, dob: new Date(Date.UTC(year - 15, 2, 1)), ferpaConsentGiven: false }),
    [ids.consentedMinor]: member(ids.consentedMinor, 'Consented Minor', { isMinor: true, dob: null, ferpaConsentGiven: true }),
  };
  const partners: Record<string, { id: string; organizationId: string; active: boolean; partnerType: string }> = {
    'partner-community': { id: 'partner-community', organizationId: ORG, active: true, partnerType: 'community' },
    'partner-referral': { id: 'partner-referral', organizationId: ORG, active: true, partnerType: 'referral' },
    'partner-school': { id: 'partner-school', organizationId: ORG, active: true, partnerType: 'high_school' },
  };
  const referrals = Object.keys(partners).flatMap((partnerId) =>
    Object.values(ids).map((memberId) => ({
      id: `ref-${partnerId}-${memberId.slice(-1)}`,
      partnerId,
      memberId,
      referredAt: new Date('2026-09-01T00:00:00Z'),
    })),
  );
  const outreachLogs = referrals.map((r) => ({
    id: `log-${r.id}`,
    partnerId: r.partnerId,
    memberId: r.memberId,
    channel: 'email',
    note: 'Checked in',
    createdAt: new Date('2026-09-02T00:00:00Z'),
  }));
  return { ORG, ids, users, partners, referrals, outreachLogs, callerPartner: { current: 'partner-community' } };
});

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(async () => ({ id: 'partner-caller', email: 'caller@example.test' })),
  resolveAuthGucContext: vi.fn(),
}));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(async () => {
    const p = fx.partners[fx.callerPartner.current]!;
    return {
      partnerId: p.id,
      partner: { id: p.id, organizationId: p.organizationId, name: p.id, slug: p.id, logoUrl: null, brandColor: null, partnerType: p.partnerType },
      orgBranding: null,
      hasDirectPartnerLink: true,
    };
  }),
}));
vi.mock('@/lib/db/prisma', async () => {
  const { matchesWhere } = await import('@/tests/helpers/prismaWhereMatches');
  const referralRow = (r: (typeof fx.referrals)[number]) => ({
    ...r,
    partner: fx.partners[r.partnerId],
    member: fx.users[r.memberId],
  });
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    partnerReferral: {
      findFirst: vi.fn(async ({ where }: { where: unknown }) => {
        const row = fx.referrals.map(referralRow).find((r) => matchesWhere(r, where));
        return row
          ? { id: row.id, partnerId: row.partnerId, memberId: row.memberId, referredAt: row.referredAt, member: { fullName: row.member!.fullName } }
          : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })),
    },
    partnerUser: {
      findFirst: vi.fn(async ({ where }: { where: { partnerId: string; userId: string } }) =>
        where.userId === 'teammate' ? { partnerId: where.partnerId, userId: 'teammate' } : null),
    },
    user: { findUnique: vi.fn(async () => ({ fullName: 'Teammate' })) },
    partnerOutreachLog: {
      findMany: vi.fn(async ({ where }: { where: unknown }) =>
        fx.outreachLogs
          .filter((l) => matchesWhere({ ...l, member: fx.users[l.memberId] }, where))
          .map((l) => ({ ...l, member: { fullName: fx.users[l.memberId]!.fullName }, createdBy: { fullName: 'Caller' } }))),
      create: vi.fn(async ({ data }: { data: { memberId: string } & Record<string, unknown> }) => ({
        id: 'log-new',
        ...data,
        createdAt: new Date('2026-09-03T00:00:00Z'),
        member: { fullName: fx.users[data.memberId]!.fullName },
      })),
    },
  };
  return { prisma };
});
vi.mock('@/lib/partner/referralBundle', () => ({ loadPartnerReferralBundle: vi.fn() }));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined), auditRequestMeta: vi.fn(() => ({})) }));

const { NextRequest } = await import('next/server');
const { GET: outreachGET, POST: outreachPOST } = await import('@/app/api/partner/outreach/route');
const { POST: referralsPOST } = await import('@/app/api/partner/referrals/route');
const { PATCH: referralPATCH } = await import('@/app/api/partner/referrals/[memberId]/route');
const { prisma } = await import('@/lib/db/prisma');
const { recordPartnerWorkflowEvent } = await import('@/lib/portal/workflowEvents');

type Handler = (request: never, context: never) => Promise<Response>;

function call(handler: Handler, method: string, url: string, body?: unknown, params?: Record<string, string>) {
  const request = new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  return handler(request as never, (params ? { params: Promise.resolve(params) } : undefined) as never);
}

const HIDDEN = [
  ['a minor by flag', fx.ids.minorFlag],
  ['a minor by date of birth', fx.ids.minorDob],
] as const;
const VISIBLE = [
  ['an adult', fx.ids.adult],
  ['a minor with FERPA consent', fx.ids.consentedMinor],
] as const;
const NON_SCHOOL = ['partner-community', 'partner-referral'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  fx.callerPartner.current = 'partner-community';
});

describe('GET /api/partner/outreach', () => {
  it.each(NON_SCHOOL)('%s: lists outreach about visible members only', async (partnerId) => {
    fx.callerPartner.current = partnerId;
    const res = await call(outreachGET as Handler, 'GET', '/api/partner/outreach');
    expect(res.status).toBe(200);
    const { logs } = (await res.json()) as { logs: Array<{ memberId: string; memberName: string }> };
    expect(logs.map((l) => l.memberId).sort()).toEqual([fx.ids.adult, fx.ids.consentedMinor].sort());
    expect(JSON.stringify(logs)).not.toContain('Flagged Minor');
    expect(JSON.stringify(logs)).not.toContain('Dob Minor');
  });

  it('a high-school partner still lists outreach about its minors', async () => {
    fx.callerPartner.current = 'partner-school';
    const res = await call(outreachGET as Handler, 'GET', '/api/partner/outreach');
    const { logs } = (await res.json()) as { logs: Array<{ memberId: string }> };
    expect(logs).toHaveLength(4);
  });
});

describe('POST /api/partner/outreach', () => {
  const body = (memberId: string) => ({ memberId, channel: 'call', note: 'Left a voicemail' });

  it.each(HIDDEN)('404 for %s, with no log row and no workflow event', async (_label, memberId) => {
    const res = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', body(memberId));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(prisma.partnerOutreachLog.create).not.toHaveBeenCalled();
    expect(recordPartnerWorkflowEvent).not.toHaveBeenCalled();
  });

  it('a hidden member and an unreferred member get the same answer', async () => {
    const hidden = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', body(fx.ids.minorFlag));
    const unreferred = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', body('99999999-0000-4000-8000-000000000009'));
    expect(hidden.status).toBe(unreferred.status);
    expect(await hidden.json()).toEqual(await unreferred.json());
  });

  it.each(VISIBLE)('control: %s is logged', async (_label, memberId) => {
    const res = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', body(memberId));
    expect(res.status).toBe(200);
    expect(prisma.partnerOutreachLog.create).toHaveBeenCalledTimes(1);
  });

  it('a high-school partner can log outreach about its minor', async () => {
    fx.callerPartner.current = 'partner-school';
    const res = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', body(fx.ids.minorFlag));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/partner/referrals', () => {
  it.each(NON_SCHOOL.flatMap((p) => HIDDEN.map(([label, id]) => [p, label, id] as const)))(
    '%s: 404 for %s',
    async (partnerId, _label, memberId) => {
      fx.callerPartner.current = partnerId;
      const res = await call(referralsPOST as Handler, 'POST', '/api/partner/referrals', { memberId });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Member not found' });
    },
  );

  it.each(VISIBLE)('control: %s is acknowledged', async (_label, memberId) => {
    const res = await call(referralsPOST as Handler, 'POST', '/api/partner/referrals', { memberId });
    expect(res.status).toBe(200);
    expect((await res.json()).memberId).toBe(memberId);
  });

  it('a high-school partner keeps its minor', async () => {
    fx.callerPartner.current = 'partner-school';
    const res = await call(referralsPOST as Handler, 'POST', '/api/partner/referrals', { memberId: fx.ids.minorFlag });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/partner/referrals/[memberId]', () => {
  const patch = (memberId: string) =>
    call(referralPATCH as Handler, 'PATCH', `/api/partner/referrals/${memberId}`, { assignedPartnerUserId: null }, { memberId });

  it.each(HIDDEN)('404 for %s, with no update and no workflow event naming them', async (_label, memberId) => {
    const res = await patch(memberId);
    expect(res.status).toBe(404);
    expect(prisma.partnerReferral.update).not.toHaveBeenCalled();
    expect(recordPartnerWorkflowEvent).not.toHaveBeenCalled();
  });

  it.each(VISIBLE)('control: %s can be reassigned', async (_label, memberId) => {
    const res = await patch(memberId);
    expect(res.status).toBe(200);
    expect(prisma.partnerReferral.update).toHaveBeenCalledTimes(1);
  });

  it('a high-school partner can reassign its minor', async () => {
    fx.callerPartner.current = 'partner-school';
    const res = await patch(fx.ids.minorFlag);
    expect(res.status).toBe(200);
  });
});
