// @vitest-environment node
/**
 * Counselors may review only members they are assigned to. Application ids
 * are resolved inside the actor's org so guessing another tenant's id cannot
 * leak that the row exists. Yesterday's coverage PR pins the WIOA status
 * matrix; this covers the assignment/tenant lookup those tests left mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findApplication: vi.fn(),
  staffAccess: vi.fn(),
  admin: vi.fn(),
  superAdmin: vi.fn(),
  counselor: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { application: { findFirst: mocks.findApplication } },
}));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: mocks.admin,
  isSuperAdmin: mocks.superAdmin,
  isCounselor: mocks.counselor,
}));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: mocks.staffAccess,
}));

import {
  canReviewActorActOnApplication,
  canReviewActorActOnMember,
  resolveReviewActor,
} from '@/lib/counselor/applicationReviewAccess';

const ORG = 'org-a';
const MEMBER = 'member-1';
const APPLICATION = 'app-1';
const counselor = { userId: 'counselor-1', role: 'counselor' as const };
const admin = { userId: 'admin-1', role: 'admin' as const };
const superAdmin = { userId: 'super-1', role: 'super_admin' as const };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findApplication.mockResolvedValue(null);
  mocks.staffAccess.mockResolvedValue(false);
  mocks.admin.mockResolvedValue(false);
  mocks.superAdmin.mockResolvedValue(false);
  mocks.counselor.mockResolvedValue(false);
});

describe('resolveReviewActor', () => {
  it('returns super_admin when both admin checks pass', async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.superAdmin.mockResolvedValue(true);
    expect(await resolveReviewActor('super-1')).toEqual({ userId: 'super-1', role: 'super_admin' });
    expect(mocks.counselor).not.toHaveBeenCalled();
  });

  it('returns admin without treating a counselor row as the actor', async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.superAdmin.mockResolvedValue(false);
    expect(await resolveReviewActor('admin-1')).toEqual({ userId: 'admin-1', role: 'admin' });
    expect(mocks.counselor).not.toHaveBeenCalled();
  });

  it('returns counselor only after admin checks fail', async () => {
    mocks.counselor.mockResolvedValue(true);
    expect(await resolveReviewActor('counselor-1')).toEqual({ userId: 'counselor-1', role: 'counselor' });
  });

  it('returns null for a member or other role', async () => {
    expect(await resolveReviewActor('member-1')).toBeNull();
  });
});

describe('canReviewActorActOnMember', () => {
  it('lets admin and super-admin act without an assignment lookup', async () => {
    expect(await canReviewActorActOnMember(admin, MEMBER)).toBe(true);
    expect(await canReviewActorActOnMember(superAdmin, MEMBER)).toBe(true);
    expect(mocks.staffAccess).not.toHaveBeenCalled();
  });

  it('delegates counselor access to the assigned-caseload gate', async () => {
    mocks.staffAccess.mockResolvedValueOnce(true);
    expect(await canReviewActorActOnMember(counselor, MEMBER)).toBe(true);
    expect(mocks.staffAccess).toHaveBeenCalledWith(counselor.userId, MEMBER);

    mocks.staffAccess.mockResolvedValueOnce(false);
    expect(await canReviewActorActOnMember(counselor, 'other-member')).toBe(false);
  });
});

describe('canReviewActorActOnApplication', () => {
  it('lets admin and super-admin act without resolving the application', async () => {
    expect(await canReviewActorActOnApplication(admin, APPLICATION, ORG)).toBe(true);
    expect(await canReviewActorActOnApplication(superAdmin, APPLICATION, ORG)).toBe(true);
    expect(mocks.findApplication).not.toHaveBeenCalled();
    expect(mocks.staffAccess).not.toHaveBeenCalled();
  });

  it('does not tell a counselor whether a foreign-tenant application id exists', async () => {
    mocks.findApplication.mockResolvedValue(null);
    expect(await canReviewActorActOnApplication(counselor, APPLICATION, ORG)).toBe(false);
    expect(mocks.findApplication).toHaveBeenCalledWith({
      where: { id: APPLICATION, user: { organizationId: ORG } },
      select: { userId: true },
    });
    expect(mocks.staffAccess).not.toHaveBeenCalled();
  });

  it('checks the assigned-caseload gate against the application owner in this org', async () => {
    mocks.findApplication.mockResolvedValue({ userId: MEMBER });
    mocks.staffAccess.mockResolvedValue(true);
    expect(await canReviewActorActOnApplication(counselor, APPLICATION, ORG)).toBe(true);
    expect(mocks.staffAccess).toHaveBeenCalledWith(counselor.userId, MEMBER);

    mocks.staffAccess.mockResolvedValue(false);
    expect(await canReviewActorActOnApplication(counselor, APPLICATION, ORG)).toBe(false);
  });
});
