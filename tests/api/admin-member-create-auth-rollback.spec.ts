// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  org: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  invite: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
  after: (fn: () => unknown) => void fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: async <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findMany: mocks.findMany, findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mocks.invite,
        createUser: mocks.createUser,
        deleteUser: mocks.deleteUser,
      },
    },
  }),
}));
vi.mock('@/lib/admin/deleteOrphanAuthUser', () => ({
  deleteOrphanAuthUserAfterFailedProvision: mocks.rollback,
}));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: () => ({ slug: 'program-one', title: 'Program One' }),
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'pending',
}));
vi.mock('@/lib/content/programSlug', () => ({ canonicalizeProgramSlug: (value: string) => value }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ activeCurriculumVersion: () => 'v1' }));
vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({
  upsertEquivalentCourseEnrollment: vi.fn(),
}));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: vi.fn() }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({}),
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/referralSources', () => ({ ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES: [] }));

import { POST } from '@/app/api/admin/members/create/route';

const AUTH_ID = 'auth-existing';

function request(email = 'Ada@School.org') {
  return new Request('http://localhost/api/admin/members/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      usCitizen: true,
      authorizedToWork: true,
      programSlug: 'program-one',
    }),
  });
}

describe('POST /api/admin/members/create auth rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-a' });
    mocks.isAdmin.mockResolvedValue(true);
    mocks.org.mockResolvedValue('org-a');
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(null);
    mocks.invite.mockResolvedValue({ data: { user: { id: AUTH_ID, email: 'ada@school.org' } }, error: null });
    mocks.deleteUser.mockResolvedValue({});
    mocks.rollback.mockResolvedValue(false);
  });

  it('refuses an existing mixed-case app user before inviting', async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: AUTH_ID, email: 'Ada@School.org' }]);
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'An account with this email already exists.' });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.rollback).not.toHaveBeenCalled();
  });

  it('does not delete Auth when invite returns an existing app user', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: AUTH_ID });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'An account with this email already exists.' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.rollback).not.toHaveBeenCalled();
  });

  it('rolls back Auth through the orphan guard when the app write fails', async () => {
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'An account with this email already exists.' });
    expect(mocks.rollback).toHaveBeenCalledWith(expect.anything(), AUTH_ID);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
