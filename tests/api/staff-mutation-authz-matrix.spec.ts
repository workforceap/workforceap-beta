// @vitest-environment node
/**
 * S01 negative-authorization matrix for staff write routes (the write-side
 * sibling of export-download-authz-matrix.spec.ts, #2552).
 *
 * Each route below is imported as the real handler. Only the identity edge
 * (getUser), the role helpers, Prisma, withTenantScope, audit, email, the
 * workspace-email provider, the rate limiter and the Supabase admin client
 * are replaced. The Prisma and tenant-scope fakes answer from one fixture
 * table and honour the `where` (or the scope org) they are given, so a
 * cross-org 404 comes from the route's own org filter: drop the filter and
 * the other org's row is found and written. Every route also has an
 * allowed-caller control, so a denial cannot pass just because the mocks
 * broke the handler.
 *
 * Routes and the denial each one pins (admin routes deny member, counselor,
 * employer and partner callers; walk-in denies member, employer and partner):
 *  - POST   /api/admin/members/[id]/placed-outcome: 401, 403, 404 for another
 *    org's member with no PlacementRecord upsert, audit or partner email.
 *  - POST/DELETE /api/admin/members/[id]/subgroup: 401, 403, 404 for another
 *    org's member and for another org's subgroup, with no MemberSubgroup write.
 *  - PATCH  /api/admin/members/[id]/consent: 401, 403, 404 for another org's
 *    member with no Profile upsert; every scoped call uses the actor org.
 *  - POST/DELETE /api/admin/members/[id]/workspace-email: 401, 403, 404 for
 *    another org's member with no provider call and no User update.
 *  - PATCH  /api/admin/members/[id]/pipeline-stage: 401, 403, 404 for another
 *    org's member with no updateMany; every scoped call uses the actor org.
 *  - PATCH  /api/admin/members/[id]/interview: 401, 403, 404 for another
 *    org's member with no User update.
 *  - GET/PATCH /api/admin/members/[id]/readiness: 401, 403, 404 for another
 *    org's member with no checklist read or upsert.
 *  - POST   /api/admin/members/[id]/skill-checkpoints: 401, 403, 404 for
 *    another org's member with no mission result recorded.
 *  - POST   /api/admin/invites/[id]/resend: 401, 403, 404 for an invitation
 *    sent from another org, with no token rotation and no email.
 *  - PATCH  /api/admin/invites/[id]/revoke: 401, 403, 404 for an invitation
 *    sent from another org, with no status write.
 *  - POST   /api/admin/partners/[id]/reactivate: 401, 403, 404 for another
 *    org's partner with no update; every scoped call uses the actor org.
 *  - PATCH  /api/admin/employers/[id]/tier: 401, 403, 404 for another org's
 *    employer with no update; every scoped call uses the actor org.
 *  - POST   /api/counselor/sessions/walk-in: 401, 403 with no auth invite
 *    and no User create; the new member is created under withTenantScope
 *    with the actor's org and stamped with that org.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Role = 'member' | 'counselor' | 'employer' | 'partner' | 'admin' | 'super_admin';

const fx = vi.hoisted(() => {
  const identities: Record<string, { role: Role; orgId: string; fullName: string }> = {
    'admin-a': { role: 'admin', orgId: 'org-a', fullName: 'Admin A' },
    'admin-b': { role: 'admin', orgId: 'org-b', fullName: 'Admin B' },
    'member-caller': { role: 'member', orgId: 'org-a', fullName: 'Member Caller' },
    'counselor-a': { role: 'counselor', orgId: 'org-a', fullName: 'Counselor A' },
    'employer-a': { role: 'employer', orgId: 'org-a', fullName: 'Employer A' },
    'partner-a': { role: 'partner', orgId: 'org-a', fullName: 'Partner A' },
  };
  // Subject members, keyed by id. The skill-mission program is filled in at
  // test time from the real catalog.
  const members: Record<string, { orgId: string; enrolledProgram: string | null }> = {
    'member-a': { orgId: 'org-a', enrolledProgram: null },
    'member-b': { orgId: 'org-b', enrolledProgram: null },
  };
  const subgroups: Record<string, { orgId: string }> = {
    '11111111-1111-4111-8111-111111111111': { orgId: 'org-a' },
    '22222222-2222-4222-8222-222222222222': { orgId: 'org-b' },
  };
  const invitations: Record<string, { orgId: string }> = {
    'inv-a': { orgId: 'org-a' },
    'inv-b': { orgId: 'org-b' },
  };
  const partners: Record<string, { orgId: string }> = { 'partner-org-a': { orgId: 'org-a' }, 'partner-org-b': { orgId: 'org-b' } };
  const employers: Record<string, { orgId: string }> = { 'employer-org-a': { orgId: 'org-a' }, 'employer-org-b': { orgId: 'org-b' } };
  return { identities, members, subgroups, invitations, partners, employers };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  // Outside a request scope the real `after` throws; run the callback instead.
  after: (fn: () => unknown) => void Promise.resolve().then(fn),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(), resolveAuthGucContext: vi.fn() }));

vi.mock('@/lib/auth/roles', async () => {
  const { hasAdminAccess, hasSuperAdminAccess } = await import('@/lib/auth/roleAccess');
  const roleOf = (userId: string) => fx.identities[userId]?.role ?? 'member';
  const isSuperAdmin = vi.fn(async (userId: string) => hasSuperAdminAccess(roleOf(userId), []));
  const isAdmin = vi.fn(async (userId: string) => hasAdminAccess(roleOf(userId), []));
  return {
    isSuperAdmin,
    isAdmin,
    // Mirrors lib/auth/roles.ts: requireAdmin throws for a non-admin, and
    // isCounselor is an active counselor row or a super admin.
    requireAdmin: vi.fn(async (userId: string) => {
      if (!(await isAdmin(userId))) throw new Error('Forbidden: admin access required');
    }),
    isCounselor: vi.fn(async (userId: string) => roleOf(userId) === 'counselor' || (await isSuperAdmin(userId))),
  };
});

vi.mock('@/lib/db/prisma', () => {
  type Where = Record<string, unknown> & { id?: string; organizationId?: string };
  const orgFilter = (where: Where | undefined, path: string[]): string | undefined => {
    let node: unknown = where;
    for (const key of path) node = (node as Record<string, unknown> | undefined)?.[key];
    return typeof node === 'string' ? node : undefined;
  };
  const memberRow = (id: string) => ({
    id,
    deletedAt: null,
    email: `${id}@example.test`,
    fullName: `Member ${id}`,
    workspaceEmail: null,
    workspaceEmailProvisioned: false,
    enrolledProgram: fx.members[id]?.enrolledProgram ?? null,
    courseEnrollments: [],
  });
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    user: {
      // getActorOrganizationId and the readiness actor-name lookup read the
      // caller's own row (a subject member's row answers too, so a route that
      // scoped by the target's org would find it); the walk-in duplicate
      // check looks up by email.
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email) return null;
        const identity = where.id ? fx.identities[where.id] : undefined;
        if (identity) return { organizationId: identity.orgId, fullName: identity.fullName };
        const member = where.id ? fx.members[where.id] : undefined;
        return member ? { organizationId: member.orgId, fullName: `Member ${where.id}` } : null;
      }),
      // Subject member lookups. An org filter that names another org hides
      // the row; a missing filter would find it.
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const member = where.id ? fx.members[where.id] : undefined;
        if (!member) return null;
        if (where.organizationId !== undefined && where.organizationId !== member.orgId) return null;
        return memberRow(where.id!);
      }),
      update: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    placementRecord: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'placement-1',
        ...create,
        placedAt: create.placedAt as Date,
      })),
    },
    subgroup: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const subgroup = where.id ? fx.subgroups[where.id] : undefined;
        if (!subgroup) return null;
        const org = orgFilter(where, ['leader', 'organizationId']);
        if (org !== undefined && org !== subgroup.orgId) return null;
        return { id: where.id };
      }),
    },
    memberSubgroup: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'ms-1' })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    readinessChecklist: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({ id: 'rc-1' })),
    },
    invitation: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const invitation = where.id ? fx.invitations[where.id] : undefined;
        if (!invitation) return null;
        const org = orgFilter(where, ['invitedBy', 'organizationId']);
        if (org !== undefined && org !== invitation.orgId) return null;
        return {
          id: where.id,
          status: 'pending',
          email: 'invitee@example.test',
          role: 'counselor',
          token: 'old-token',
          personalMessage: null,
          expiresAt: new Date(Date.now() + 86_400_000),
          invitedBy: { fullName: 'Inviter' },
        };
      }),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    profile: { create: vi.fn(async () => ({})) },
    counselor: { findUnique: vi.fn(async () => ({ id: 'counselor-row-a' })) },
    counselorAssignment: { create: vi.fn(async () => ({})) },
  };
  return { prisma };
});

vi.mock('@/lib/tenant/withTenantScope', () => {
  // Each scoped method receives the args and the org the scope was opened
  // for, and only sees rows of that org.
  const inOrg = (rows: Record<string, { orgId: string }>) =>
    vi.fn(async ({ where }: { where: { id: string } }, orgId: string) =>
      rows[where.id]?.orgId === orgId ? { id: where.id } : null,
    );
  const scoped = {
    user: {
      findFirst: inOrg(fx.members),
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async ({ data }: { data: { id: string } }) => ({ id: data.id })),
    },
    profile: { upsert: vi.fn(async () => ({})) },
    partner: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }, orgId: string) =>
        fx.partners[where.id]?.orgId === orgId ? { id: where.id, active: false } : null,
      ),
      update: vi.fn(async () => ({})),
    },
    employer: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }, orgId: string) =>
        fx.employers[where.id]?.orgId === orgId ? { id: where.id, tier: 'basic' } : null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { tier: string } }) => ({
        id: where.id,
        tier: data.tier,
      })),
    },
  };
  const bind = (orgId: string) =>
    Object.fromEntries(
      Object.entries(scoped).map(([model, methods]) => [
        model,
        Object.fromEntries(
          Object.entries(methods).map(([name, spy]) => [name, (args: unknown) => (spy as (a: unknown, o: string) => unknown)(args, orgId)]),
        ),
      ]),
    );
  return {
    scoped,
    withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
      if (!orgId) throw new Error('[tenant-scope] orgId required');
      return fn(bind(orgId));
    }),
    crossTenantOK: vi.fn((fn: () => unknown) => fn()),
  };
});

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));
vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => undefined),
  persistEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendInvitationEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/rate-limit', () => ({ checkAdminInviteRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/workspace-email/provider', () => {
  const provider = {
    id: 'test-provider',
    provision: vi.fn(async () => ({ success: true, workspaceEmail: 'pat@work.example.test' })),
    revoke: vi.fn(async () => ({ success: true })),
  };
  return { provider, getWorkspaceEmailProvider: vi.fn(() => provider) };
});
vi.mock('@/lib/member/skillMissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/member/skillMissions')>()),
  recordMissionResult: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase-admin', () => {
  const admin = {
    inviteUserByEmail: vi.fn(async (email: string) => ({ data: { user: { id: 'walk-in-new', email } }, error: null })),
    createUser: vi.fn(),
    deleteUser: vi.fn(async () => ({})),
  };
  return { admin, getSupabaseAdmin: vi.fn(() => ({ auth: { admin } })) };
});
vi.mock('@/lib/auth/supabaseAdminUsers', () => ({ findSupabaseAuthUserByEmail: vi.fn(async () => null) }));

const { NextRequest } = await import('next/server');
const { POST: placedOutcomePOST } = await import('@/app/api/admin/members/[id]/placed-outcome/route');
const { POST: subgroupPOST, DELETE: subgroupDELETE } = await import('@/app/api/admin/members/[id]/subgroup/route');
const { PATCH: consentPATCH } = await import('@/app/api/admin/members/[id]/consent/route');
const { POST: workspaceEmailPOST, DELETE: workspaceEmailDELETE } = await import(
  '@/app/api/admin/members/[id]/workspace-email/route'
);
const { PATCH: pipelineStagePATCH } = await import('@/app/api/admin/members/[id]/pipeline-stage/route');
const { PATCH: interviewPATCH } = await import('@/app/api/admin/members/[id]/interview/route');
const { GET: readinessGET, PATCH: readinessPATCH } = await import('@/app/api/admin/members/[id]/readiness/route');
const { POST: skillCheckpointsPOST } = await import('@/app/api/admin/members/[id]/skill-checkpoints/route');
const { POST: inviteResendPOST } = await import('@/app/api/admin/invites/[id]/resend/route');
const { PATCH: inviteRevokePATCH } = await import('@/app/api/admin/invites/[id]/revoke/route');
const { POST: partnerReactivatePOST } = await import('@/app/api/admin/partners/[id]/reactivate/route');
const { PATCH: employerTierPATCH } = await import('@/app/api/admin/employers/[id]/tier/route');
const { POST: walkInPOST } = await import('@/app/api/counselor/sessions/walk-in/route');

const { getUser } = await import('@/lib/auth/server');
const { prisma } = await import('@/lib/db/prisma');
const tenant = (await import('@/lib/tenant/withTenantScope')) as unknown as {
  withTenantScope: ReturnType<typeof vi.fn>;
  scoped: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
};
const { auditLog } = await import('@/lib/audit');
const { logAuditEvent } = await import('@/lib/audit/log');
const { sendPartnerMilestoneEmail } = await import('@/lib/notifications/partner-notify');
const { sendInvitationEmail } = await import('@/lib/email');
const { provider } = (await import('@/lib/workspace-email/provider')) as unknown as {
  provider: { provision: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
};
const { recordMissionResult } = await import('@/lib/member/skillMissions');
const { admin: supabaseAdmin } = (await import('@/lib/supabase-admin')) as unknown as {
  admin: { inviteUserByEmail: ReturnType<typeof vi.fn> };
};
const { resolveSkillMissionsForCurriculum, buildSkillMissionEventKey } = await import(
  '@/lib/member/skillMissionCurriculum'
);
const { LEGACY_CURRICULUM_VERSION } = await import('@/lib/content/programCurriculumManifest');

type Handler = (request: never, context: never) => Promise<Response>;

function signInAs(userId: string | null) {
  vi.mocked(getUser).mockResolvedValue(
    userId ? ({ id: userId, email: `${userId}@example.test`, user_metadata: {} } as never) : null,
  );
}

function call(handler: Handler, method: string, url: string, id: string | null, body?: unknown) {
  const request = new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const context = id === null ? undefined : { params: Promise.resolve({ id }) };
  return handler(request as never, context as never);
}

/** Every write, audit and email spy the matrix watches. */
function writeSpies(): Array<[string, ReturnType<typeof vi.fn>]> {
  const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  return [
    ['user.update', p.user.update],
    ['placementRecord.upsert', p.placementRecord.upsert],
    ['memberSubgroup.create', p.memberSubgroup.create],
    ['memberSubgroup.deleteMany', p.memberSubgroup.deleteMany],
    ['readinessChecklist.upsert', p.readinessChecklist.upsert],
    ['invitation.update', p.invitation.update],
    ['invitation.updateMany', p.invitation.updateMany],
    ['profile.create', p.profile.create],
    ['counselorAssignment.create', p.counselorAssignment.create],
    ['scoped user.updateMany', tenant.scoped.user.updateMany],
    ['scoped user.create', tenant.scoped.user.create],
    ['scoped profile.upsert', tenant.scoped.profile.upsert],
    ['scoped partner.update', tenant.scoped.partner.update],
    ['scoped employer.update', tenant.scoped.employer.update],
    ['auditLog', vi.mocked(auditLog)],
    ['logAuditEvent', vi.mocked(logAuditEvent)],
    ['sendPartnerMilestoneEmail', vi.mocked(sendPartnerMilestoneEmail)],
    ['sendInvitationEmail', vi.mocked(sendInvitationEmail)],
    ['workspace provider.provision', provider.provision],
    ['workspace provider.revoke', provider.revoke],
    ['recordMissionResult', vi.mocked(recordMissionResult)],
    ['supabase inviteUserByEmail', supabaseAdmin.inviteUserByEmail],
  ];
}

