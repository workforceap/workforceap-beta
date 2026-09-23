// @vitest-environment node
/**
 * S01 negative-authorization matrix for partner and employer routes that had
 * no test (the partner/employer sibling of export-download-authz-matrix.spec.ts,
 * #2552, and staff-mutation-authz-matrix.spec.ts, #2590).
 *
 * Each route below is imported as the real handler. Only the identity edge
 * (getUser), the portal role helpers (getPartnerForUser / getEmployerForUser),
 * Prisma, loadPartnerReferralBundle, recordPartnerWorkflowEvent, audit and
 * error capture are replaced. The Prisma fake answers from one fixture table
 * and honours the `where` it is given, so a cross-partner or cross-employer
 * denial comes from the route's own filter: drop the filter and the other
 * tenant's row is found (and, for writes, written). Every route also has an
 * allowed-caller control, so a denial cannot pass just because the mocks
 * broke the handler.
 *
 * Partner routes deny unauthenticated callers (401) and a member or employer
 * caller (403); employer routes deny unauthenticated callers (401) and a
 * member or partner caller (403). No 401/403 reads or writes anything.
 *  - PATCH /api/partner/referrals/[memberId]: partner B's member gives 404
 *    with no partnerReferral.update, workflow event or audit; an assignee
 *    from partner B gives 400 with no update; lookups use ctx partnerId.
 *  - GET   /api/partner/outreach: the log read filters on ctx partnerId, not
 *    a query value, and never returns partner B's logs.
 *  - POST  /api/partner/outreach: partner B's member gives 400 with no
 *    partnerOutreachLog.create; a body partnerId is ignored.
 *  - GET   /api/partner/referral-members: the bundle is loaded with ctx
 *    partnerId and ctx organizationId, not a query value.
 *  - GET   /api/partner/team-assign: the partnerUser read filters on ctx
 *    partnerId and never lists partner B's users.
 *  - GET   /api/employer/applications: the read keeps job.employerId from
 *    ctx even when the query names employer B's job.
 *  - GET   /api/employer/hiring-intents: the read filters on ctx employerId.
 *  - POST  /api/employer/hiring-intents: the create writes ctx employerId
 *    even when the body carries employer B's id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => {
  const MEMBER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const MEMBER_B = 'bbbbbbbb-0000-4000-8000-000000000001';
  const TEAMMATE_A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  const TEAMMATE_B = 'bbbbbbbb-0000-4000-8000-0000000000b1';
  const partners: Record<string, { partnerId: string; orgId: string }> = {
    'partner-a-caller': { partnerId: 'partner-a', orgId: 'org-a' },
    'partner-b-caller': { partnerId: 'partner-b', orgId: 'org-b' },
  };
  const employers: Record<string, { employerId: string }> = {
    'employer-a-caller': { employerId: 'employer-a' },
    'employer-b-caller': { employerId: 'employer-b' },
  };
  const referrals = [
    { id: 'ref-a', partnerId: 'partner-a', memberId: MEMBER_A },
    { id: 'ref-b', partnerId: 'partner-b', memberId: MEMBER_B },
  ];
  const partnerUsers = [
    { partnerId: 'partner-a', userId: 'partner-a-caller' },
    { partnerId: 'partner-a', userId: TEAMMATE_A },
    { partnerId: 'partner-b', userId: 'partner-b-caller' },
    { partnerId: 'partner-b', userId: TEAMMATE_B },
  ];
  const outreachLogs = [
    { id: 'log-a', partnerId: 'partner-a', memberId: MEMBER_A },
    { id: 'log-b', partnerId: 'partner-b', memberId: MEMBER_B },
  ];
  const applications = [
    { id: 'app-a', jobId: 'job-a', employerId: 'employer-a' },
    { id: 'app-b', jobId: 'job-b', employerId: 'employer-b' },
  ];
  const intents = [
    { id: 'intent-a', employerId: 'employer-a' },
    { id: 'intent-b', employerId: 'employer-b' },
  ];
  return {
    MEMBER_A,
    MEMBER_B,
    TEAMMATE_A,
    TEAMMATE_B,
    partners,
    employers,
    referrals,
    partnerUsers,
    outreachLogs,
    applications,
    intents,
  };
});

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(), resolveAuthGucContext: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  // Mirrors lib/auth/roles.ts: a caller without a PartnerUser / employer link
  // (a member, or the other portal's role) gets null.
  getPartnerForUser: vi.fn(async (userId: string) => {
    const p = fx.partners[userId];
    if (!p) return null;
    return {
      partnerId: p.partnerId,
      partner: {
        id: p.partnerId,
        organizationId: p.orgId,
        name: `Partner ${p.partnerId}`,
        slug: p.partnerId,
        logoUrl: null,
        brandColor: null,
        partnerType: 'workforce_board',
      },
      orgBranding: null,
      hasDirectPartnerLink: true,
    };
  }),
  getEmployerForUser: vi.fn(async (userId: string) => {
    const e = fx.employers[userId];
    if (!e) return null;
    return {
      employerId: e.employerId,
      employer: {
        id: e.employerId,
        companyName: `Company ${e.employerId}`,
        contactEmail: `${e.employerId}@example.test`,
        tier: 'basic',
        logoUrl: null,
        status: 'active',
      },
    };
  }),
}));

vi.mock('@/lib/db/prisma', () => {
  // A filter the route leaves out matches every row, so dropping a
  // partnerId/employerId filter exposes the other tenant's rows.
  const matches = (value: unknown, filter: unknown) => filter === undefined || value === filter;
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    partnerReferral: {
      findUnique: vi.fn(
        async ({ where }: { where: { partnerId_memberId?: { partnerId?: string; memberId?: string } } }) => {
          const key = where.partnerId_memberId ?? {};
          const row = fx.referrals.find(
            (r) => matches(r.partnerId, key.partnerId) && matches(r.memberId, key.memberId),
          );
          return row ? { ...row, member: { fullName: `Member ${row.memberId}` } } : null;
        },
      ),
      findFirst: vi.fn(async ({ where }: { where: { partnerId?: string; memberId?: string } }) => {
        const row = fx.referrals.find(
          (r) => matches(r.partnerId, where.partnerId) && matches(r.memberId, where.memberId),
        );
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        ...data,
      })),
    },
    partnerUser: {
      findFirst: vi.fn(async ({ where }: { where: { partnerId?: string; userId?: string } }) => {
        const row = fx.partnerUsers.find(
          (u) => matches(u.partnerId, where.partnerId) && matches(u.userId, where.userId),
        );
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { partnerId?: string } }) =>
        fx.partnerUsers
          .filter((u) => matches(u.partnerId, where?.partnerId))
          .map((u) => ({ ...u, user: { id: u.userId, fullName: `User ${u.userId}`, email: `${u.userId}@example.test` } })),
      ),
    },
    partnerOutreachLog: {
      findMany: vi.fn(async ({ where }: { where?: { partnerId?: string } }) =>
        fx.outreachLogs
          .filter((l) => matches(l.partnerId, where?.partnerId))
          .map((l) => ({
            ...l,
            channel: 'email',
            note: `note ${l.id}`,
            createdAt: new Date('2026-09-01T00:00:00Z'),
            member: { fullName: `Member ${l.memberId}` },
            createdBy: { fullName: 'Creator' },
          })),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> & { memberId: string } }) => ({
        id: 'log-new',
        ...data,
        createdAt: new Date('2026-09-02T00:00:00Z'),
        member: { fullName: `Member ${data.memberId}` },
      })),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ fullName: `User ${where.id}` })),
    },
    jobPostingApplication: {
      findMany: vi.fn(async ({ where }: { where?: { job?: { employerId?: string }; jobId?: string } }) =>
        fx.applications
          .filter((a) => matches(a.employerId, where?.job?.employerId) && matches(a.jobId, where?.jobId))
          .map((a) => ({ id: a.id, jobId: a.jobId, job: { id: a.jobId, title: `Job ${a.jobId}` } })),
      ),
    },
    employerHiringIntent: {
      findMany: vi.fn(async ({ where }: { where?: { employerId?: string } }) =>
        fx.intents.filter((i) => matches(i.employerId, where?.employerId)).map((i) => ({ ...i })),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'intent-new', ...data })),
    },
  };
  return { prisma };
});

vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: vi.fn(async (partnerId: string) => ({
    members: fx.referrals
      .filter((r) => r.partnerId === partnerId)
      .map((r) => ({ id: r.memberId, fullName: `Member ${r.memberId}` })),
  })),
}));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn(), captureApiResponseError: vi.fn() }));

const { NextRequest } = await import('next/server');
const { PATCH: referralPATCH } = await import('@/app/api/partner/referrals/[memberId]/route');
const { GET: outreachGET, POST: outreachPOST } = await import('@/app/api/partner/outreach/route');
const { GET: referralMembersGET } = await import('@/app/api/partner/referral-members/route');
const { GET: teamAssignGET } = await import('@/app/api/partner/team-assign/route');
const { GET: employerApplicationsGET } = await import('@/app/api/employer/applications/route');
const { GET: hiringIntentsGET, POST: hiringIntentsPOST } = await import('@/app/api/employer/hiring-intents/route');

const { getUser } = await import('@/lib/auth/server');
const { prisma } = await import('@/lib/db/prisma');
const { loadPartnerReferralBundle } = await import('@/lib/partner/referralBundle');
const { recordPartnerWorkflowEvent } = await import('@/lib/portal/workflowEvents');
const { auditLog } = await import('@/lib/audit');
const { logAuditEvent } = await import('@/lib/audit/log');

type Handler = (request: never, context: never) => Promise<Response>;
type Spy = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Spy>>;

function signInAs(userId: string | null) {
  vi.mocked(getUser).mockResolvedValue(
    userId ? ({ id: userId, email: `${userId}@example.test`, user_metadata: {} } as never) : null,
  );
}

function call(handler: Handler, method: string, url: string, params?: Record<string, string>, body?: unknown) {
  const request = new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const context = params ? { params: Promise.resolve(params) } : undefined;
  return handler(request as never, context as never);
}

/** Every Prisma spy the fake exposes, plus the bundle loader. */
function readAndWriteSpies(): Array<[string, Spy]> {
  const spies: Array<[string, Spy]> = [];
  for (const [model, methods] of Object.entries(db)) {
    if (model === '$transaction') continue;
    for (const [name, spy] of Object.entries(methods)) spies.push([`${model}.${name}`, spy]);
  }
  spies.push(['loadPartnerReferralBundle', vi.mocked(loadPartnerReferralBundle) as unknown as Spy]);
  return spies;
}

