import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { withPortalIntl } from '../helpers/withPortalIntl';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findEnrollment: vi.fn(),
  completeMemberCourse: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
  findLearningUser: vi.fn(),
  getCourses: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseEnrollment: { findUnique: mocks.findEnrollment },
    user: { findUnique: mocks.findLearningUser },
    pathwayStepProgress: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/member/courseCompletion', () => ({
  completeMemberCourse: mocks.completeMemberCourse,
}));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/content/learningPathways', () => ({ getPathwayForProgram: () => null }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ getProgramCoursesForCurriculumVersion: mocks.getCourses }));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: async () => null }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: async () => [] }));

import { DIGITAL_LITERACY_PROGRAM_SLUG } from '@/shared/digitalLiteracyPathway';
import { POST } from '@/app/api/member/courses/complete/route';
import LearningPage from '@/app/(portal)/dashboard/learning/page';
import LearningHubEnrolledCourses from '@/components/portal/LearningHubEnrolledCourses';

afterEach(cleanup);

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/member/courses/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/member/courses/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'user-1' });
    mocks.findEnrollment.mockResolvedValue({ programSlug: 'assigned-program' });
    mocks.completeMemberCourse.mockResolvedValue({ completed: true });
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockResolvedValue(undefined);
  });

  it('requires an explicit program slug before looking up an enrollment', async () => {
    const response = await POST(request({ courseSlug: 'course-1' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'programSlug is required' });
    expect(mocks.findEnrollment).not.toHaveBeenCalled();
    expect(mocks.completeMemberCourse).not.toHaveBeenCalled();
  });

  it('fails closed when the exact program is not assigned to the member', async () => {
    mocks.findEnrollment.mockResolvedValue(null);

    const response = await POST(request({
      courseSlug: 'course-1',
      programSlug: 'unassigned-program',
    }));

    expect(mocks.findEnrollment).toHaveBeenCalledWith({
      where: {
        userId_programSlug: {
          userId: 'user-1',
          programSlug: 'unassigned-program',
        },
      },
      select: { programSlug: true },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'This program is not assigned to your account.',
      code: 'PROGRAM_NOT_ASSIGNED',
    });
    expect(mocks.completeMemberCourse).not.toHaveBeenCalled();
  });

  it('completes against the exact authorized enrollment slug', async () => {
    mocks.findEnrollment.mockResolvedValue({ programSlug: 'assigned-alias' });

    const response = await POST(request({
      courseSlug: 'course-1',
      programSlug: 'assigned-alias',
    }));

    expect(response.status).toBe(200);
    expect(mocks.completeMemberCourse).toHaveBeenCalledWith({
      userId: 'user-1',
      courseSlug: 'course-1',
      resolvedProgramSlug: 'assigned-alias',
      source: 'member',
    });
  });

  it('records digital literacy completion without looking up an enrollment', async () => {
    mocks.findEnrollment.mockResolvedValue(null);

    const response = await POST(request({
      courseSlug: 'digital-literacy-empowerment-class-course-1',
      programSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
    }));

    expect(response.status).toBe(200);
    expect(mocks.findEnrollment).not.toHaveBeenCalled();
    expect(mocks.completeMemberCourse).toHaveBeenCalledWith({
      userId: 'user-1',
      courseSlug: 'digital-literacy-empowerment-class-course-1',
      resolvedProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
      source: 'member',
    });
  });

  it('does not treat nearby digital-literacy slugs as ungated', async () => {
    mocks.findEnrollment.mockResolvedValue(null);

    const response = await POST(request({
      courseSlug: 'digital-literacy-empowerment-class-course-1',
      programSlug: 'digital-literacy',
    }));

    expect(response.status).toBe(403);
    expect(mocks.findEnrollment).toHaveBeenCalled();
    expect(mocks.completeMemberCourse).not.toHaveBeenCalled();
  });

  it('still requires a signed-in member for ungated digital literacy', async () => {
    mocks.getUser.mockResolvedValue(null);

    const response = await POST(request({
      courseSlug: 'digital-literacy-empowerment-class-course-1',
      programSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
    }));

    expect(response.status).toBe(401);
    expect(mocks.findEnrollment).not.toHaveBeenCalled();
    expect(mocks.completeMemberCourse).not.toHaveBeenCalled();
  });
});