async function expectNoWrites() {
  // Let any `after()` callbacks the handler may have queued run first.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const called = writeSpies()
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
  expect(called).toEqual([]);
}

function expectScopesOnly(orgId: string) {
  expect(tenant.withTenantScope).toHaveBeenCalled();
  for (const [scopeOrg] of tenant.withTenantScope.mock.calls) expect(scopeOrg).toBe(orgId);
}

// A mission that exists for a real program on the legacy curriculum, so the
// skill-checkpoint control reaches recordMissionResult.
const missionProgram = 'digital-literacy-empowerment-class';
const [mission] = resolveSkillMissionsForCurriculum({
  programSlug: missionProgram,
  curriculumVersion: LEGACY_CURRICULUM_VERSION,
});
const missionKey = buildSkillMissionEventKey({
  programSlug: missionProgram,
  curriculumVersion: LEGACY_CURRICULUM_VERSION,
  missionCourseSlug: mission!.definition.courseSlug,
});
// Both members are on that program, so only the org gate tells them apart.
fx.members['member-a']!.enrolledProgram = missionProgram;
fx.members['member-b']!.enrolledProgram = missionProgram;

const SUBGROUP_A = '11111111-1111-4111-8111-111111111111';
const SUBGROUP_B = '22222222-2222-4222-8222-222222222222';

