import { describe, expect, it } from 'vitest';
import { resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';
import { enrollmentHistoryWhere, resolvePlacementEnrollment } from '@/lib/reporting/enrollmentHistory';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
const OLD = new Date('2026-01-01');
const SAVED = new Date('2026-10-15');
const PROGRAM = 'comptia-a-professional-certificate';
const ce = (programSlug = PROGRAM, isPrimary = false) => ({ programSlug, isPrimary, curriculumVersion: '2026-approved-v2', enrolledAt: SAVED });

describe('confirmed current assignment and history have distinct read contracts', () => {
  it('prefers the primary program and its own date/version over a mismatched legacy pointer', () => {
    expect(resolveConfirmedProgramAssignment({ enrolledProgram: 'other', enrolledAt: OLD, courseEnrollments: [ce('other'), ce(PROGRAM, true)] })).toEqual({ programSlug: PROGRAM, curriculumVersion: '2026-approved-v2', enrolledAt: SAVED });
  });
  it('keeps alias-matched unmarked assignments pinned, and preserves legacy-only compatibility', () => {
    expect(resolveConfirmedProgramAssignment({ enrolledProgram: 'comptia-a-plus', enrolledAt: OLD, courseEnrollments: [ce()] })).toEqual({ programSlug: PROGRAM, curriculumVersion: '2026-approved-v2', enrolledAt: SAVED });
    expect(resolveConfirmedProgramAssignment({ enrolledProgram: 'unknown-program', enrolledAt: OLD, courseEnrollments: [] })).toEqual({ programSlug: 'unknown-program', curriculumVersion: 'legacy-v1', enrolledAt: OLD });
  });
  it.each([null, 'unrelated-stale-pointer'])('keeps nonprimary history unresolved for legacy pointer %j', (enrolledProgram) => {
    expect(resolveConfirmedProgramAssignment({ enrolledProgram, enrolledAt: OLD, courseEnrollments: [ce()] })).toEqual({ programSlug: null, curriculumVersion: null, enrolledAt: null });
  });
  it('does not manufacture a current date when neither the matching row nor legacy pointer supplies it', () => {
    expect(resolveConfirmedProgramAssignment({ enrolledProgram: 'other', enrolledAt: OLD, courseEnrollments: [{ ...ce(PROGRAM, true), enrolledAt: null }] }).enrolledAt).toBeNull();
  });
  it('filters historical enrollment dates on the same row and ignores stale legacy dates when rows exist', () => {
    const where = enrollmentHistoryWhere({ gte: SAVED });
    expect(matchesWhere({ enrolledProgram: null, courseEnrollments: [ce()] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: PROGRAM, enrolledAt: SAVED, courseEnrollments: [{ ...ce(), enrolledAt: OLD }] }, where)).toBe(false);
    expect(matchesWhere({ enrolledProgram: PROGRAM, enrolledAt: SAVED, courseEnrollments: [] }, where)).toBe(true);
  });
  it('respects recorded placement program and leaves its date unknown when no matching history exists', () => {
    expect(resolvePlacementEnrollment([{ programSlug: PROGRAM, enrolledAt: OLD }], SAVED, PROGRAM, OLD, 'other')).toBeNull();
  });
});
