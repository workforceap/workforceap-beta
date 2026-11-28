import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/admin/members/create provisions an Auth identity and a member
 * row. Auth, actor-org stamping, and partner/subgroup FK checks must run
 * before invite/create: a dropped organizationId would enroll the member
 * in another tenant, and an unscoped partnerId would attach Org B's
 * referral graph to Org A.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  inviteUserByEmail: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  partnerFindFirst: vi.fn(),
  subgroupFindFirst: vi.fn(),
  userCreate: vi.fn(),
  profileCreate: vi.fn(),
  partnerReferralCreate: vi.fn(),
  memberSubgroupCreate: vi.fn(),
  memberSubgroupFindUnique: vi.fn(),
  upsertEnrollment: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  maybeSendCourseKickoffEmail: vi.fn(),
  sendPartnerMilestoneEmail: vi.fn(),
  trackEvent: vi.fn(),
  auditLog: vi.fn(),
  after: vi.fn((callback: () => unknown) => {
    void Promise.resolve(callback()).catch(() => undefined);
  }),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
  after: mocks.after,
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mocks.inviteUserByEmail,
        createUser: mocks.createUser,
        deleteUser: mocks.deleteUser,
      },
    },
  }),
}));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    partner: { findFirst: mocks.partnerFindFirst },
    subgroup: { findFirst: mocks.subgroupFindFirst },
    user: { create: mocks.userCreate },
    profile: { create: mocks.profileCreate },
    partnerReferral: { create: mocks.partnerReferralCreate },
    memberSubgroup: {
      create: mocks.memberSubgroupCreate,
      findUnique: mocks.memberSubgroupFindUnique,
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({
  upsertEquivalentCourseEnrollment: mocks.upsertEnrollment,
}));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: mocks.sendPasswordResetEmail }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: mocks.maybeSendCourseKickoffEmail }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: mocks.sendPartnerMilestoneEmail }));
vi.mock('@/lib/events/track', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));

import { POST } from '@/app/api/admin/members/create/route';
import { provisionIntentAppMetadata } from '@/lib/auth/provisionIntent';
import { PROGRAMS } from '@/lib/content/programs';

const ORG = 'org-a';
const SLUG = PROGRAMS.find((program) => !program.curriculumMigrationPending)?.slug;
const PAUSED_SLUG = PROGRAMS.find((program) => program.curriculumMigrationPending)?.slug;
if (!SLUG) throw new Error('expected an assignable program in the catalog');
const PARTNER = '00000000-0000-4000-8000-0000000000aa';
const SUBGROUP = '00000000-0000-4000-8000-0000000000bb';
const AUTH_ID = 'auth-member-1';

function body(over: Record<string, unknown> = {}) {
  return {
    firstName: 'Pat',
    lastName: 'Jones',
    email: 'Pat@Example.TEST',
    usCitizen: true,
    authorizedToWork: true,
    programSlug: SLUG,
    ...over,
  };
}

function req(payload: unknown = body()) {
  return new Request('http://localhost/api/admin/members/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.after.mockImplementation((callback: () => unknown) => {
    void Promise.resolve(callback()).catch(() => undefined);
  });
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.inviteUserByEmail.mockResolvedValue({
    data: { user: { id: AUTH_ID, email: 'pat@example.test' } },
    error: null,
  });
  mocks.createUser.mockResolvedValue({
    data: { user: { id: AUTH_ID, email: 'pat@example.test' } },
    error: null,
  });
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
  mocks.partnerFindFirst.mockResolvedValue({ id: PARTNER, organizationId: ORG, active: true });
  mocks.subgroupFindFirst.mockResolvedValue({ id: SUBGROUP });
  mocks.userCreate.mockResolvedValue({ id: AUTH_ID });
  mocks.profileCreate.mockResolvedValue({ userId: AUTH_ID });
  mocks.upsertEnrollment.mockResolvedValue({ id: 'enroll-1' });
  mocks.partnerReferralCreate.mockResolvedValue({ id: 'ref-1' });
  mocks.memberSubgroupCreate.mockResolvedValue({ id: 'ms-1' });
  mocks.memberSubgroupFindUnique.mockResolvedValue(null);
  mocks.sendPasswordResetEmail.mockResolvedValue({ error: null });
  mocks.maybeSendCourseKickoffEmail.mockResolvedValue(undefined);
  mocks.sendPartnerMilestoneEmail.mockResolvedValue(undefined);
  mocks.trackEvent.mockResolvedValue(undefined);
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('POST /api/admin/members/create', () => {
  it('returns 401 before inviting when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before inviting when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for missing name/email without contacting Auth', async () => {
    const res = await POST(req(body({ firstName: '', email: '' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'First name and email are required' });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when citizenship or work authorization is not yes', async () => {
    const res = await POST(req(body({ usCitizen: false, authorizedToWork: true })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'US Citizen and Authorized to Work must be Yes' });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown program without inviting', async () => {
    const res = await POST(req(body({ programSlug: 'not-a-real-program' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid program' });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('returns 409 for a paused curriculum without inviting', async () => {
    expect(PAUSED_SLUG).toBeTruthy();
    const res = await POST(req(body({ programSlug: PAUSED_SLUG })));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CURRICULUM_MIGRATION_PENDING' });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when the partner is missing or outside the actor org, without inviting', async () => {
    mocks.partnerFindFirst.mockResolvedValue(null);
    const res = await POST(req(body({ partnerId: PARTNER })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid or inactive partner' });
    expect(mocks.partnerFindFirst).toHaveBeenCalledWith({
      where: { id: PARTNER, active: true, organizationId: ORG },
    });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when the subgroup leader is outside the actor org, without inviting', async () => {
    mocks.subgroupFindFirst.mockResolvedValue(null);
    const res = await POST(req(body({ subgroupId: SUBGROUP })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid subgroup' });
    expect(mocks.subgroupFindFirst).toHaveBeenCalledWith({
      where: { id: SUBGROUP, leader: { organizationId: ORG } },
    });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when Auth reports the email already exists, without writing a user row', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered', code: 'user_already_exists' },
    });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'An account with this email already exists.' });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('stamps the actor organization on the user, enrollment, and profile', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      userId: AUTH_ID,
      email: 'pat@example.test',
      welcomeEmailSent: true,
    });
    expect(mocks.inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: AUTH_ID,
        organizationId: ORG,
        email: 'pat@example.test',
        fullName: 'Pat Jones',
        enrolledProgram: SLUG,
      }),
    });
    expect(mocks.upsertEnrollment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: AUTH_ID,
        programSlug: SLUG,
        create: expect.objectContaining({
          organizationId: ORG,
          isPrimary: true,
          enrolledByAdminId: 'admin-a',
        }),
      }),
    );
    expect(mocks.profileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: AUTH_ID, role: 'member' }),
    });
  });

  it('falls back to createUser with tenant provision intent when invite is unsupported', async () => {
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invite not enabled' },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'pat@example.test',
      email_confirm: true,
      app_metadata: provisionIntentAppMetadata({
        role: 'member',
        organizationId: ORG,
        source: 'admin_member_create',
      }),
    }));
    expect(mocks.userCreate.mock.calls[0][0].data.organizationId).toBe(ORG);
  });

  it('deletes the Auth user when the member row write throws', async () => {
    mocks.userCreate.mockRejectedValue(new Error('db down'));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create member. Please try again.' });
    expect(mocks.deleteUser).toHaveBeenCalledWith(AUTH_ID);
    expect(mocks.upsertEnrollment).not.toHaveBeenCalled();
  });
});