type Case = {
  name: string;
  handler: Handler;
  method: string;
  path: (id: string) => string;
  body?: unknown;
  ownTarget: string;
  foreignTarget: string;
  /** The allowed caller's successful status. */
  okStatus?: number;
  /** Proves the allowed call reached its write. */
  wrote: () => void;
  /** Routes that open withTenantScope must scope every call to the actor org. */
  scoped?: boolean;
};

const placementBody = { employerName: 'Example Co', jobTitle: 'Help Desk Analyst' };

const ADMIN_ROUTES: Case[] = [
  {
    name: 'POST /api/admin/members/[id]/placed-outcome',
    handler: placedOutcomePOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/members/${id}/placed-outcome`,
    body: placementBody,
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () =>
      expect(prisma.placementRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'member-a' } }),
      ),
  },
  {
    name: 'POST /api/admin/members/[id]/subgroup',
    handler: subgroupPOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/members/${id}/subgroup`,
    body: { subgroupId: SUBGROUP_A },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () => expect(prisma.memberSubgroup.create).toHaveBeenCalledTimes(1),
  },
  {
    name: 'DELETE /api/admin/members/[id]/subgroup',
    handler: subgroupDELETE as Handler,
    method: 'DELETE',
    path: (id) => `/api/admin/members/${id}/subgroup?subgroup=${SUBGROUP_A}`,
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () =>
      expect(prisma.memberSubgroup.deleteMany).toHaveBeenCalledWith({
        where: {
          memberId: 'member-a',
          subgroupId: SUBGROUP_A,
          member: { organizationId: 'org-a' },
          subgroup: { leader: { organizationId: 'org-a' } },
        },
      }),
  },
  {
    name: 'PATCH /api/admin/members/[id]/consent',
    handler: consentPATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/members/${id}/consent`,
    body: { parentalConsentGiven: true },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    scoped: true,
    wrote: () => expect(tenant.scoped.profile.upsert).toHaveBeenCalledTimes(1),
  },
  {
    name: 'POST /api/admin/members/[id]/workspace-email',
    handler: workspaceEmailPOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/members/${id}/workspace-email`,
    body: {},
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () => {
      expect(provider.provision).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-a' } }));
    },
  },
  {
    name: 'DELETE /api/admin/members/[id]/workspace-email',
    handler: workspaceEmailDELETE as Handler,
    method: 'DELETE',
    path: (id) => `/api/admin/members/${id}/workspace-email`,
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () => {
      expect(provider.revoke).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-a' } }));
    },
  },
  {
    name: 'PATCH /api/admin/members/[id]/pipeline-stage',
    handler: pipelineStagePATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/members/${id}/pipeline-stage`,
    body: { stage: 'placed' },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    scoped: true,
    wrote: () =>
      expect(tenant.scoped.user.updateMany).toHaveBeenCalledWith(
        { where: { id: 'member-a' }, data: { pipelineBoardStage: 'placed' } },
        'org-a',
      ),
  },
  {
    name: 'PATCH /api/admin/members/[id]/interview',
    handler: interviewPATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/members/${id}/interview`,
    body: { action: 'mark_interviewed' },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () => expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-a' } })),
  },
  {
    name: 'GET /api/admin/members/[id]/readiness',
    handler: readinessGET as Handler,
    method: 'GET',
    path: (id) => `/api/admin/members/${id}/readiness`,
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () =>
      expect(prisma.readinessChecklist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'member-a' } }),
      ),
  },
  {
    name: 'PATCH /api/admin/members/[id]/readiness',
    handler: readinessPATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/members/${id}/readiness`,
    body: { itemKey: 'resume_uploaded', completed: true },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () =>
      expect(prisma.readinessChecklist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_itemKey: { userId: 'member-a', itemKey: 'resume_uploaded' } } }),
      ),
  },
  {
    name: 'POST /api/admin/members/[id]/skill-checkpoints',
    handler: skillCheckpointsPOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/members/${id}/skill-checkpoints`,
    body: { checkpointKey: missionKey, decision: 'passed', programSlug: missionProgram },
    ownTarget: 'member-a',
    foreignTarget: 'member-b',
    wrote: () =>
      expect(recordMissionResult).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-a' })),
  },
  {
    name: 'POST /api/admin/invites/[id]/resend',
    handler: inviteResendPOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/invites/${id}/resend`,
    ownTarget: 'inv-a',
    foreignTarget: 'inv-b',
    wrote: () => {
      expect(prisma.invitation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-a' } }));
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    },
  },
  {
    name: 'PATCH /api/admin/invites/[id]/revoke',
    handler: inviteRevokePATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/invites/${id}/revoke`,
    ownTarget: 'inv-a',
    foreignTarget: 'inv-b',
    wrote: () =>
      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-a', invitedBy: { organizationId: 'org-a' } },
        data: { status: 'revoked' },
      }),
  },
  {
    name: 'POST /api/admin/partners/[id]/reactivate',
    handler: partnerReactivatePOST as Handler,
    method: 'POST',
    path: (id) => `/api/admin/partners/${id}/reactivate`,
    ownTarget: 'partner-org-a',
    foreignTarget: 'partner-org-b',
    scoped: true,
    wrote: () =>
      expect(tenant.scoped.partner.update).toHaveBeenCalledWith(
        { where: { id: 'partner-org-a' }, data: { active: true } },
        'org-a',
      ),
  },
  {
    name: 'PATCH /api/admin/employers/[id]/tier',
    handler: employerTierPATCH as Handler,
    method: 'PATCH',
    path: (id) => `/api/admin/employers/${id}/tier`,
    body: { tier: 'partner' },
    ownTarget: 'employer-org-a',
    foreignTarget: 'employer-org-b',
    scoped: true,
    wrote: () =>
      expect(tenant.scoped.employer.update).toHaveBeenCalledWith(
        { where: { id: 'employer-org-a' }, data: { tier: 'partner' } },
        'org-a',
      ),
  },
];

