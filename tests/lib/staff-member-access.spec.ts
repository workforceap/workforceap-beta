// @vitest-environment node
/**
 * AUDIT-2026-05-16 §C-T1: staff member reads used a global isAdmin() check, so
 * an admin in Org A could open Org B resumes, notes, and points. This helper
 * is the shared replacement. Route suites mock it; a silent revert would not
 * fail those tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findAssignment: vi.fn(),
  superAdmin: vi.fn(),
  adminInOrg: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    counselorAssignment: { findFirst: mocks.findAssignment },
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: mocks.superAdmin,
  isAdminInOrg: mocks.adminInOrg,
}));

import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

const STAFF = 'staff-1';
const MEMBER = 'member-1';
const ORG = 'org-a';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUser.mockResolvedValue({ organizationId: ORG });
  mocks.findAssignment.mockResolvedValue(null);
  mocks.superAdmin.mockResolvedValue(false);
  mocks.adminInOrg.mockResolvedValue(false);
});

describe('assertStaffCanAccessMemberRecord', () => {
  it('lets a super-admin through without reading the member or assignment', async () => {
    mocks.superAdmin.mockResolvedValue(true);
    expect(await assertStaffCanAccessMemberRecord('platform-ops', MEMBER)).toBe(true);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.adminInOrg).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('lets a same-org admin through without an assignment', async () => {
    mocks.adminInOrg.mockImplementation(async (userId: string, orgId: string) => userId === STAFF && orgId === ORG);
    expect(await assertStaffCanAccessMemberRecord(STAFF, MEMBER)).toBe(true);
    expect(mocks.adminInOrg).toHaveBeenCalledWith(STAFF, ORG);
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });

  it('rejects a foreign-org admin who is not the assigned counselor', async () => {
    mocks.adminInOrg.mockResolvedValue(false);
    expect(await assertStaffCanAccessMemberRecord('org-b-admin', MEMBER)).toBe(false);
    expect(mocks.adminInOrg).toHaveBeenCalledWith('org-b-admin', ORG);
    expect(mocks.findAssignment).toHaveBeenCalledWith({
      where: {
        memberId: MEMBER,
        active: true,
        counselor: { userId: 'org-b-admin', active: true },
      },
      select: { id: true },
    });
  });

  it('lets the actively assigned counselor through', async () => {
    mocks.findAssignment.mockResolvedValue({ id: 'assignment-1' });
    expect(await assertStaffCanAccessMemberRecord(STAFF, MEMBER)).toBe(true);
  });

  it('rejects an inactive or missing assignment', async () => {
    mocks.findAssignment.mockResolvedValue(null);
    expect(await assertStaffCanAccessMemberRecord(STAFF, MEMBER)).toBe(false);
  });

  it('rejects a missing member or a member with no organization', async () => {
    mocks.findUser.mockResolvedValue(null);
    expect(await assertStaffCanAccessMemberRecord(STAFF, 'missing')).toBe(false);
    expect(mocks.adminInOrg).not.toHaveBeenCalled();
    expect(mocks.findAssignment).not.toHaveBeenCalled();

    mocks.findUser.mockResolvedValue({ organizationId: null });
    expect(await assertStaffCanAccessMemberRecord(STAFF, MEMBER)).toBe(false);
    expect(mocks.findAssignment).not.toHaveBeenCalled();
  });
});
