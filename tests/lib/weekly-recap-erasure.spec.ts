// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeWrite: vi.fn(), upsert: vi.fn(), userFindUnique: vi.fn(), userFindMany: vi.fn(),
  computeScore: vi.fn(), scoreBreakdowns: vi.fn(),
}));
const empty = vi.hoisted(() => async () => []);
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
  goal: { findMany: empty }, jobApplication: { findMany: empty },
  aIToolResult: { findMany: empty }, resourceProgress: { findMany: empty },
  pathwayStepProgress: { findMany: empty }, userCertification: { findMany: empty },
  mentorSession: { findMany: empty }, job: { findMany: empty },
  memberPoints: { findUnique: async () => null, findMany: empty },
  pointsTransaction: { aggregate: async () => ({ _sum: { points: 0 } }), groupBy: empty },
  weeklyRecap: { upsert: mocks.upsert },
} }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));
vi.mock('@/lib/readiness/score', () => ({
  computeReadinessScore: mocks.computeScore, getScoreBreakdowns: mocks.scoreBreakdowns,
  sumReadinessPoints: vi.fn(() => 0),
}));
vi.mock('@/lib/member/nextBestActions', () => ({ buildNextBestActions: vi.fn(() => []) }));
vi.mock('@/lib/events/track', () => ({ persistEvent: vi.fn() }));

import { generateWeeklyRecap, generateWeeklyRecaps } from '@/lib/recap/generate';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const weekStart = new Date('2026-09-21T00:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userFindUnique.mockResolvedValue({ organizationId: 'org-1', enrolledProgram: null, courseEnrollments: [] });
  mocks.userFindMany.mockResolvedValue([{ id: 'member-1', organizationId: 'org-1', enrolledProgram: null, courseEnrollments: [] }]);
  mocks.computeScore.mockResolvedValue(0);
  mocks.scoreBreakdowns.mockResolvedValue(new Map());
  mocks.activeWrite.mockRejectedValue(new MemberLifecycleWriteError());
});

it('does not persist a recap when erasure wins after individual source reads', async () => {
  const recap = await generateWeeklyRecap('member-1', weekStart);
  expect(recap).toBeNull();
  expect(mocks.activeWrite).toHaveBeenCalledOnce();
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it('omits a stale batch result so the cron cannot email the original name', async () => {
  const result = await generateWeeklyRecaps([{
    id: 'member-1', email: 'synthetic@example.invalid', fullName: 'Original Name', enrolledProgram: null,
  }], weekStart);
  expect(result).toEqual([]);
  expect(mocks.activeWrite).toHaveBeenCalledOnce();
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it('returns a persisted batch recap for a member who stays active', async () => {
  mocks.upsert.mockResolvedValue({ id: 'recap-1' });
  mocks.activeWrite.mockImplementation(async (_id, write) => write({
    weeklyRecap: { upsert: mocks.upsert }, memberEvent: { create: vi.fn() },
  }));
  const result = await generateWeeklyRecaps([{
    id: 'member-1', email: 'synthetic@example.invalid', fullName: 'Original Name', enrolledProgram: null,
  }], weekStart);
  expect(result).toHaveLength(1);
  expect(result[0].userId).toBe('member-1');
  expect(mocks.upsert).toHaveBeenCalledOnce();
  expect(mocks.activeWrite).toHaveBeenCalledTimes(2); // Recap and best-effort event.
});
