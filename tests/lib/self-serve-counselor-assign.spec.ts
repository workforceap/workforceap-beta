import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findManyCounselors,
  groupByAssignments,
  updateManyUsers,
  findFirstAssignment,
  findUniqueUser,
  findFirstPartnerReferral,
  findFirstCounselor,
  findUniqueProfile,
  findManyUserRoles,
  assignMemberCounselor,
  createNotification,
  transaction,
} = vi.hoisted(() => ({
  findManyCounselors: vi.fn(),
  groupByAssignments: vi.fn(),
  updateManyUsers: vi.fn(),
  findFirstAssignment: vi.fn(),
  findUniqueUser: vi.fn(),
  findFirstPartnerReferral: vi.fn(),
  findFirstCounselor: vi.fn(),
  findUniqueProfile: vi.fn(),
  findManyUserRoles: vi.fn(),
  assignMemberCounselor: vi.fn(),
  createNotification: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/counselor/assignment', () => ({
  assignMemberCounselor,
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: transaction,
    counselor: { findMany: findManyCounselors, findFirst: findFirstCounselor },
    counselorAssignment: { groupBy: groupByAssignments, findFirst: findFirstAssignment },
    user: { updateMany: updateManyUsers, findUnique: findUniqueUser },
    partnerReferral: { findFirst: findFirstPartnerReferral },
    profile: { findUnique: findUniqueProfile },
    userRole: { findMany: findManyUserRoles },
  },
}));

import {
  ensureSelfServeCounselorAssigned,
  pickLeastLoadedWapCounselor,
} from '@/lib/counselor/autoAssign';
import { prisma } from '@/lib/db/prisma';

function fakeTx() {
  return {
    counselor: { findMany: findManyCounselors },
    counselorAssignment: { groupBy: groupByAssignments, findFirst: findFirstAssignment },
    user: { updateMany: updateManyUsers, findUnique: findUniqueUser },
  };
}

