/**
 * WAP-199: `GET /api/portal/nav-badges?role=…` takes the role from the query
 * string, so any signed-in account can ask for any portal's badge set. Each
 * staff set must be gated on the caller actually holding that role:
 *
 * - `?role=admin`: an admin of the caller's own org, or a super-admin (the
 *   check the Applications badge added in WAP-190). Before this fix a member
 *   read `milestones_awaiting_approval`, the org's agent-inbox queue size.
 * - `?role=employer` / `partner` / `counselor`: the caller's own employer,
 *   partner or counselor record (super-admin impersonation aside).
 *
 * Everyone else gets `200 {}`, the route's existing answer for a portal the
 * caller has no context in. The real route, the real badge loader and the
 * real role helpers run; Prisma and the count helpers are mocked at their
 * boundary so the test can see which counts were queried.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Account = {
  organizationId: string;
  deletedAt: Date | null;
  profile: { role: string } | null;
  userRoles: { role: { name: string } }[];
};

const accounts = vi.hoisted(() => new Map<string, Account>());
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  application: { count: vi.fn() },
  employer: { findUnique: vi.fn(), findFirst: vi.fn() },
  partner: { findFirst: vi.fn() },
  partnerUser: { findUnique: vi.fn(), findMany: vi.fn() },
  counselor: { findFirst: vi.fn() },
  counselorAssignment: { findMany: vi.fn() },
  notification: { count: vi.fn() },
  job: { count: vi.fn() },
  jobPostingApplication: { count: vi.fn() },
  messageThread: { findUnique: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn() },
  partnerReferral: { findMany: vi.fn() },
  memberEvent: { count: vi.fn() },
}));
const counts = vi.hoisted(() => ({
  countAwaitingApprovalCascades: vi.fn(),
  resolveCascadeScope: vi.fn(),
  countThreadsWithSlaBreach: vi.fn(),
  countUnansweredMemberThreads: vi.fn(),
  getSlaStatusForThreads: vi.fn(),
  countEmployerQueueBadges: vi.fn(),
  countPartnerAttention: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })), headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: counts.getUser }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db), ...db },
}));
vi.mock('@/lib/milestoneCascade/queries', () => ({
  countAwaitingApprovalCascades: counts.countAwaitingApprovalCascades,
  resolveCascadeScope: counts.resolveCascadeScope,
}));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  countThreadsWithSlaBreach: counts.countThreadsWithSlaBreach,
  countUnansweredMemberThreads: counts.countUnansweredMemberThreads,
  getSlaStatusForThreads: counts.getSlaStatusForThreads,
}));
vi.mock('@/lib/employer/workQueue', () => ({ countEmployerQueueBadges: counts.countEmployerQueueBadges }));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: counts.countPartnerAttention }));

import { GET } from '@/app/api/portal/nav-badges/route';
import { NextRequest } from 'next/server';

function account(id: string, role: string, organizationId = 'org-1') {
  accounts.set(id, {
    organizationId,
    deletedAt: null,
    profile: { role },
    userRoles: [{ role: { name: role } }],
  });
}

async function badges(userId: string, role: string) {
  counts.getUser.mockResolvedValue({ id: userId });
  const response = await GET(new NextRequest(`http://localhost/api/portal/nav-badges?role=${role}`) as never);
  return { status: response.status, body: await response.json() };
}

/** Every count a staff badge set can run. None may run for a caller without that role. */
function staffCountsQueried() {
  return [
    counts.countAwaitingApprovalCascades,
    counts.resolveCascadeScope,
    counts.countThreadsWithSlaBreach,
    counts.countUnansweredMemberThreads,
    counts.getSlaStatusForThreads,
    counts.countEmployerQueueBadges,
    counts.countPartnerAttention,
    db.application.count,
    db.job.count,
    db.counselorAssignment.findMany,
    db.notification.count,
    db.partnerReferral.findMany,
    db.partnerUser.findMany,
    db.memberEvent.count,
    db.message.count,
  ].filter((fn) => fn.mock.calls.length > 0).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  accounts.clear();
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => accounts.get(where.id) ?? null);
  db.employer.findUnique.mockResolvedValue(null);
  db.employer.findFirst.mockResolvedValue(null);
  db.partner.findFirst.mockResolvedValue(null);
  db.partnerUser.findUnique.mockResolvedValue(null);
  db.counselor.findFirst.mockResolvedValue(null);
  db.application.count.mockResolvedValue(53);
  db.jobPostingApplication.count.mockResolvedValue(1);
  db.messageThread.findUnique.mockResolvedValue(null);
  counts.resolveCascadeScope.mockImplementation(async (userId: string) =>
    accounts.get(userId)?.profile?.role === 'super_admin'
      ? { kind: 'all' }
      : { kind: 'org', organizationId: accounts.get(userId)?.organizationId },
  );
  counts.countAwaitingApprovalCascades.mockResolvedValue(4);
  counts.countThreadsWithSlaBreach.mockResolvedValue(2);
  counts.countUnansweredMemberThreads.mockResolvedValue(5);
});

