// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: (_org: string, fn: (db: { user: { updateMany: typeof updateMany } }) => unknown) =>
    fn({ user: { updateMany } }),
}));

import { recordAssessmentSubmission } from '@/lib/assessment/recordSubmission';

const authorizedAt = new Date('2026-10-15T12:00:00Z');
const input = (expected: {
  assessmentAttemptCount: number;
  assessmentCompleted: boolean;
  assessmentRetakeRequestedAt: Date | null;
}) => ({
  memberId: 'member-1',
  organizationId: 'org-1',
  expected,
  raw: 20,
  pct: 57,
  programInterest: 'Digital Literacy',
  answers: { 1: 'A' },
});

beforeEach(() => {
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe('recordAssessmentSubmission compare-and-set', () => {
  it('does not write when the expected attempt is no longer eligible', async () => {
    expect(await recordAssessmentSubmission(input({
      assessmentAttemptCount: 1, assessmentCompleted: true, assessmentRetakeRequestedAt: null,
    }))).toBe(false);
    expect(await recordAssessmentSubmission(input({
      assessmentAttemptCount: 2, assessmentCompleted: true, assessmentRetakeRequestedAt: authorizedAt,
    }))).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('pins the unused first attempt and consumes a staff-authorized final attempt', async () => {
    expect(await recordAssessmentSubmission(input({
      assessmentAttemptCount: 0, assessmentCompleted: false, assessmentRetakeRequestedAt: null,
    }))).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'member-1', deletedAt: null, assessmentAttemptCount: 0,
        assessmentCompleted: false, assessmentRetakeRequestedAt: null,
      },
      data: expect.objectContaining({
        assessmentCompleted: true, assessmentAttemptCount: { increment: 1 }, assessmentRetakeRequestedAt: null,
      }),
    }));

    updateMany.mockClear();
    expect(await recordAssessmentSubmission(input({
      assessmentAttemptCount: 1, assessmentCompleted: true, assessmentRetakeRequestedAt: authorizedAt,
    }))).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'member-1', deletedAt: null, assessmentAttemptCount: 1,
        assessmentRetakeRequestedAt: authorizedAt,
      },
    }));
  });

  it('returns false when another writer already consumed the same attempt', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await recordAssessmentSubmission(input({
      assessmentAttemptCount: 0, assessmentCompleted: false, assessmentRetakeRequestedAt: null,
    }))).toBe(false);
  });
});