describe('pickLeastLoadedWapCounselor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the org has no active WAP staff counselors', async () => {
    findManyCounselors.mockResolvedValue([]);
    await expect(pickLeastLoadedWapCounselor(fakeTx() as never, 'org-1')).resolves.toBeNull();
    expect(groupByAssignments).not.toHaveBeenCalled();
    expect(findManyCounselors).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          affiliation: 'wap_staff',
          user: { organizationId: 'org-1', deletedAt: null },
        }),
      }),
    );
  });

  it('picks the counselor with the fewest active assignments', async () => {
    findManyCounselors.mockResolvedValue([
      { id: 'cns-old', userId: 'user-old', createdAt: new Date('2025-01-01') },
      { id: 'cns-new', userId: 'user-new', createdAt: new Date('2026-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([
      { counselorId: 'cns-old', _count: { _all: 4 } },
      { counselorId: 'cns-new', _count: { _all: 1 } },
    ]);

    await expect(pickLeastLoadedWapCounselor(fakeTx() as never, 'org-1')).resolves.toEqual({
      counselorId: 'cns-new',
      userId: 'user-new',
    });
  });

  it('breaks load ties with the older counselor row', async () => {
    findManyCounselors.mockResolvedValue([
      { id: 'cns-old', userId: 'user-old', createdAt: new Date('2025-01-01') },
      { id: 'cns-new', userId: 'user-new', createdAt: new Date('2026-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([]);

    await expect(pickLeastLoadedWapCounselor(fakeTx() as never, 'org-1')).resolves.toEqual({
      counselorId: 'cns-old',
      userId: 'user-old',
    });
  });
});

describe('ensureSelfServeCounselorAssigned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx()));
    findUniqueUser.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'member-1') return { fullName: 'Sam Student', email: 'sam@example.org' };
      return { fullName: 'Casey Counselor' };
    });
    createNotification.mockResolvedValue(undefined);
    findFirstPartnerReferral.mockResolvedValue(null);
    findFirstCounselor.mockResolvedValue(null);
    findUniqueProfile.mockResolvedValue({ role: 'member' });
    findManyUserRoles.mockResolvedValue([{ role: { name: 'member' } }]);
  });

  function expectNoAssignmentWrites() {
    expect(findManyCounselors).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(assignMemberCounselor).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  }

  function givePoolCounselor() {
    findFirstAssignment.mockResolvedValue(null);
    findManyCounselors.mockResolvedValue([
      { id: 'cns-1', userId: 'counselor-1', createdAt: new Date('2025-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([]);
    updateManyUsers.mockResolvedValue({ count: 1 });
    assignMemberCounselor.mockResolvedValue({ counselor: { userId: 'counselor-1' }, thread: { id: 't1' } });
  }

  it('never self-assigns a counselor account that opens the member inbox', async () => {
    givePoolCounselor();
    findFirstCounselor.mockResolvedValue({ id: 'cns-staff' });

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({ assigned: false, counselorUserId: null, reason: 'staff_account' });
    expect(findFirstCounselor).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'member-1', active: true } }),
    );
    expectNoAssignmentWrites();
  });

  it.each([
    ['profile admin', { role: 'admin' }, []],
    ['profile super_admin', { role: 'super_admin' }, []],
    ['user_roles admin', { role: 'member' }, [{ role: { name: 'admin' } }]],
    ['user_roles super_admin', null, [{ role: { name: 'super_admin' } }]],
  ])('never self-assigns a %s account', async (_label, profile, userRoles) => {
    givePoolCounselor();
    findUniqueProfile.mockResolvedValue(profile);
    findManyUserRoles.mockResolvedValue(userRoles);

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({ assigned: false, counselorUserId: null, reason: 'staff_account' });
    expectNoAssignmentWrites();
  });

  it('returns already_assigned without writing when a counselor is active', async () => {
    findFirstAssignment.mockResolvedValue({
      counselor: { userId: 'counselor-1', active: true },
    });

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: true,
      counselorUserId: 'counselor-1',
      reason: 'already_assigned',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(assignMemberCounselor).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('assigns the least-loaded WAP counselor and notifies both sides', async () => {
    findFirstAssignment.mockResolvedValue(null);
    findManyCounselors.mockResolvedValue([
      { id: 'cns-1', userId: 'counselor-1', createdAt: new Date('2025-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([]);
    updateManyUsers.mockResolvedValue({ count: 1 });
    assignMemberCounselor.mockResolvedValue({
      counselor: { userId: 'counselor-1' },
      thread: { id: 't1' },
    });

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: true,
      counselorUserId: 'counselor-1',
      reason: 'assigned',
    });
    expect(assignMemberCounselor).toHaveBeenCalledWith(
      expect.anything(),
      {
        memberId: 'member-1',
        organizationId: 'org-1',
        counselorUserId: 'counselor-1',
      },
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        title: 'You have a new advisor',
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'counselor-1',
        title: 'A new member is on your caseload',
        data: expect.objectContaining({ link: '/counselor/students/member-1' }),
      }),
    );
  });

  it('leaves partner-referred members to their partner without writing', async () => {
    findFirstAssignment.mockResolvedValue(null);
    findFirstPartnerReferral.mockResolvedValue({ id: 'ref-1' });
    findManyCounselors.mockResolvedValue([
      { id: 'cns-1', userId: 'counselor-1', createdAt: new Date('2025-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([]);

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: false,
      counselorUserId: null,
      reason: 'partner_referred',
    });
    expect(findFirstPartnerReferral).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: 'member-1' } }),
    );
    // No pool lookup, no lock, no assignment, no notifications.
    expect(findManyCounselors).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(assignMemberCounselor).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('still honours an existing assignment for a partner-referred member', async () => {
    findFirstAssignment.mockResolvedValue({
      counselor: { userId: 'partner-counselor', active: true },
    });
    findFirstPartnerReferral.mockResolvedValue({ id: 'ref-1' });

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: true,
      counselorUserId: 'partner-counselor',
      reason: 'already_assigned',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns no_counselors without writing when the WAP staff pool is empty', async () => {
    findFirstAssignment.mockResolvedValue(null);
    findManyCounselors.mockResolvedValue([]);

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: false,
      counselorUserId: null,
      reason: 'no_counselors',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(updateManyUsers).not.toHaveBeenCalled();
    expect(assignMemberCounselor).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns member_unavailable when the lock misses after a live pick', async () => {
    findFirstAssignment.mockResolvedValue(null);
    findManyCounselors.mockResolvedValue([
      { id: 'cns-1', userId: 'counselor-1', createdAt: new Date('2025-01-01') },
    ]);
    groupByAssignments.mockResolvedValue([]);
    updateManyUsers.mockResolvedValue({ count: 0 });

    await expect(
      ensureSelfServeCounselorAssigned({ memberId: 'member-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      assigned: false,
      counselorUserId: null,
      reason: 'member_unavailable',
    });
    expect(assignMemberCounselor).not.toHaveBeenCalled();
  });
});