describe('nav badges: ?role=admin', () => {
  it('a member asking for the admin set gets no admin counts, and none are queried', async () => {
    account('member-a', 'member');
    const { status, body } = await badges('member-a', 'admin');
    expect(status).toBe(200);
    expect(body).toEqual({});
    expect(staffCountsQueried()).toBe(0);
  });

  it('a counselor, employer, partner or case manager asking for the admin set gets none either', async () => {
    for (const role of ['counselor', 'employer', 'partner', 'case_manager']) {
      vi.clearAllMocks();
      account(`${role}-a`, role);
      const { status, body } = await badges(`${role}-a`, 'admin');
      expect(status, role).toBe(200);
      expect(body, role).toEqual({});
      expect(staffCountsQueried(), role).toBe(0);
    }
  });

  it('an org admin still gets the agent-inbox and Applications counts for their org', async () => {
    account('admin-a', 'admin');
    const { status, body } = await badges('admin-a', 'admin');
    expect(status).toBe(200);
    expect(body).toEqual({ milestones_awaiting_approval: 4, admin_applications_pending: 53 });
    expect(counts.countAwaitingApprovalCascades).toHaveBeenCalledWith({
      scope: { kind: 'org', organizationId: 'org-1' },
    });
    expect(db.application.count.mock.calls[0][0].where.user.organizationId).toBe('org-1');
  });

  it('a super-admin still gets the platform message badges as well', async () => {
    account('super-a', 'super_admin', 'org-2');
    const { body } = await badges('super-a', 'admin');
    expect(body).toEqual({
      counselor_sla_breach_48h: 2,
      member_messages_unanswered: 5,
      milestones_awaiting_approval: 4,
      admin_applications_pending: 53,
    });
    expect(counts.countAwaitingApprovalCascades).toHaveBeenCalledWith({ scope: { kind: 'all' } });
    expect(db.application.count.mock.calls[0][0].where.user.organizationId).toBe('org-2');
  });
});

describe('nav badges: the other staff sets', () => {
  it.each(['employer', 'partner', 'counselor'])(
    'a member asking for ?role=%s gets an empty set and no counts are queried',
    async (role) => {
      account(`member-${role}`, 'member');
      const { status, body } = await badges(`member-${role}`, role);
      expect(status).toBe(200);
      expect(body).toEqual({});
      expect(staffCountsQueried()).toBe(0);
    },
  );

  it('the caller is looked up by their own id, never by anything in the request', async () => {
    account('member-lookup', 'member');
    await badges('member-lookup', 'employer');
    await badges('member-lookup', 'partner');
    await badges('member-lookup', 'counselor');
    expect(db.employer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-lookup' } }));
    expect(db.partnerUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-lookup' } }));
    expect(db.counselor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'member-lookup', active: true } }),
    );
  });

  it('a member asking for their own set still gets their own counts', async () => {
    account('member-own', 'member');
    const { status, body } = await badges('member-own', 'member');
    expect(status).toBe(200);
    expect(body).toEqual({ applications_new: 1, counselor_messages_unread: 0 });
    expect(staffCountsQueried()).toBe(0);
  });
});