const NON_ADMIN_CALLERS = ['member-caller', 'counselor-a', 'employer-a', 'partner-a'] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(ADMIN_ROUTES)('$name', (route) => {
  const run = (id: string) => call(route.handler, route.method, route.path(id), id, route.body);

  it('returns 401 when signed out, with no write', async () => {
    signInAs(null);
    expect((await run(route.ownTarget)).status).toBe(401);
    expect(tenant.withTenantScope).not.toHaveBeenCalled();
    await expectNoWrites();
  });

  it.each(NON_ADMIN_CALLERS)('returns 403 for non-admin caller %s, with no write', async (userId) => {
    signInAs(userId);
    expect((await run(route.ownTarget)).status).toBe(403);
    expect(tenant.withTenantScope).not.toHaveBeenCalled();
    await expectNoWrites();
  });

  it("returns 404 for another org's target, with no write, audit or email", async () => {
    signInAs('admin-a');
    expect((await run(route.foreignTarget)).status).toBe(404);
    await expectNoWrites();
    if (route.scoped) expectScopesOnly('org-a');
  });

  it("control: a same-org admin reaches the write", async () => {
    signInAs('admin-a');
    const response = await run(route.ownTarget);
    expect(response.status).toBe(route.okStatus ?? 200);
    route.wrote();
    if (route.scoped) expectScopesOnly('org-a');
  });

  if (route.scoped) {
    it("scopes an org-b admin to org-b, which cannot see org-a's target", async () => {
      signInAs('admin-b');
      expect((await run(route.ownTarget)).status).toBe(404);
      expectScopesOnly('org-b');
      await expectNoWrites();
    });
  }
});