describe('Learning Hub completion identity contract', () => {
  const learningPage = readFileSync(
    join(process.cwd(), 'app/(portal)/dashboard/learning/page.tsx'),
    'utf8',
  );
  const enrolledCourses = readFileSync(
    join(process.cwd(), 'components/portal/LearningHubEnrolledCourses.tsx'),
    'utf8',
  );
  const trainingCourseList = readFileSync(
    join(process.cwd(), 'components/portal/TrainingCourseList.tsx'),
    'utf8',
  );

  it('renders the active enrollment curriculum and retains legacy fallback', () => {
    expect(learningPage).toContain('resolveActiveDashboardProgram({');
    expect(learningPage).toContain('curriculumVersion: true');
    expect(learningPage).toContain('activeEnrollment?.curriculumVersion');
    expect(learningPage).toContain('getProgramCoursesForCurriculumVersion(');
    expect(learningPage).toContain("activeEnrollment?.curriculumVersion ?? 'legacy-v1'");
  });

  it('mounts the enrolled course list once so real #course- anchors stay unique', async () => {
    const programSlug = 'it-support-professional-certificate-ibm';
    const courses = [
      { slug: 'fixture-first-course', name: 'First course', estimatedHours: 2 },
      { slug: 'fixture-second-course', name: 'Second course', estimatedHours: 3 },
    ];
    mocks.getUser.mockResolvedValue({ id: 'user-1' });
    mocks.findLearningUser.mockResolvedValue({
      enrolledProgram: programSlug,
      assessmentCompleted: true,
      courseraEnrollmentApproved: true,
      courseEnrollments: [{ id: 'enrollment-1', programSlug, isPrimary: true, curriculumVersion: 'fixture-v1', enrolledAt: new Date('2026-01-01') }],
      courseProgress: [],
      courseraCourseProgress: [],
    });
    mocks.getCourses.mockReturnValue(courses);
    const page = await LearningPage();
    const lists: ReactElement<ComponentProps<typeof LearningHubEnrolledCourses>>[] = [];
    const collectCourseLists = (node: ReactNode) => {
      Children.forEach(node, (child) => {
        if (!isValidElement<{ children?: ReactNode }>(child)) return;
        if (child.type === LearningHubEnrolledCourses) {
          lists.push(child as ReactElement<ComponentProps<typeof LearningHubEnrolledCourses>>);
        }
        collectCourseLists(child.props.children);
      });
    };
    collectCourseLists(page);
    expect(lists).toHaveLength(1);
    expect(lists[0].props).toEqual(expect.objectContaining({ programSlug, courses }));
    const { container } = render(withPortalIntl(lists[0]));
    expect([...container.querySelectorAll('[id^="course-"]')].map((course) => course.id)).toEqual([
      'course-fixture-first-course',
      'course-fixture-second-course',
    ]);
  });

  it('threads the exact program slug through the Hub list into completion POST', () => {
    expect(enrolledCourses).toContain('programSlug={programSlug}');
    expect(trainingCourseList).toContain(
      'body: JSON.stringify({ courseSlug: slug, programSlug })',
    );
  });
});

describe('Digital literacy ungating contract', () => {
  const completeRoute = readFileSync(
    join(process.cwd(), 'app/api/member/courses/complete/route.ts'),
    'utf8',
  );
  const modulePage = readFileSync(
    join(process.cwd(), 'app/(portal)/dashboard/learning/modules/[courseSlug]/page.tsx'),
    'utf8',
  );

  it('uses the shared ungated-program helper on both the page and completion API', () => {
    expect(completeRoute).toContain('isUngatedDigitalLiteracyProgram(programSlug)');
    expect(modulePage).toContain('isUngatedDigitalLiteracyProgram(requestedProgram)');
    expect(modulePage).toContain('if (!ungatedProgram)');
    expect(modulePage).toContain('courseEnrollment.findMany');
  });
});
