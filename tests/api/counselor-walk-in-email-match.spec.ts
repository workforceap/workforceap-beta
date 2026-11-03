// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  counselor: vi.fn(),
  admin: vi.fn(),
  superAdmin: vi.fn(),
  org: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  profileCreate: vi.fn(),
  counselorFind: vi.fn(),
  assignmentCreate: vi.fn(),
  invite: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  findAuthByEmail: vi.fn(),
  stamp: vi.fn(),
  track: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({
  isCounselor: mocks.counselor,
  isAdmin: mocks.admin,
  isSuperAdmin: mocks.superAdmin,
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: (fn: () => unknown) => fn(),
  withTenantScope: async (_org: string, fn: (db: { user: { create: typeof mocks.create } }) => unknown) =>
    fn({ user: { create: mocks.create } }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findMany: mocks.findMany, update: mocks.update },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      profile: { create: mocks.profileCreate },
      counselor: { findUnique: mocks.counselorFind },
      counselorAssignment: { create: mocks.assignmentCreate },
    }),
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
vi.mock('@/lib/auth/supabaseAdminUsers', () => ({ findSupabaseAuthUserByEmail: mocks.findAuthByEmail }));
vi.mock('@/lib/auth/provisionIntent', () => ({ stampCreatedAuthUserProvisionIntent: mocks.stamp }));
vi.mock('@/lib/events/track', () => ({ trackEvent: mocks.track }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.event }));

import { POST } from '@/app/api/counselor/sessions/walk-in/route';

const MIXED_CASE_EMAIL = 'Member@School.org';
const NORMALIZED_EMAIL = 'member@school.org';
const EXISTING_AUTH_ID = 'existing-auth-id';

function request(email = MIXED_CASE_EMAIL) {
  return new Request('http://localhost/api/counselor/sessions/walk-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'Pat', lastName: 'Walker', email }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: 'counselor-a' });
  mocks.counselor.mockResolvedValue(true);
  mocks.admin.mockResolvedValue(false);
  mocks.superAdmin.mockResolvedValue(false);
  mocks.org.mockResolvedValue('org-a');
  mocks.findMany.mockResolvedValue([]);
  mocks.update.mockResolvedValue({});
  mocks.create.mockResolvedValue({ id: 'walk-in-new' });
  mocks.profileCreate.mockResolvedValue({});
  mocks.counselorFind.mockResolvedValue({ id: 'counselor-row-a' });
  mocks.assignmentCreate.mockResolvedValue({});
  mocks.invite.mockResolvedValue({ data: { user: { id: 'walk-in-new', email: NORMALIZED_EMAIL } }, error: null });
  mocks.findAuthByEmail.mockResolvedValue({ id: EXISTING_AUTH_ID, email: MIXED_CASE_EMAIL });
  mocks.deleteUser.mockResolvedValue({});
  mocks.stamp.mockResolvedValue(undefined);
  mocks.track.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  mocks.event.mockResolvedValue(undefined);
});

describe('walk-in email identity matching', () => {
  it('does not delete auth when an active member is stored with different casing', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: EXISTING_AUTH_ID, email: MIXED_CASE_EMAIL, deletedAt: null },
    ]);
    mocks.invite.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered', code: 'user_already_exists' },
    });

    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A member with this email already exists.',
      existingMemberId: EXISTING_AUTH_ID,
    });
    expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { email: { equals: NORMALIZED_EMAIL, mode: 'insensitive' } },
      select: { id: true, email: true, deletedAt: true },
      take: 25,
    });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.findAuthByEmail).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('prefers an active mixed-case row over a deleted ILIKE candidate', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'deleted-same-mailbox', email: 'MEMBER@school.org', deletedAt: new Date('2026-01-01') },
      { id: EXISTING_AUTH_ID, email: MIXED_CASE_EMAIL, deletedAt: null },
    ]);

    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ existingMemberId: EXISTING_AUTH_ID });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('does not treat an ILIKE wildcard collision as the same member', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'other-person', email: 'mrjohnson@school.org', deletedAt: null },
    ]);

    const response = await POST(request('m_johnson@school.org'));
    expect(response.status).toBe(200);
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith(
      'm_johnson@school.org',
      expect.objectContaining({ data: expect.objectContaining({ walked_in_by: 'counselor-a' }) }),
    );
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'm_johnson@school.org', organizationId: 'org-a' }),
    });
  });

  it('frees a deleted mixed-case row and may clear the leftover auth user', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'deleted-member', email: MIXED_CASE_EMAIL, deletedAt: new Date('2026-01-01') },
    ]);
    mocks.invite
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'already registered', code: 'user_already_exists' },
      })
      .mockResolvedValueOnce({ data: { user: { id: 'walk-in-new', email: NORMALIZED_EMAIL } }, error: null });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'deleted-member' },
      data: { email: expect.stringMatching(/^deleted_deleted-member_\d+_member@school\.org@deleted\.invalid$/) },
    });
    expect(mocks.findAuthByEmail).toHaveBeenCalledExactlyOnceWith(expect.anything(), NORMALIZED_EMAIL);
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith(EXISTING_AUTH_ID);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'walk-in-new', email: NORMALIZED_EMAIL }),
    });
  });
});