describe('subgroup routes: a same-org member with another org\'s subgroup', () => {
  it('POST returns 404 and adds no membership', async () => {
    signInAs('admin-a');
    const response = await call(subgroupPOST as Handler, 'POST', '/api/admin/members/member-a/subgroup', 'member-a', {
      subgroupId: SUBGROUP_B,
    });
    expect(response.status).toBe(404);
    expect(prisma.subgroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUBGROUP_B, leader: { organizationId: 'org-a' } } }),
    );
    await expectNoWrites();
  });

  it('DELETE returns 404 and removes no membership', async () => {
    signInAs('admin-a');
    const response = await call(
      subgroupDELETE as Handler,
      'DELETE',
      `/api/admin/members/member-a/subgroup?subgroup=${SUBGROUP_B}`,
      'member-a',
    );
    expect(response.status).toBe(404);
    await expectNoWrites();
  });
});

describe('POST /api/admin/invites/[id]/resend: tenant admin lookup', () => {
  it('filters the invitation by the actor org for a tenant admin', async () => {
    signInAs('admin-b');
    expect((await call(inviteResendPOST as Handler, 'POST', '/api/admin/invites/inv-a/resend', 'inv-a')).status).toBe(404);
    expect(prisma.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-a', invitedBy: { organizationId: 'org-b' } } }),
    );
    await expectNoWrites();
  });
});