function writeSpies(): Array<[string, Spy]> {
  return [
    ['partnerReferral.update', db.partnerReferral!.update!],
    ['partnerOutreachLog.create', db.partnerOutreachLog!.create!],
    ['employerHiringIntent.create', db.employerHiringIntent!.create!],
    ['recordPartnerWorkflowEvent', vi.mocked(recordPartnerWorkflowEvent) as unknown as Spy],
    ['auditLog', vi.mocked(auditLog) as unknown as Spy],
    ['logAuditEvent', vi.mocked(logAuditEvent) as unknown as Spy],
  ];
}

const calledNames = (spies: Array<[string, Spy]>) =>
  spies.filter(([, spy]) => spy.mock.calls.length > 0).map(([name]) => name);

async function expectNoWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calledNames(writeSpies())).toEqual([]);
}

async function expectNothingTouched() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calledNames([...readAndWriteSpies(), ...writeSpies()])).toEqual([]);
}

type Case = {
  name: string;
  handler: Handler;
  method: string;
  url: string;
  params?: Record<string, string>;
  body?: unknown;
};

const PARTNER_ROUTES: Case[] = [
  {
    name: 'PATCH /api/partner/referrals/[memberId]',
    handler: referralPATCH as Handler,
    method: 'PATCH',
    url: `/api/partner/referrals/${fx.MEMBER_A}`,
    params: { memberId: fx.MEMBER_A },
    body: { assignedPartnerUserId: fx.TEAMMATE_A },
  },
  { name: 'GET /api/partner/outreach', handler: outreachGET as Handler, method: 'GET', url: '/api/partner/outreach' },
  {
    name: 'POST /api/partner/outreach',
    handler: outreachPOST as Handler,
    method: 'POST',
    url: '/api/partner/outreach',
    body: { memberId: fx.MEMBER_A, channel: 'email', note: 'Checked in' },
  },
  {
    name: 'GET /api/partner/referral-members',
    handler: referralMembersGET as Handler,
    method: 'GET',
    url: '/api/partner/referral-members',
  },
  {
    name: 'GET /api/partner/team-assign',
    handler: teamAssignGET as Handler,
    method: 'GET',
    url: '/api/partner/team-assign',
  },
];

