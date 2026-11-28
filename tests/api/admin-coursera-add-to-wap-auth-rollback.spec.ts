// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  org: vi.fn(),
  listAllUsers: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  invite: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({
  isAdminInOrg: mocks.isAdminInOrg,
  isSuperAdmin: mocks.isSuperAdmin,
}));
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
vi.mock('@/lib/coursera/b4bClient', () => ({
  listAllUsers: mocks.listAllUsers,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/coursera/csvImport.server', () => ({
  lockCourseraIdentityForAttachment: vi.fn(),
  promoteCsvProgressToCanonical: vi.fn(),
}));
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({
  mapCourseraIdentityAndProgressInTransaction: vi.fn(),
}));
vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({
  upsertEquivalentCourseEnrollment: vi.fn(),
}));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: () => null,
  isCurriculumMigrationPending: () => false,
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'pending',
}));

import { POST } from '@/app/api/admin/coursera/reconcile/add-to-wap/route';

const AUTH_ID = 'auth-existing';
const EMAIL = 'learner@school.org';

function request(email = EMAIL) {
  return new Request('http://localhost/api/admin/coursera/reconcile/add-to-wap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      fullName: 'Ada Lovelace',
      courseraExternalId: 'ext-1',
      programId: 'program-1',
    }),
  });
}

describe('POST /api/admin/coursera/reconcile/add-to-wap auth rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-a' });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.isAdminInOrg.mockResolvedValue(true);
    mocks.org.mockResolvedValue('org-a');
    mocks.listAllUsers.mockResolvedValue({
      elements: [{ email: EMAIL, externalId: 'ext-1', fullName: 'Ada Lovelace' }],
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(null);
    mocks.invite.mockResolvedValue({ data: { user: { id: AUTH_ID, email: EMAIL } }, error: null });
    mocks.deleteUser.mockResolvedValue({});
    mocks.rollback.mockResolvedValue(false);
  });

  it('refuses an existing mixed-case app user before inviting', async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: AUTH_ID, email: 'Learner@School.org' }]);
    const response = await POST(request() as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'A WorkforceAP account with this email already exists. Use the existing account or contact support.',
    });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.rollback).not.toHaveBeenCalled();
  });

  it('does not delete Auth when invite returns an existing app user', async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: AUTH_ID });
    const response = await POST(request() as never);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.rollback).not.toHaveBeenCalled();
  });

  it('rolls back Auth through the orphan guard when the app write fails', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('Unique constraint failed'));
    const response = await POST(request() as never);
    expect(response.status).toBe(500);
    expect(mocks.rollback).toHaveBeenCalledWith(expect.anything(), AUTH_ID);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
