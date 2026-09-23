import { describe, it, expect, vi, beforeEach } from 'vitest';

// The nightly scorer (persistAtRiskAlert) must not erase escalations a MEMBER
// reported (First 90 Days "having trouble", placement-survey job loss): those
// factors survive a score rewrite and the escalation score floor holds.

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    atRiskAlert: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: vi.fn() }));
vi.mock('@/lib/member/memberEngagementSignals', () => ({ getMemberEngagementSignals: vi.fn() }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn() }));
vi.mock('@/lib/member/trainingProgress', () => ({ resolveTrainingProgressAssignment: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { persistAtRiskAlert, type AtRiskScore } from '@/lib/member/atRiskScoring';
import {
  MEMBER_REPORTED_FACTOR_NAMES,
  hasMemberReportedFactor,
  memberReportedFactors,
} from '@/lib/member/counselorEscalation';

const trouble = {
  name: 'first90_trouble_reported',
  weight: 1,
  description: 'Member reported having trouble in the first 90 days',
};
const jobLoss = {
  name: 'placement_survey_job_loss_reported',
  weight: 1,
  description: 'Placement survey reported job loss',
};
const oldScorerFactor = { name: 'no_login_7_days', weight: 25, description: 'No login in 7 days' };
const newScorerFactor = { name: 'no_login_14_days', weight: 40, description: 'No login in 14 days' };

function score(partial: Partial<AtRiskScore> = {}): AtRiskScore {
  return {
    userId: 'user-1',
    score: 40,
    factors: [newScorerFactor],
    lastActivityAt: null,
    recommendedAction: 'Check in',
    ...partial,
  };
}

describe('persistAtRiskAlert keeps member-reported escalations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the member-reported factor, refreshes scorer factors and never lowers the score', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [oldScorerFactor, trouble],
      status: 'open',
    } as any);

    await persistAtRiskAlert(score({ score: 40, factors: [newScorerFactor] }));

    expect(prisma.atRiskAlert.update).toHaveBeenCalledTimes(1);
    const args = vi.mocked(prisma.atRiskAlert.update).mock.calls[0]![0] as any;
    expect(args.where).toEqual({ id: 'alert-1' });
    expect(args.data.score).toBe(75);
    expect(args.data.factors).toEqual([newScorerFactor, trouble]);
    expect(args.data.factors).not.toContainEqual(oldScorerFactor);
    expect(prisma.atRiskAlert.create).not.toHaveBeenCalled();
  });

  it('uses the new score when it is higher than the existing one and does not duplicate the factor', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [jobLoss, trouble],
      status: 'acknowledged',
    } as any);

    // The scorer never emits member-reported names, but guard against duplicates anyway.
    await persistAtRiskAlert(score({ score: 95, factors: [newScorerFactor, trouble] }));

    const args = vi.mocked(prisma.atRiskAlert.update).mock.calls[0]![0] as any;
    expect(args.data.score).toBe(95);
    expect(args.data.factors).toEqual([newScorerFactor, trouble, jobLoss]);
  });

  it('keeps the old overwrite behavior when the alert has no member-reported factor', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [oldScorerFactor],
      status: 'open',
    } as any);

    await persistAtRiskAlert(score({ score: 40, factors: [newScorerFactor] }));

    const args = vi.mocked(prisma.atRiskAlert.update).mock.calls[0]![0] as any;
    expect(args.data.score).toBe(40);
    expect(args.data.factors).toEqual([newScorerFactor]);
  });

  it('does not write when the score moved 10 points or less', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 45,
      factors: [trouble],
      status: 'open',
    } as any);

    await persistAtRiskAlert(score({ score: 40 }));

    expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
    expect(prisma.atRiskAlert.create).not.toHaveBeenCalled();
  });

  it('skips the write when a preserved alert would not change, so updatedAt is not bumped nightly', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [newScorerFactor, trouble],
      status: 'open',
    } as any);

    await persistAtRiskAlert(score({ score: 40, factors: [newScorerFactor] }));

    expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
  });

  it('skips the write when only the key order differs (jsonb read-back vs scorer-built factors)', async () => {
    // Postgres jsonb returns keys as name, weight, description; the scorer
    // builds factors as { ...FACTORS.X, name } = weight, description, name.
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [
        { name: 'NO_LOGIN_14_DAYS', weight: 40, description: 'No login in 14 days' },
        trouble,
      ],
      status: 'open',
    } as any);

    await persistAtRiskAlert(
      score({
        score: 40,
        factors: [{ weight: 40, description: 'No login in 14 days', name: 'NO_LOGIN_14_DAYS' }],
      }),
    );

    expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
  });

  it('still writes a preserved alert when a scorer factor value changed', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      score: 75,
      factors: [{ name: 'NO_LOGIN_7_DAYS', weight: 25, description: 'No login in 7 days' }, trouble],
      status: 'open',
    } as any);

    await persistAtRiskAlert(
      score({
        score: 40,
        factors: [{ weight: 40, description: 'No login in 14 days', name: 'NO_LOGIN_14_DAYS' }],
      }),
    );

    expect(prisma.atRiskAlert.update).toHaveBeenCalledTimes(1);
    const args = vi.mocked(prisma.atRiskAlert.update).mock.calls[0]![0] as any;
    expect(args.data.score).toBe(75);
    expect(args.data.factors).toEqual([
      { weight: 40, description: 'No login in 14 days', name: 'NO_LOGIN_14_DAYS' },
      trouble,
    ]);
  });

  it('create branch is unchanged', async () => {
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue(null);

    await persistAtRiskAlert(score({ score: 55, factors: [newScorerFactor] }));

    expect(prisma.atRiskAlert.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', score: 55, factors: [newScorerFactor], status: 'open' },
    });
  });
});

describe('member-reported factor helpers', () => {
  it('lists exactly the factor names written by escalateToCounselor today', () => {
    expect([...MEMBER_REPORTED_FACTOR_NAMES]).toEqual([
      'first90_trouble_reported',
      'placement_survey_job_loss_reported',
    ]);
  });

  it('returns [] / false for null, undefined and non-array input', () => {
    for (const input of [null, undefined, 'first90_trouble_reported', 42, { name: 'first90_trouble_reported' }]) {
      expect(memberReportedFactors(input)).toEqual([]);
      expect(hasMemberReportedFactor(input)).toBe(false);
    }
  });

  it('skips malformed entries', () => {
    const input = [
      null,
      'first90_trouble_reported',
      42,
      [],
      {},
      { name: 42 },
      { description: 'no name' },
      { name: 'member_help_request' },
      oldScorerFactor,
    ];
    expect(memberReportedFactors(input)).toEqual([]);
    expect(hasMemberReportedFactor(input)).toBe(false);
  });

  it('returns only the member-reported entries from valid input, preserving their fields', () => {
    const input = [oldScorerFactor, trouble, null, jobLoss];
    expect(memberReportedFactors(input)).toEqual([trouble, jobLoss]);
    expect(hasMemberReportedFactor(input)).toBe(true);
    expect(hasMemberReportedFactor([{ name: 'placement_survey_job_loss_reported' }])).toBe(true);
  });
});