const EMPLOYER_ROUTES: Case[] = [
  {
    name: 'GET /api/employer/applications',
    handler: employerApplicationsGET as Handler,
    method: 'GET',
    url: '/api/employer/applications',
  },
  {
    name: 'GET /api/employer/hiring-intents',
    handler: hiringIntentsGET as Handler,
    method: 'GET',
    url: '/api/employer/hiring-intents',
  },
  {
    name: 'POST /api/employer/hiring-intents',
    handler: hiringIntentsPOST as Handler,
    method: 'POST',
    url: '/api/employer/hiring-intents',
    body: { programSlug: 'it-support', seatCount: 3 },
  },
];

const send = (c: Case) => call(c.handler, c.method, c.url, c.params, c.body);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe.each([
  ['partner', PARTNER_ROUTES, ['member-caller', 'employer-a-caller'], 'partner-a-caller'],
  ['employer', EMPLOYER_ROUTES, ['member-caller', 'partner-a-caller'], 'employer-a-caller'],
] as const)('%s routes deny unauthenticated and wrong-role callers', (_side, routes, wrongRoles, allowed) => {
  describe.each(routes.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    it('401 when unauthenticated, before any read or write', async () => {
      signInAs(null);
      const res = await send(c);
      expect(res.status).toBe(401);
      await expectNothingTouched();
    });

    it.each(wrongRoles)('403 for %s, before any read or write', async (caller) => {
      signInAs(caller);
      const res = await send(c);
      expect(res.status).toBe(403);
      await expectNothingTouched();
    });

    it(`allowed control: ${allowed} gets 200`, async () => {
      signInAs(allowed);
      const res = await send(c);
      expect(res.status).toBe(200);
    });
  });
});

