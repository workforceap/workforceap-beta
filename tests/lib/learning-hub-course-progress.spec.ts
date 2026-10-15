import { describe, expect, it } from 'vitest';
import type { ProgramCourse } from '@/lib/content/programs';
import { buildLearningHubCourseProgress } from '@/lib/member/learningHubCourseProgress';

const programSlug = 'software-developer-professional-certificate-ibm';
const courses: ProgramCourse[] = [
  { slug: 'course-a', name: 'Course A', estimatedHours: 10, courseraCourseId: 'id-a' },
  { slug: 'course-b', name: 'Course B', estimatedHours: 10, courseraCourseId: 'id-b' },
];
const local = (overrides: Record<string, unknown> = {}) => ({
  programSlug, courseSlug: 'course-a', courseId: 'id-a', status: 'IN_PROGRESS' as const,
  percentComplete: 55, scoreScaled: 0.85, ...overrides,
});
const provider = (overrides: Record<string, unknown> = {}) => ({
  programSlug, courseraCourseId: 'id-a', overallProgress: '45.50', isCompleted: false,
  isRemovedFromProgram: false, courseGrade: '77.5%', ...overrides,
});
const build = (overrides: Partial<Parameters<typeof buildLearningHubCourseProgress>[0]> = {}) =>
  buildLearningHubCourseProgress({ programSlug, courses, courseProgress: [], courseraProgress: [], ...overrides });

describe('Learning Hub persisted course progress', () => {
  it('keeps partial local progress, grades and completed rows', () => {
    const view = build({ courseProgress: [local(), local({ courseSlug: 'course-b', courseId: 'id-b', status: 'COMPLETED', percentComplete: 80 })] });
    expect(view.progressBySlug['course-a']).toEqual({ status: 'IN_PROGRESS', percentComplete: 55, gradePercent: 85 });
    expect(view.progressBySlug['course-b']).toEqual({ status: 'COMPLETED', percentComplete: 100, gradePercent: 85 });
    expect(view.completedSlugs).toEqual(['course-b']);
    expect(view.enrolledCourseraCourseIds).toEqual([]);
  });

  it('normalizes provider IDs and decimal values without passing Decimal objects to the client', () => {
    const view = build({ courseraProgress: [provider({ courseraCourseId: 'Course~id-a', overallProgress: { valueOf: () => 45.5 } })] });
    expect(view.progressBySlug['course-a']).toEqual({ status: 'IN_PROGRESS', percentComplete: 46, gradePercent: 77.5 });
    expect(view.enrolledCourseraCourseIds).toEqual(['id-a']);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('keeps enrollment separate from progress for a provider course at zero percent', () => {
    const view = build({ courseraProgress: [provider({ overallProgress: 0, courseGrade: null })] });
    expect(view.progressBySlug['course-a']).toEqual({ status: 'NOT_STARTED', percentComplete: 0, gradePercent: null });
    expect(view.enrolledCourseraCourseIds).toEqual(['id-a']);
    expect(view.completedSlugs).toEqual([]);
  });

  it('credits a stale local slug only to the pinned course with the matching provider ID', () => {
    const view = build({ courseProgress: [local({ courseId: 'Course~id-b', status: 'COMPLETED' })] });
    expect(view.completedSlugs).toEqual(['course-b']);
    expect(view.progressBySlug['course-a']).toEqual({ status: 'NOT_STARTED', percentComplete: 0, gradePercent: null });
    expect(view.progressBySlug['course-b']).toEqual({ status: 'COMPLETED', percentComplete: 100, gradePercent: 85 });
  });

  it('excludes secondary-program progress, removed enrollments and retired curriculum IDs', () => {
    const secondary = 'it-support-professional-certificate-ibm';
    const view = build({
      courseProgress: [local({ programSlug: secondary }), local({ courseId: 'retired-id', status: 'COMPLETED' })],
      courseraProgress: [provider({ programSlug: secondary }), provider({ isRemovedFromProgram: true }), provider({ courseraCourseId: 'retired-id', isCompleted: true })],
    });
    expect(view.completedSlugs).toEqual([]);
    expect(view.enrolledCourseraCourseIds).toEqual([]);
    expect(view.progressBySlug['course-a']).toEqual({ status: 'NOT_STARTED', percentComplete: 0, gradePercent: null });
  });

  it('supports equivalent program aliases without downgrading local completion', () => {
    const view = build({
      courseProgress: [local({ programSlug: 'ai-and-software-development-professional-certificate-ibm', status: 'COMPLETED' })],
      courseraProgress: [provider({ overallProgress: 35 })],
    });
    expect(view.completedSlugs).toEqual(['course-a']);
    expect(view.progressBySlug['course-a'].percentComplete).toBe(100);
  });

  it('accepts local in-house progress without a provider ID and returns no progress without a program', () => {
    const inHouse = { slug: 'module-a', name: 'Module A', estimatedHours: 1, kind: 'workforceap' as const };
    const view = build({ courses: [inHouse], courseProgress: [local({ courseSlug: 'module-a', courseId: null })] });
    expect(view.progressBySlug['module-a'].percentComplete).toBe(55);
    expect(build({ programSlug: null, courseProgress: [local()] })).toEqual({ progressBySlug: {}, completedSlugs: [], enrolledCourseraCourseIds: [] });
  });
});
