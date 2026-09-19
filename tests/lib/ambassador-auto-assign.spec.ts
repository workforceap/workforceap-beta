import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findFirstUser,
  findManyCounselors,
  findUniqueAssignment,
  createAssignment,
  updateAssignment,
  updateThread,
} = vi.hoisted(() => ({
  findFirstUser: vi.fn(),
  findManyCounselors: vi.fn(),
  findUniqueAssignment: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  updateThread: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findFirst: findFirstUser },
    counselor: { findMany: findManyCounselors },
    messageThread: { update: updateThread },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        counselorAssignment: {
          findUnique: findUniqueAssignment,
          create: createAssignment,
          update: updateAssignment,
        },
      }),
    ),
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendCounselorAssignedEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(async () => ({ id: 'thread-1' })),
}));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));

import { autoAssignAmbassadorFromReferral } from '@/lib/counselor/ambassadorAutoAssign';
import { createNotification } from '@/lib/notifications/create';
import { sendCounselorAssignedEmail } from '@/lib/email';

const member = {
  id: 'member-1',
  email: 'student@example.org',
  fullName: 'Sam Student',
  organizationId: 'org-1',
  counselorAssignments: [],
};
const ambassadors = [
  { id: 'cns-1', userId: 'amb-1', user: { fullName: 'Maria García', email: 'maria@example.org' } },
  { id: 'cns-2', userId: 'amb-2', user: { fullName: 'James Lee', email: 'james@example.org' } },
];

describe('autoAssignAmbassadorFromReferral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstUser.mockResolvedValue(member);
    findManyCounselors.mockResolvedValue(ambassadors);
    findUniqueAssignment.mockResolvedValue(null);
    createAssignment.mockResolvedValue({ id: 'asg-1' });
    updateThread.mockResolvedValue({});
  });

  it('assigns the student to the uniquely named ambassador and notifies both sides', async () => {
    const result = await autoAssignAmbassadorFromReferral({
      memberId: 'member-1',
      source: 'apply_signup',
      hearAbout: 'Community Ambassador (write in)',
      hearAboutOther: 'maria garcia',
    });

    expect(result).toMatchObject({ assigned: true, counselorUserId: 'amb-1', matchedOn: 'name' });
    expect(findManyCounselors).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true, affiliation: 'community_ambassador' }),
      }),
    );
    expect(createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ counselorId: 'cns-1', memberId: 'member-1', active: true }),
      }),
    );
    expect(updateThread).toHaveBeenCalledWith(
      expect.objectContaining({ data: { counselorUserId: 'amb-1' } }),
    );
    expect(sendCounselorAssignedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'student@example.org', counselorFullName: 'Maria García' }),
    );
    const notifiedUsers = vi.mocked(createNotification).mock.calls.map((c) => c[0].userId).sort();
    expect(notifiedUsers).toEqual(['amb-1', 'member-1']);
  });

  it('does nothing when the answers do not name an ambassador', async () => {
    const result = await autoAssignAmbassadorFromReferral({
      memberId: 'member-1',
      source: 'apply_signup',
      hearAbout: 'Friend or family',
    });
    expect(result).toEqual({ assigned: false, reason: 'no_referral_text' });
    expect(findFirstUser).not.toHaveBeenCalled();
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it('never overrides an existing active assignment', async () => {
    findFirstUser.mockResolvedValue({ ...member, counselorAssignments: [{ id: 'asg-existing' }] });
    const result = await autoAssignAmbassadorFromReferral({
      memberId: 'member-1',
      source: 'member_eligibility',
      partnerAmbassadorReferral: 'Maria García',
    });
    expect(result).toEqual({ assigned: false, reason: 'already_assigned' });
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it('leaves unknown names for staff instead of guessing', async () => {
    const result = await autoAssignAmbassadorFromReferral({
      memberId: 'member-1',
      source: 'apply_signup',
      partnerAmbassadorReferral: 'Someone Else',
    });
    expect(result).toEqual({ assigned: false, reason: 'no_match' });
    expect(createAssignment).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('reports a failure instead of throwing into the caller', async () => {
    findFirstUser.mockRejectedValue(new Error('db down'));
    const result = await autoAssignAmbassadorFromReferral({
      memberId: 'member-1',
      source: 'apply_signup',
      partnerAmbassadorReferral: 'Maria García',
    });
    expect(result).toEqual({ assigned: false, reason: 'failed' });
  });
});