describe('PATCH /api/partner/referrals/[memberId] stays inside the caller partner', () => {
  it("404 for partner B's member, with no update, workflow event or audit", async () => {
    signInAs('partner-a-caller');
    const res = await call(referralPATCH as Handler, 'PATCH', `/api/partner/referrals/${fx.MEMBER_B}`, {
      memberId: fx.MEMBER_B,
    }, { assignedPartnerUserId: null });
    expect(res.status).toBe(404);
    expect(db.partnerReferral!.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerId_memberId: { partnerId: 'partner-a', memberId: fx.MEMBER_B } } }),
    );
    await expectNoWrites();
  });

  it('400 for an assignee on partner B, with no update, workflow event or audit', async () => {
    signInAs('partner-a-caller');
    const res = await call(referralPATCH as Handler, 'PATCH', `/api/partner/referrals/${fx.MEMBER_A}`, {
      memberId: fx.MEMBER_A,
    }, { assignedPartnerUserId: fx.TEAMMATE_B });
    expect(res.status).toBe(400);
    expect(db.partnerUser!.findFirst).toHaveBeenCalledWith({
      where: { partnerId: 'partner-a', userId: fx.TEAMMATE_B },
    });
    await expectNoWrites();
  });

  it('control: an own-partner assignee on an own referral updates that referral only', async () => {
    signInAs('partner-a-caller');
    const res = await call(referralPATCH as Handler, 'PATCH', `/api/partner/referrals/${fx.MEMBER_A}`, {
      memberId: fx.MEMBER_A,
    }, { assignedPartnerUserId: fx.TEAMMATE_A });
    expect(res.status).toBe(200);
    expect(db.partnerReferral!.update).toHaveBeenCalledTimes(1);
    expect(db.partnerReferral!.update).toHaveBeenCalledWith({
      where: { id: 'ref-a' },
      data: { assignedPartnerUserId: fx.TEAMMATE_A },
    });
    expect(recordPartnerWorkflowEvent).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 'partner-a', entityId: 'ref-a' }),
    );
  });
});

describe('partner outreach stays inside the caller partner', () => {
  it('GET filters on ctx partnerId, ignores a query partnerId and never returns partner B logs', async () => {
    signInAs('partner-a-caller');
    const res = await call(outreachGET as Handler, 'GET', '/api/partner/outreach?partnerId=partner-b');
    expect(res.status).toBe(200);
    for (const [args] of db.partnerOutreachLog!.findMany!.mock.calls) {
      expect((args as { where: unknown }).where).toEqual({ partnerId: 'partner-a' });
    }
    const body = (await res.json()) as { logs: Array<{ id: string }> };
    expect(body.logs.map((l) => l.id)).toEqual(['log-a']);
  });

  it("POST for partner B's member: 400 with no partnerOutreachLog.create", async () => {
    signInAs('partner-a-caller');
    const res = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', undefined, {
      memberId: fx.MEMBER_B,
      channel: 'call',
      note: 'Trying to reach another partner member',
      partnerId: 'partner-b',
    });
    expect(res.status).toBe(400);
    expect(db.partnerReferral!.findFirst).toHaveBeenCalledWith({
      where: { partnerId: 'partner-a', memberId: fx.MEMBER_B },
    });
    await expectNoWrites();
  });

  it('POST control: own member writes the ctx partnerId even when the body names partner B', async () => {
    signInAs('partner-a-caller');
    const res = await call(outreachPOST as Handler, 'POST', '/api/partner/outreach', undefined, {
      memberId: fx.MEMBER_A,
      channel: 'email',
      note: 'Checked in',
      partnerId: 'partner-b',
    });
    expect(res.status).toBe(200);
    expect(db.partnerOutreachLog!.create).toHaveBeenCalledTimes(1);
    expect(db.partnerOutreachLog!.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ partnerId: 'partner-a', memberId: fx.MEMBER_A }) }),
    );
  });
});

