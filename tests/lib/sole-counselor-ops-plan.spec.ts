/**
 * Plan / apply leftovers from #2824. The shipped helper suite only pins
 * fixture-email detection and formatter copy; these cases prove skip reasons,
 * Mike-thread retarget-only rows, and apply error isolation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assignMemberCounselor = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/counselor/assignment', () => ({
  assignMemberCounselor,
}));

import {
  applyMikeThreadHandoff,
  applySoleCounselorOps,
  planMikeThreadHandoff,
  planSoleCounselorOps,
  type MikeThreadHandoffPlan,
  type SoleCounselorPlan,
} from '@/lib/counselor/soleCounselorOps';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

const sole = {
  counselorId: 'c-dad',
  userId: 'u-dad',
  email: 'mbrowncsn@sbcglobal.net',
  fullName: 'Michael Brown',
  organizationId: ORG,
  active: true,
  affiliation: 'wap_staff',
};

type MemberRow = {
  id: string;
  email: string;
  fullName: string | null;
  organizationId: string;
  deletedAt?: Date | null;
  threadOwnerEmail?: string | null;
  partnerReferred?: boolean;
  staffVia?: 'counselor' | 'profile' | 'role' | null;
};

function planDb(input: {
  soleActive?: boolean;
  soleMissing?: boolean;
  fromOwner?: { id: string; email: string } | null;
  otherCounselors?: Array<{
    id: string;
    userId: string;
    email: string;
    fullName: string | null;
    active: boolean;
    caseload?: number;
  }>;
  unassigned?: MemberRow[];
  threads?: Array<{ id: string; member: MemberRow }>;
}) {
  const soleRow = input.soleMissing
    ? null
    : {
        id: sole.counselorId,
        userId: sole.userId,
        active: input.soleActive ?? true,
        affiliation: 'wap_staff',
        user: {
          email: sole.email,
          fullName: sole.fullName,
          organizationId: sole.organizationId,
        },
      };
  const others = input.otherCounselors ?? [];
  const members = input.unassigned ?? [];
  const threads = input.threads ?? [];

  return {
    counselor: {
      findFirst: async ({ where }: { where: { userId?: string; user?: { email?: { equals?: string } } } }) => {
        if (where.user?.email?.equals) {
          return where.user.email.equals === sole.email.toLowerCase() ? soleRow : null;
        }
        if (where.userId) {
          const staff = [...members, ...threads.map((t) => t.member)].find(
            (m) => m.id === where.userId && m.staffVia === 'counselor',
          );
          return staff ? { id: `c-${staff.id}` } : null;
        }
        return null;
      },
      findMany: async () =>
        others.map((row) => ({
          id: row.id,
          userId: row.userId,
          active: row.active,
          user: { email: row.email, fullName: row.fullName },
        })),
    },
    counselorAssignment: {
      groupBy: async () =>
        others
          .filter((row) => (row.caseload ?? 0) > 0)
          .map((row) => ({ counselorId: row.id, _count: { _all: row.caseload ?? 0 } })),
    },
    user: {
      findFirst: async ({ where }: { where: { email?: { equals?: string } } }) => {
        const email = where.email?.equals;
        if (!email) return null;
        if (input.fromOwner && input.fromOwner.email.toLowerCase() === email) return input.fromOwner;
        return null;
      },
      findMany: async () =>
        members.map((member) => ({
          id: member.id,
          email: member.email,
          fullName: member.fullName,
          organizationId: member.organizationId,
          messageThreadsAsMember: member.threadOwnerEmail
            ? [{ counselorUserId: 'u-mike', counselor: { email: member.threadOwnerEmail } }]
            : [],
        })),
    },
    userRole: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        const member = [...members, ...threads.map((t) => t.member)].find((m) => m.id === where.userId);
        return member?.staffVia === 'role' ? [{ role: { name: 'admin' } }] : [];
      },
    },
    profile: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const member = [...members, ...threads.map((t) => t.member)].find((m) => m.id === where.userId);
        if (member?.staffVia === 'profile') return { role: 'counselor' };
        return { role: 'member' };
      },
    },
    partnerReferral: {
      findFirst: async ({ where }: { where: { memberId: string } }) => {
        const member = members.find((m) => m.id === where.memberId);
        return member?.partnerReferred ? { id: `ref-${member.id}` } : null;
      },
    },
    messageThread: {
      findMany: async () =>
        threads.map((thread) => ({
          id: thread.id,
          memberId: thread.member.id,
          member: {
            id: thread.member.id,
            email: thread.member.email,
            fullName: thread.member.fullName,
            organizationId: thread.member.organizationId,
            deletedAt: thread.member.deletedAt ?? null,
          },
        })),
    },
  };
}

describe('planSoleCounselorOps', () => {
  it('throws when the sole counselor is missing or inactive', async () => {
    await expect(planSoleCounselorOps(planDb({ soleMissing: true }) as never, { soleEmail: sole.email })).rejects.toThrow(
      /No WAP staff counselor found/,
    );
    await expect(planSoleCounselorOps(planDb({ soleActive: false }) as never, { soleEmail: sole.email })).rejects.toThrow(
      /counselors.active=false/,
    );
  });

  it('classifies unassigned members and other WAP staff without writing', async () => {
    const plan = await planSoleCounselorOps(
      planDb({
        otherCounselors: [
          {
            id: 'c-other',
            userId: 'u-other',
            email: 'other@workforceap.org',
            fullName: 'Other',
            active: true,
            caseload: 4,
          },
          {
            id: 'c-qa',
            userId: 'u-qa',
            email: 'counselor-test@workforceap.org',
            fullName: 'QA',
            active: false,
            caseload: 0,
          },
        ],
        unassigned: [
          {
            id: 'm-ok',
            email: 'john.cofield@gmail.com',
            fullName: 'John',
            organizationId: ORG,
            threadOwnerEmail: 'mabrown040@gmail.com',
          },
          {
            id: 'm-fixture',
            email: 'member-test@workforceap.org',
            fullName: 'Fixture',
            organizationId: ORG,
          },
          {
            id: 'm-partner',
            email: 'partnered@gmail.com',
            fullName: 'Pat',
            organizationId: ORG,
            partnerReferred: true,
          },
          {
            id: 'm-staff',
            email: 'staffer@gmail.com',
            fullName: 'Staff',
            organizationId: ORG,
            staffVia: 'role',
          },
          {
            id: 'm-foreign',
            email: 'foreign@gmail.com',
            fullName: 'Foreign',
            organizationId: OTHER_ORG,
          },
          {
            id: 'u-dad',
            email: sole.email,
            fullName: sole.fullName,
            organizationId: ORG,
          },
        ],
      }) as never,
      { soleEmail: '  MBrownCSN@sbcglobal.net  ' },
    );

    expect(plan.otherActiveWapStaff).toEqual([
      expect.objectContaining({ counselorId: 'c-other', activeCaseload: 4 }),
    ]);
    expect(plan.alreadyInactiveOthers.map((row) => row.counselorId)).toEqual(['c-qa']);
    expect(plan.reassign).toEqual([
      expect.objectContaining({
        memberId: 'm-ok',
        threadOwnerEmail: 'mabrown040@gmail.com',
        reason: 'unassigned',
      }),
    ]);
    expect(plan.skipped.map((row) => [row.memberId, row.reason])).toEqual([
      ['m-fixture', 'fixture'],
      ['m-partner', 'partner_referred'],
      ['m-staff', 'staff_account'],
      ['m-foreign', 'wrong_org'],
      ['u-dad', 'self'],
    ]);
    expect(plan.mikeOwnedThreadCount).toBe(1);
  });
});

describe('planMikeThreadHandoff', () => {
  const fromOwner = { id: 'u-mike', email: 'mabrown040@gmail.com' };

  it('throws when Mike’s account is missing', async () => {
    await expect(
      planMikeThreadHandoff(planDb({ fromOwner: null }) as never, {
        soleEmail: sole.email,
        fromOwnerEmail: fromOwner.email,
      }),
    ).rejects.toThrow(/Thread owner not found/);
  });

  it('moves ordinary members, retargets dad/staff, and leaves deleted/fixture/foreign on Mike', async () => {
    const plan = await planMikeThreadHandoff(
      planDb({
        fromOwner,
        threads: [
          {
            id: 't-member',
            member: {
              id: 'm-ok',
              email: 'john.cofield@gmail.com',
              fullName: 'John',
              organizationId: ORG,
            },
          },
          {
            id: 't-dad',
            member: {
              id: 'u-dad',
              email: sole.email,
              fullName: sole.fullName,
              organizationId: ORG,
            },
          },
          {
            id: 't-staff',
            member: {
              id: 'm-staff',
              email: 'staffer@gmail.com',
              fullName: 'Staff',
              organizationId: ORG,
              staffVia: 'profile',
            },
          },
          {
            id: 't-deleted',
            member: {
              id: 'm-del',
              email: 'gone@gmail.com',
              fullName: 'Gone',
              organizationId: ORG,
              deletedAt: new Date('2026-01-01T00:00:00Z'),
            },
          },
          {
            id: 't-fixture',
            member: {
              id: 'm-fix',
              email: 'test-smoke-abc@example.com',
              fullName: 'Smoke',
              organizationId: ORG,
            },
          },
          {
            id: 't-foreign',
            member: {
              id: 'm-foreign',
              email: 'foreign@gmail.com',
              fullName: 'Foreign',
              organizationId: OTHER_ORG,
            },
          },
        ],
      }) as never,
      { soleEmail: sole.email, fromOwnerEmail: fromOwner.email },
    );

    expect(plan.move.map((row) => [row.threadId, row.action, row.skipReason ?? null])).toEqual([
      ['t-member', 'assign_and_retarget', null],
      ['t-dad', 'retarget_thread_only', 'self'],
      ['t-staff', 'retarget_thread_only', 'staff_account'],
    ]);
    expect(plan.skipped.map((row) => [row.threadId, row.skipReason])).toEqual([
      ['t-deleted', 'deleted'],
      ['t-fixture', 'fixture'],
      ['t-foreign', 'wrong_org'],
    ]);
  });
});

describe('applySoleCounselorOps / applyMikeThreadHandoff', () => {
  beforeEach(() => {
    assignMemberCounselor.mockReset();
    assignMemberCounselor.mockResolvedValue(undefined);
  });

  it('does not write when both apply flags are off', async () => {
    const counselorUpdate = vi.fn();
    const plan: SoleCounselorPlan = {
      sole,
      otherActiveWapStaff: [
        {
          counselorId: 'c-other',
          userId: 'u-other',
          email: 'other@workforceap.org',
          fullName: 'Other',
          activeCaseload: 1,
        },
      ],
      alreadyInactiveOthers: [],
      reassign: [
        {
          memberId: 'm-1',
          email: 'john.cofield@gmail.com',
          fullName: 'John',
          organizationId: ORG,
          threadOwnerEmail: null,
          reason: 'unassigned',
        },
      ],
      skipped: [],
      mikeOwnedThreadCount: 0,
    };

    const result = await applySoleCounselorOps(
      { counselor: { update: counselorUpdate }, $transaction: vi.fn() } as never,
      plan,
      { deactivateOthers: false, reassignUnassigned: false },
    );

    expect(result).toEqual({ deactivatedCounselorIds: [], assignedMemberIds: [], errors: [] });
    expect(counselorUpdate).not.toHaveBeenCalled();
    expect(assignMemberCounselor).not.toHaveBeenCalled();
  });

  it('keeps applying after one deactivate or assign failure', async () => {
    const counselorUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error('row locked'))
      .mockResolvedValueOnce({});
    assignMemberCounselor
      .mockRejectedValueOnce(new Error('Member is no longer available in this organization.'))
      .mockResolvedValueOnce(undefined);

    const plan: SoleCounselorPlan = {
      sole,
      otherActiveWapStaff: [
        {
          counselorId: 'c-fail',
          userId: 'u-fail',
          email: 'fail@workforceap.org',
          fullName: 'Fail',
          activeCaseload: 0,
        },
        {
          counselorId: 'c-ok',
          userId: 'u-ok',
          email: 'ok@workforceap.org',
          fullName: 'Ok',
          activeCaseload: 0,
        },
      ],
      alreadyInactiveOthers: [],
      reassign: [
        {
          memberId: 'm-fail',
          email: 'fail@gmail.com',
          fullName: 'Fail Member',
          organizationId: ORG,
          threadOwnerEmail: null,
          reason: 'unassigned',
        },
        {
          memberId: 'm-ok',
          email: 'ok@gmail.com',
          fullName: 'Ok Member',
          organizationId: ORG,
          threadOwnerEmail: null,
          reason: 'unassigned',
        },
      ],
      skipped: [],
      mikeOwnedThreadCount: 0,
    };

    const result = await applySoleCounselorOps(
      {
        counselor: { update: counselorUpdate },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
      } as never,
      plan,
      { deactivateOthers: true, reassignUnassigned: true },
    );

    expect(result.deactivatedCounselorIds).toEqual(['c-ok']);
    expect(result.assignedMemberIds).toEqual(['m-ok']);
    expect(result.errors).toEqual([
      { counselorId: 'c-fail', message: 'row locked' },
      { memberId: 'm-fail', message: 'Member is no longer available in this organization.' },
    ]);
  });

  it('assigns ordinary Mike threads and only retargets dad / staff rows', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const plan: MikeThreadHandoffPlan = {
      sole,
      fromOwnerEmail: 'mabrown040@gmail.com',
      fromOwnerUserId: 'u-mike',
      move: [
        {
          threadId: 't-member',
          memberId: 'm-ok',
          email: 'john.cofield@gmail.com',
          fullName: 'John',
          organizationId: ORG,
          action: 'assign_and_retarget',
        },
        {
          threadId: 't-dad',
          memberId: 'u-dad',
          email: sole.email,
          fullName: sole.fullName,
          organizationId: ORG,
          action: 'retarget_thread_only',
          skipReason: 'self',
        },
      ],
      skipped: [],
    };

    const result = await applyMikeThreadHandoff(
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
        messageThread: { updateMany },
      } as never,
      plan,
    );

    expect(assignMemberCounselor).toHaveBeenCalledTimes(1);
    expect(assignMemberCounselor).toHaveBeenCalledWith(expect.anything(), {
      memberId: 'm-ok',
      organizationId: ORG,
      counselorUserId: sole.userId,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 't-dad', counselorUserId: 'u-mike' },
      data: { counselorUserId: sole.userId },
    });
    expect(result).toEqual({
      assignedMemberIds: ['m-ok'],
      retargetedThreadIds: ['t-member', 't-dad'],
      errors: [],
    });
  });

  it('continues Mike-thread apply after one row fails', async () => {
    assignMemberCounselor.mockRejectedValueOnce(new Error('Counselor is no longer active in this organization.'));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const plan: MikeThreadHandoffPlan = {
      sole,
      fromOwnerEmail: 'mabrown040@gmail.com',
      fromOwnerUserId: 'u-mike',
      move: [
        {
          threadId: 't-fail',
          memberId: 'm-fail',
          email: 'fail@gmail.com',
          fullName: 'Fail',
          organizationId: ORG,
          action: 'assign_and_retarget',
        },
        {
          threadId: 't-dad',
          memberId: 'u-dad',
          email: sole.email,
          fullName: sole.fullName,
          organizationId: ORG,
          action: 'retarget_thread_only',
          skipReason: 'self',
        },
      ],
      skipped: [],
    };

    const result = await applyMikeThreadHandoff(
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
        messageThread: { updateMany },
      } as never,
      plan,
    );

    expect(result.assignedMemberIds).toEqual([]);
    expect(result.retargetedThreadIds).toEqual(['t-dad']);
    expect(result.errors).toEqual([
      {
        memberId: 'm-fail',
        threadId: 't-fail',
        message: 'Counselor is no longer active in this organization.',
      },
    ]);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
