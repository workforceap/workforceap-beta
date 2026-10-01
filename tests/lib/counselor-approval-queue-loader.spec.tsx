import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * The approval-queue loader (lib/counselor/loadApprovalQueue.ts) against a
 * mocked Prisma: the member query runs under the counselor's tenant with the
 * one member definition, and the rows it yields are the number the Today
 * tile prints (tile = table, #2470).
 */
const mocks = vi.hoisted(() => ({
  counselorFindFirst: vi.fn(),
  assignmentFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselor: { findFirst: mocks.counselorFindFirst },
    counselorAssignment: { findMany: mocks.assignmentFindMany },
    user: { findMany: mocks.userFindMany },
  },
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/counselor/adminMemberScope', () => ({ resolveAdminEnrolledMemberIds: vi.fn(async () => []) }));

import { getCounselorApprovalQueue } from '@/lib/counselor/loadApprovalQueue';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { toTodayQueue } from '@/lib/attention/counselorViews';

const MEMBER_IDS = ['m-both', 'm-intake', 'm-decided'];

function seedMembers() {
  mocks.userFindMany.mockResolvedValue([
    {
      id: 'm-both', fullName: 'Ada Pending', email: 'ada@example.test', enrolledProgram: null,
      wioaReviewStatus: 'pending', wioaReviewedAt: null,
      wioaQualificationJson: {
        version: 2, submittedAt: '2026-09-01T10:00:00Z', signal: 'likely', reasons: [],
        answers: { ageBracket: '25_54', countyOrZip: '77002', primaryBarrier: 'none', dislocatedWorker: false, lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: true },
      },
      applications: [{ id: 'a-1', status: 'PENDING', programInterest: 'it-support', submittedAt: new Date('2026-08-08T12:00:00Z'), createdAt: new Date('2026-08-08T12:00:00Z') }],
    },
    {
      id: 'm-intake', fullName: null, email: 'intake@example.test', enrolledProgram: 'it-support',
      wioaReviewStatus: 'in_review', wioaReviewedAt: new Date('2026-09-21T09:00:00Z'),
      wioaQualificationJson: null, // no parsable screening: the staff timestamp is the only anchor
      applications: [],
    },
    {
      id: 'm-decided', fullName: 'Done Already', email: 'done@example.test', enrolledProgram: 'it-support',
      wioaReviewStatus: 'verified', wioaReviewedAt: new Date('2026-09-01T09:00:00Z'),
      wioaQualificationJson: null,
      applications: [], // APPROVED rows are filtered by the query's `status in` and never come back
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
  mocks.counselorFindFirst.mockResolvedValue({ id: 'counselor-1' });
  mocks.assignmentFindMany.mockResolvedValue(MEMBER_IDS.map((memberId) => ({ memberId })));
  seedMembers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('getCounselorApprovalQueue', () => {
  it('queries the assigned members inside the actor org with the one member definition', async () => {
    await getCounselorApprovalQueue('counselor-user');
    expect(mocks.counselorFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'counselor-user', active: true } }));
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    const args = mocks.userFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      id: { in: MEMBER_IDS },
      organizationId: 'org-1',
      deletedAt: null,
      email: MEMBER_ONLY_WHERE.email,
      NOT: MEMBER_ONLY_WHERE.NOT,
    });
    expect(args.select.applications.where).toEqual({ status: { in: ['PENDING'] } });
    expect(args.take).toBeGreaterThan(0);
  });

  it('skips the query for a counselor with no assignments', async () => {
    mocks.assignmentFindMany.mockResolvedValue([]);
    const queue = await getCounselorApprovalQueue('counselor-user');
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(queue.rows).toEqual([]);
    expect(queue.totals.waiting).toBe(0);
  });

  it('turns the facts into rows dated from the stored timestamps, and the Today tile prints exactly that many', async () => {
    const queue = await getCounselorApprovalQueue('counselor-user');
    expect(queue.rows.map((r) => r.key)).toEqual(['application:m-both:a-1', 'intake:m-both', 'intake:m-intake']);
    expect(queue.rows.map((r) => r.waitingSince?.toISOString())).toEqual([
      '2026-08-08T12:00:00.000Z', // applications.submitted_at
      '2026-09-01T10:00:00.000Z', // wioaQualificationJson.submittedAt
      '2026-09-21T09:00:00.000Z', // users.wioa_reviewed_at, no screening date stored
    ]);
    expect(queue.rows[1].memberName).toBe('Ada Pending');
    expect(queue.rows[2].memberName).toBe('intake@example.test');
    expect(queue.totals.waiting).toBe(3);

    render(<CounselorTodayKit queue={toTodayQueue(emptyAttentionQueue())} approvals={queue} />);
    const section = screen.getByTestId('today-approval-queue');
    const rows = within(section).getAllByTestId('approval-row');
    const tile = screen.getByTestId('today-tile-awaiting-decision');
    expect(tile.querySelector('.wa-kit-stat-value')?.textContent).toBe(String(rows.length));
    expect(rows).toHaveLength(3);
    expect(section).toHaveAttribute('data-count', '3');
    expect(rows[0]).toHaveTextContent('45 days waiting');
    expect(rows[1]).toHaveTextContent('21 days waiting');
    expect(rows[2]).toHaveTextContent('1 day waiting');
  });
});