describe('partner list reads use the caller partner only', () => {
  it('GET /api/partner/referral-members loads the bundle for ctx partner and org', async () => {
    signInAs('partner-a-caller');
    const res = await call(referralMembersGET as Handler, 'GET', '/api/partner/referral-members?partnerId=partner-b');
    expect(res.status).toBe(200);
    expect(loadPartnerReferralBundle).toHaveBeenCalledTimes(1);
    expect(loadPartnerReferralBundle).toHaveBeenCalledWith('partner-a', 'org-a');
    const body = (await res.json()) as { members: Array<{ id: string }> };
    expect(body.members.map((m) => m.id)).toEqual([fx.MEMBER_A]);
  });

  it('GET /api/partner/team-assign filters on ctx partnerId and never lists partner B users', async () => {
    signInAs('partner-a-caller');
    const res = await call(teamAssignGET as Handler, 'GET', '/api/partner/team-assign?partnerId=partner-b');
    expect(res.status).toBe(200);
    for (const [args] of db.partnerUser!.findMany!.mock.calls) {
      expect((args as { where: unknown }).where).toEqual({ partnerId: 'partner-a' });
    }
    const body = (await res.json()) as { users: Array<{ id: string }> };
    expect(body.users.map((u) => u.id).sort()).toEqual(['partner-a-caller', fx.TEAMMATE_A].sort());
  });
});

describe('employer reads and writes use the caller employer only', () => {
  it("GET /api/employer/applications keeps job.employerId from ctx when the query names employer B's job", async () => {
    signInAs('employer-a-caller');
    const res = await call(
      employerApplicationsGET as Handler,
      'GET',
      '/api/employer/applications?jobId=job-b&employerId=employer-b',
    );
    expect(res.status).toBe(200);
    expect(db.jobPostingApplication!.findMany).toHaveBeenCalledTimes(1);
    const [args] = db.jobPostingApplication!.findMany!.mock.calls[0]!;
    expect((args as { where: { job: unknown } }).where.job).toEqual({ employerId: 'employer-a' });
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/employer/applications control: own applications only', async () => {
    signInAs('employer-a-caller');
    const res = await call(employerApplicationsGET as Handler, 'GET', '/api/employer/applications');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['app-a']);
  });

  it('GET /api/employer/hiring-intents filters on ctx employerId and ignores a query employerId', async () => {
    signInAs('employer-a-caller');
    const res = await call(hiringIntentsGET as Handler, 'GET', '/api/employer/hiring-intents?employerId=employer-b');
    expect(res.status).toBe(200);
    for (const [args] of db.employerHiringIntent!.findMany!.mock.calls) {
      expect((args as { where: unknown }).where).toEqual({ employerId: 'employer-a' });
    }
    const body = (await res.json()) as { intents: Array<{ id: string }> };
    expect(body.intents.map((i) => i.id)).toEqual(['intent-a']);
  });

  it('POST /api/employer/hiring-intents writes ctx employerId even when the body names employer B', async () => {
    signInAs('employer-a-caller');
    const res = await call(hiringIntentsPOST as Handler, 'POST', '/api/employer/hiring-intents', undefined, {
      programSlug: 'it-support',
      seatCount: 4,
      employerId: 'employer-b',
    });
    expect(res.status).toBe(200);
    expect(db.employerHiringIntent!.create).toHaveBeenCalledTimes(1);
    const [args] = db.employerHiringIntent!.create!.mock.calls[0]!;
    expect((args as { data: { employerId: string } }).data.employerId).toBe('employer-a');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'employer-a' }));
  });
});
