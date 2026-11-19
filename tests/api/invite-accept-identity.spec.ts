// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json' },
    }),
  },
  after: vi.fn(),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    invitation: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    profile: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    role: { findFirst: vi.fn() },
    userRole: { upsert: vi.fn() },
    subgroup: { findUnique: vi.fn() },
    partnerUser: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    counselor: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    memberSubgroup: { findFirst: vi.fn(), create: vi.fn() },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } };
});
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/provisionIntent', () => ({ stampCreatedAuthUserProvisionIntent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkInviteAcceptRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: vi.fn(() => '127.0.0.1') }));
vi.mock('@/lib/email', () => ({ sendInvitationAcceptedEmail: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({ tryResolveOrgFromRequest: vi.fn(async () => null) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ activeCurriculumVersion: vi.fn() }));
vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({ upsertEquivalentCourseEnrollment: vi.fn() }));

import { POST } from '@/app/api/invite/accept/route';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUser } from '@/lib/auth/server';

const email = 'invitee@example.test';
const token = 't'.repeat(40);
const appUserId = '550e8400-e29b-41d4-a716-446655440001';
const otherAuthId = '550e8400-e29b-41d4-a716-446655440002';

function inviteRequest(password = 'NewPassword123!') {
  return new Request('http://localhost:3000/api/invite/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, fullName: 'Invitee', password }),
  });
}

const authAdmin = {
  createUser: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
};

describe('public invitation acceptance identity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ auth: { admin: authAdmin } } as never);
    vi.mocked(getUser).mockResolvedValue(null);
    vi.mocked(prisma.invitation.findFirst).mockResolvedValue({
      id: 'inv-1', email, role: 'member', invitedById: 'inviter-1',
      subgroupId: null, partnerId: null, counselorAffiliation: null,
      programSlug: null, status: 'pending', expiresAt: new Date('2999-01-01'),
    } as never);
    vi.mocked(prisma.invitation.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: 'org-1' } as never);
    vi.mocked(prisma.profile.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.profile.create).mockResolvedValue({ id: 'profile-1' } as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: otherAuthId } as never);
    vi.mocked(prisma.role.findFirst).mockResolvedValue({ id: 'member-role' } as never);
    vi.mocked(prisma.subgroup.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.partnerUser.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.memberSubgroup.findFirst).mockResolvedValue(null);
  });

  it('does not reset a duplicate Auth identity or claim its invite on an anonymous retry', async () => {
    authAdmin.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists', message: 'already registered' } });

    const response = await POST(inviteRequest());

    expect(response.status).toBe(409);
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('does not claim an app User whose Auth ID has a different email', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: appUserId, email: 'someone-else@example.test' } }, error: null });

    const response = await POST(inviteRequest());

    expect(response.status).toBe(409);
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not claim an app User when its Auth identity is missing', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: null, error: { status: 404, code: 'user_not_found' } });

    const response = await POST(inviteRequest());

    expect(response.status).toBe(409);
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('lets the matching signed-in Auth identity resume an orphaned invite without changing its password', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: otherAuthId, email } as never);

    const response = await POST(inviteRequest(''));

    expect(response.status).toBe(200);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ acceptedById: otherAuthId }),
    }));
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('keeps a matching existing app and Auth identity eligible to accept', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: appUserId, email } }, error: null });

    const response = await POST(inviteRequest());

    expect(response.status).toBe(200);
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ acceptedById: appUserId }),
    }));
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('still accepts an invitation when Auth creation returns a new identity', async () => {
    authAdmin.createUser.mockResolvedValue({
      data: { user: { id: otherAuthId, email, app_metadata: {} } }, error: null,
    });

    const response = await POST(inviteRequest());

    expect(response.status).toBe(200);
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ acceptedById: otherAuthId }),
    }));
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('does not move an existing partner user onto another partner', async () => {
    const subgroupId = '550e8400-e29b-41d4-a716-446655440010';
    vi.mocked(prisma.invitation.findFirst).mockResolvedValue({
      id: 'inv-1', email, role: 'partner', invitedById: 'inviter-1',
      subgroupId, partnerId: null, counselorAffiliation: null,
      programSlug: null, status: 'pending', expiresAt: new Date('2999-01-01'),
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: appUserId, email } }, error: null });
    vi.mocked(prisma.subgroup.findUnique).mockResolvedValue({ partnerId: 'partner-b' } as never);
    vi.mocked(prisma.partnerUser.findFirst).mockResolvedValue({
      id: 'pu-1', partnerId: 'partner-a',
    } as never);

    const response = await POST(inviteRequest());
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe('ALREADY_AFFILIATED');
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.partnerUser.update).not.toHaveBeenCalled();
    expect(prisma.partnerUser.create).not.toHaveBeenCalled();
  });

  it('keeps a same-partner invite from rewriting the exclusive partner link', async () => {
    const subgroupId = '550e8400-e29b-41d4-a716-446655440010';
    vi.mocked(prisma.invitation.findFirst).mockResolvedValue({
      id: 'inv-1', email, role: 'partner', invitedById: 'inviter-1',
      subgroupId, partnerId: null, counselorAffiliation: null,
      programSlug: null, status: 'pending', expiresAt: new Date('2999-01-01'),
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: appUserId, email } }, error: null });
    vi.mocked(prisma.subgroup.findUnique).mockResolvedValue({ partnerId: 'partner-a' } as never);
    vi.mocked(prisma.partnerUser.findFirst).mockResolvedValue({
      id: 'pu-1', partnerId: 'partner-a',
    } as never);

    const response = await POST(inviteRequest());

    expect(response.status).toBe(200);
    expect(prisma.invitation.updateMany).toHaveBeenCalled();
    expect(prisma.partnerUser.update).not.toHaveBeenCalled();
    expect(prisma.partnerUser.create).not.toHaveBeenCalled();
  });

  it('does not move an existing counselor onto another partner', async () => {
    vi.mocked(prisma.invitation.findFirst).mockResolvedValue({
      id: 'inv-1', email, role: 'counselor', invitedById: 'inviter-1',
      subgroupId: null, partnerId: 'partner-b', counselorAffiliation: 'partner',
      programSlug: null, status: 'pending', expiresAt: new Date('2999-01-01'),
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: appUserId, fullName: 'Invitee', email, enrolledProgram: null,
    } as never);
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: appUserId, email } }, error: null });
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: 'c-1', partnerId: 'partner-a', active: true, affiliation: 'partner',
    } as never);

    const response = await POST(inviteRequest());
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe('ALREADY_AFFILIATED');
    expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.counselor.update).not.toHaveBeenCalled();
  });
});
