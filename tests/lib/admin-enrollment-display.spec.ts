import { describe, expect, it } from 'vitest';
import { memberEnrollmentFilterWhere } from '@/lib/admin/memberEnrollmentFilters';
import { buildCourseraXapiCourseLog, type XapiCourseLogMember, type XapiCourseLogProgress } from '@/lib/admin/courseraXapiCourseLog';
import { getProgramBySlug } from '@/lib/content/programs';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
import { countConfirmedProgramEnrollments } from '@/lib/admin/confirmedEnrollmentCounts';

const program = 'comptia-a-professional-certificate';
const enrollment = (programSlug = program, date = '2026-10-15T12:00:00Z', isPrimary = true) => ({ programSlug, enrolledAt: new Date(date), curriculumVersion: 'legacy-v1', isPrimary });

describe('member directory and CSV enrollment filters', () => {
  it('admits canonical and alias programs from durable or legacy-only assignments', () => {
    const where = memberEnrollmentFilterWhere({ program: 'comptia-a-plus' });
    expect(matchesWhere({ enrolledProgram: null, courseEnrollments: [enrollment()] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: null, courseEnrollments: [enrollment('comptia-a-plus')] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: program, courseEnrollments: [] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: 'comptia-a-plus', courseEnrollments: [] }, where)).toBe(true);
  });

  it('keeps secondary enrollment matches but does not revive stale legacy assignments', () => {
    const where = memberEnrollmentFilterWhere({ program });
    const other = enrollment('other-program');
    expect(matchesWhere({ enrolledProgram: 'other-program', courseEnrollments: [other, enrollment(program, undefined, false)] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: program, courseEnrollments: [other] }, where)).toBe(false);
  });

  it('requires program and dates on the same enrollment rather than different programs', () => {
    const where = memberEnrollmentFilterWhere({ program, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(matchesWhere({ enrolledProgram: null, enrolledAt: null, courseEnrollments: [enrollment()] }, where)).toBe(true);
    expect(matchesWhere({ enrolledProgram: null, enrolledAt: null, courseEnrollments: [enrollment(program, '2026-09-01'), enrollment('other-program')] }, where)).toBe(false);
    expect(matchesWhere({ enrolledProgram: program, enrolledAt: new Date('2026-10-15'), courseEnrollments: [enrollment(program, '2026-09-01')] }, where)).toBe(false);
    expect(matchesWhere({ enrolledProgram: program, enrolledAt: new Date('2026-10-15'), courseEnrollments: [] }, where)).toBe(true);
  });

  it('includes the full UTC end date and ignores invalid date parameters consistently', () => {
    const where = memberEnrollmentFilterWhere({ startDate: '2026-10-15', endDate: '2026-10-15' });
    for (const at of ['2026-10-15T00:00:00Z', '2026-10-15T23:59:59.999Z']) {
      expect(matchesWhere({ courseEnrollments: [enrollment(program, at)] }, where)).toBe(true);
    }
    expect(matchesWhere({ courseEnrollments: [enrollment(program, '2026-10-16T00:00:00Z')] }, where)).toBe(false);
    expect(memberEnrollmentFilterWhere({ startDate: 'invalid', endDate: 'invalid' })).toEqual({});
    expect(memberEnrollmentFilterWhere({})).toEqual({});
  });
});

const learner = (overrides: Partial<XapiCourseLogMember> = {}): XapiCourseLogMember => ({
  id: 'learner-1', fullName: 'Synthetic learner', email: 'learner@example.invalid', enrolledProgram: null, courseEnrollments: [], ...overrides,
});
const observed = (overrides: Partial<XapiCourseLogProgress> = {}): XapiCourseLogProgress => ({
  userId: 'learner-1', programSlug: program, courseSlug: 'observed-course', courseId: null,
  status: 'IN_PROGRESS', percentComplete: 45, lastUpdatedAt: new Date('2026-10-15'), lastActivityAt: new Date('2026-10-14'), ...overrides,
});

describe('Coursera xAPI course log assignment and observation boundaries', () => {
  it('lists the pinned curriculum for a durable-only primary enrollment', () => {
    const slug = 'ux-design-professional-certificate-google';
    const courses = getProgramCoursesForCurriculumVersion(getProgramBySlug(slug)!, '2026-approved-v2');
    const member = learner({ courseEnrollments: [{ programSlug: slug, curriculumVersion: '2026-approved-v2', isPrimary: true }] });
    const rows = buildCourseraXapiCourseLog([member], [observed({ programSlug: slug, courseSlug: courses[0].slug, courseId: courses[0].courseraCourseId ?? null })]);
    expect(rows.map((row) => row.courseSlug)).toEqual(courses.map((course) => course.slug));
    expect(rows[0].percentComplete).toBe(45);
    expect(rows[0].programTitle).toBe(getProgramBySlug(slug)!.title);
  });

  it('shows unassigned progress as observed activity without inventing a full assignment', () => {
    const member = learner();
    const rows = buildCourseraXapiCourseLog([member], [observed()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].programTitle).toMatch(/observed activity/);
    expect(rows[0].percentComplete).toBe(45);
    expect(member.courseEnrollments).toEqual([]);
    expect(member.enrolledProgram).toBeNull();
  });

  it('leaves ambiguous unmarked enrollments unresolved and keeps secondary progress visible', () => {
    const member = learner({ courseEnrollments: [enrollment(program, undefined, false), enrollment('other-program', undefined, false)] });
    const rows = buildCourseraXapiCourseLog([member], [observed(), observed({ programSlug: 'other-program', courseSlug: 'other-course' })]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.programTitle.includes('observed activity'))).toBe(true);
    expect(rows.every((row) => row.status === 'IN_PROGRESS')).toBe(true);
  });

  it('binds alias program and provider IDs without double-crediting an old course slug', () => {
    const idProgram = 'software-developer-professional-certificate-ibm';
    const alias = 'ai-and-software-development-professional-certificate-ibm';
    const courses = getProgramCoursesForCurriculumVersion(getProgramBySlug(idProgram)!, 'legacy-v1');
    const bound = courses.find((course) => course.courseraCourseId)!;
    const rows = buildCourseraXapiCourseLog([learner({ enrolledProgram: alias })], [observed({ programSlug: alias, courseSlug: 'old-course-key', courseId: `Course~${bound.courseraCourseId}`, status: 'COMPLETED' })]);
    expect(rows).toHaveLength(courses.length);
    expect(rows.filter((row) => row.status === 'COMPLETED')).toHaveLength(1);
    expect(rows.find((row) => row.courseSlug === bound.slug)?.percentComplete).toBe(100);
  });
});

it('counts confirmed current assignments once and combines aliases without reviving unmarked history', () => {
  const rows = countConfirmedProgramEnrollments([
    { enrolledProgram: 'other-program', courseEnrollments: [enrollment()] },
    { enrolledProgram: 'comptia-a-plus', courseEnrollments: [] },
    { enrolledProgram: 'comptia-a-plus', courseEnrollments: [enrollment(program, undefined, false)] },
    { enrolledProgram: null, courseEnrollments: [enrollment(program, undefined, false)] },
    { enrolledProgram: 'stale-program', courseEnrollments: [enrollment(program, undefined, false)] },
  ]);
  expect(rows).toEqual([{ programSlug: program, count: 3 }]);
});
