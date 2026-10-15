import { describe, expect, it, vi } from 'vitest';
import { loadAttentionFacts } from '@/lib/attention/loadFacts';
import { buildAttentionQueue } from '@/lib/attention/evaluate';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT } from '@/lib/member/confirmedProgramAssignment';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

const now = new Date('2026-10-15T12:00:00Z');
const old = new Date('2026-08-01T12:00:00Z');
const recent = new Date('2026-10-14T12:00:00Z');
const program = 'comptia-a-professional-certificate';
const enrollment = (isPrimary: boolean) => ({ programSlug: program, curriculumVersion: 'legacy-v1', isPrimary, enrolledAt: recent });

describe('attention assignment facts', () => {
  it('uses the exact confirmed assignment and its date without changing risk or quiet thresholds', async () => {
    const base = {
      fullName: 'Synthetic learner', email: 'learner@example.invalid', createdAt: old,
      enrolledAt: old, staleTrainingDetectedAt: null, needsComputerSupportFollowUp: false,
      profile: { resumeOriginalPath: 'synthetic-resume', resumeEnhancedPath: null },
    };
    const members = [
      { ...base, id: 'primary', enrolledProgram: null, courseEnrollments: [enrollment(true)] },
      { ...base, id: 'alias', enrolledProgram: 'comptia-a-plus', courseEnrollments: [enrollment(false)] },
      { ...base, id: 'unresolved', enrolledProgram: 'stale-other-program', courseEnrollments: [enrollment(false)] },
      { ...base, id: 'history', enrolledProgram: null, courseEnrollments: [enrollment(false)] },
      { ...base, id: 'legacy', enrolledProgram: program, courseEnrollments: [] },
    ];
    const db = {
      user: { findMany: vi.fn().mockResolvedValue(members) },
      counselorAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      application: { findMany: vi.fn().mockResolvedValue([]) },
      atRiskAlert: { findMany: vi.fn().mockResolvedValue(members.map((member) => ({ id: `alert-${member.id}`, userId: member.id, score: 75, status: 'open' }))) },
      memberEvent: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    };
    const facts = await loadAttentionFacts(members.map((member) => member.id), now, db as never);
    expect(facts.map((fact) => [fact.memberId, fact.enrolledProgram, fact.enrolledAt])).toEqual([
      ['primary', program, recent], ['alias', program, recent],
      ['unresolved', null, null], ['history', null, null], ['legacy', program, old],
    ]);
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: members.map((member) => member.id) }, deletedAt: null, ...MEMBER_ONLY_WHERE },
      select: expect.objectContaining({ courseEnrollments: CONFIRMED_PROGRAM_ENROLLMENTS_SELECT }),
    }));
    const queue = buildAttentionQueue(facts, now);
    expect(queue.totals.enrolled).toBe(3);
    expect(queue.rows.filter((row) => row.reasons.includes('risk_alert')).map((row) => row.memberId).sort()).toEqual(['alias', 'legacy', 'primary']);
    expect(queue.rows.find((row) => row.memberId === 'legacy')?.reasons).toContain('no_activity_30d');
    for (const id of ['primary', 'alias']) expect(queue.rows.find((row) => row.memberId === id)?.reasons).not.toContain('no_activity_30d');
    // Existing statement binding stays text[], and an empty roster never queries.
    for (const [sql] of db.$queryRawUnsafe.mock.calls) expect(sql).toContain('$1::text[]');
    expect(await loadAttentionFacts([], now, db as never)).toEqual([]);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });
});