describe('POST /api/counselor/sessions/walk-in', () => {
  const body = { firstName: 'Pat', lastName: 'Walker', email: 'pat.walker@example.test' };
  const run = () => call(walkInPOST as Handler, 'POST', '/api/counselor/sessions/walk-in', null, body);

  it('returns 401 when signed out, with no invite and no member created', async () => {
    signInAs(null);
    expect((await run()).status).toBe(401);
    expect(tenant.withTenantScope).not.toHaveBeenCalled();
    await expectNoWrites();
  });

  it.each(['member-caller', 'employer-a', 'partner-a'])(
    'returns 403 for non-staff caller %s, with no invite and no member created',
    async (userId) => {
      signInAs(userId);
      expect((await run()).status).toBe(403);
      expect(prisma.user.findUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { email: body.email } }));
      expect(tenant.withTenantScope).not.toHaveBeenCalled();
      await expectNoWrites();
    },
  );

  it.each([
    ['counselor-a', 'org-a'],
    ['admin-a', 'org-a'],
    ['admin-b', 'org-b'],
  ])('control: %s creates the member under withTenantScope(%s), stamped with that org', async (userId, orgId) => {
    signInAs(userId);
    const response = await run();
    expect(response.status).toBe(200);
    expectScopesOnly(orgId);
    expect(tenant.scoped.user.create).toHaveBeenCalledTimes(1);
    expect(tenant.scoped.user.create).toHaveBeenCalledWith(
      { data: expect.objectContaining({ id: 'walk-in-new', organizationId: orgId }) },
      orgId,
    );
  });

  it('assigns the calling counselor, and only a counselor, to the new member', async () => {
    signInAs('counselor-a');
    expect((await run()).status).toBe(200);
    expect(prisma.counselorAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ counselorId: 'counselor-row-a', memberId: 'walk-in-new' }),
    });

    vi.clearAllMocks();
    signInAs('admin-a');
    expect((await run()).status).toBe(200);
    expect(prisma.counselorAssignment.create).not.toHaveBeenCalled();
  });
});
