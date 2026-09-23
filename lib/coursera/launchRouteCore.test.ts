import test from 'node:test';
import assert from 'node:assert/strict';
import { getProgramBySlug } from '@/lib/content/programs';
import { createCourseraLaunchHandler, type CourseraLaunchDependencies } from './launchRouteCore';

type RedirectResult = { redirectedTo: string };
type TestProgram = {
  courses: Array<{
    slug: string;
    kind?: 'coursera' | 'workforceap';
    courseraSlug?: string;
    courseraCourseId?: string;
  }>;
};

const redirect = (url: URL | string): RedirectResult => ({ redirectedTo: String(url) });

function makeDeps(
  overrides: Partial<CourseraLaunchDependencies<RedirectResult, TestProgram>> = {},
): CourseraLaunchDependencies<RedirectResult, TestProgram> {
  return {
    getUser: async () => ({ id: 'user-1', email: 'member@example.org' }),
    findUser: async () => ({
      enrolledProgram: 'it-support-professional-certificate-ibm',
      organizationId: 'org-1',
      courseProgress: [],
    }),
    resolveActiveProgram: async (_userId, legacyEnrolledProgram) => legacyEnrolledProgram,
    findCourse: async () => null,
    findFirstCourse: async () => null,
    getProgramBySlug: () => ({
      courses: [
        { slug: 'first-course' },
        { slug: 'second-course' },
      ],
    }),
    getApprovedCurriculumTrack: () => null,
    getFirstIncompleteCourseIndex: () => 0,
    getCourseraConfig: () => ({
      courseIdMap: { 'it-support-professional-certificate-ibm': ['course-id-1', 'course-id-2'] },
    }),
    buildCourseraLaunchUrl: () => null,
    getDiscoveredProgram: () => null,
    getOrgScopedCourseUrl: async () => 'https://www.coursera.org/programs/org-program/learn/course-id-2',
    getOrgScopedProgramUrl: async () => null,
    localFallbackUrl: (slug: string, kind: 'course' | 'specialization') =>
      `https://www.coursera.org/${kind === 'specialization' ? 'specializations' : 'learn'}/${slug}`,
    redirect,
    ...overrides,
  };
}

test('Coursera launch route redirects unauthenticated members to login and back to My Program', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({ getUser: async () => null }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(res.redirectedTo, 'https://workforceap.test/login?redirectTo=%2Fdashboard%2Fprogram');
});

test('Coursera launch route keeps the requested course through a signed-out login', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({ getUser: async () => null }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=second-course',
  ));

  const loginUrl = new URL(res.redirectedTo);
  assert.equal(loginUrl.pathname, '/login');
  assert.equal(loginUrl.searchParams.get('redirectTo'), '/dashboard/program?course=second-course');
});

test('Coursera launch route uses DB course override for requested course deep link', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    findCourse: async () => ({ courseraSlug: 'db-course-slug', courseraUrlType: 'specialization' }),
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch?course=second-course'));

  assert.equal(res.redirectedTo, 'https://www.coursera.org/specializations/db-course-slug');
});

test('Coursera launch route passes discovered course slug to the org-scoped resolver', async () => {
  let resolvedArgs: [string, string, string] | null = null;
  const handler = createCourseraLaunchHandler(makeDeps({
    getDiscoveredProgram: () => ({
      courses: [{ slug: 'second-course', courseId: 'course-id-2' }],
    }),
    getOrgScopedCourseUrl: async (programSlug, courseId, courseSlug) => {
      resolvedArgs = [programSlug, courseId, courseSlug];
      return `https://www.coursera.org/learn/${courseSlug}`;
    },
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch?course=second-course'));

  assert.deepEqual(resolvedArgs, [
    'it-support-professional-certificate-ibm',
    'course-id-2',
    'second-course',
  ]);
  assert.equal(res.redirectedTo, 'https://www.coursera.org/learn/second-course');
});

test('Coursera launch route uses an approved syllabus slug before a stale index mapping', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    getProgramBySlug: () => ({
      courses: [
        {
          slug: 'introduction-to-management-consulting',
          courseraSlug: 'introduction-to-management-consulting',
        },
      ],
    }),
    getCourseraConfig: () => ({
      courseIdMap: {
        'it-support-professional-certificate-ibm': ['retired-course-at-the-same-index'],
      },
    }),
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=introduction-to-management-consulting',
  ));

  assert.equal(
    res.redirectedTo,
    'https://www.coursera.org/learn/introduction-to-management-consulting',
  );
});

test('Coursera launch route uses configured course mapping for a requested course', async () => {
  const handler = createCourseraLaunchHandler(makeDeps());

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch?course=second-course'));

  assert.equal(
    res.redirectedTo,
    'https://www.coursera.org/programs/org-program/learn/course-id-2',
  );
});

test('Coursera launch route keeps an unmapped requested course inside WorkforceAP', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    getCourseraConfig: () => ({ courseIdMap: {} }),
    getOrgScopedProgramUrl: async () => 'https://www.coursera.org/',
    buildCourseraLaunchUrl: () => 'https://www.coursera.org/',
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch?course=second-course'));

  assert.equal(
    res.redirectedTo,
    'https://workforceap.test/dashboard/training?error=launch_failed&course=second-course',
  );
});

test('Coursera launch route rejects a hand-edited course outside the assigned curriculum', async () => {
  let courseLookupCalled = false;
  const handler = createCourseraLaunchHandler(makeDeps({
    findCourse: async () => {
      courseLookupCalled = true;
      return { courseraSlug: 'retired-course' };
    },
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=retired-course',
  ));

  assert.equal(courseLookupCalled, false);
  assert.equal(
    res.redirectedTo,
    'https://workforceap.test/dashboard/training?error=course_not_assigned&course=retired-course',
  );
});

test('Coursera launch route keeps an assigned WorkforceAP lab inside the portal', async () => {
  let providerLookupCalled = false;
  const handler = createCourseraLaunchHandler(makeDeps({
    getProgramBySlug: () => ({
      courses: [{ slug: 'local-lab', kind: 'workforceap' }],
    }),
    getCourseraConfig: () => ({
      courseIdMap: { 'it-support-professional-certificate-ibm': ['stale-provider-id'] },
    }),
    getOrgScopedCourseUrl: async () => {
      providerLookupCalled = true;
      return 'https://www.coursera.org/learn/wrong-course';
    },
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=local-lab',
  ));

  assert.equal(providerLookupCalled, false);
  assert.equal(
    res.redirectedTo,
    'https://workforceap.test/dashboard/learning/modules/local-lab?program=it-support-professional-certificate-ibm',
  );
});

for (const programSlug of [
  'certified-production-technician-cpt',
  'certified-logistics-technician-clt',
]) {
  test(`Coursera launch route keeps every ${programSlug} course local`, async () => {
    const catalogProgram = getProgramBySlug(programSlug);
    assert.ok(catalogProgram);
    let providerLookupCount = 0;
    const providerLookup = async () => {
      providerLookupCount += 1;
      return 'https://www.coursera.org/learn/wrong-course';
    };
    const handler = createCourseraLaunchHandler(makeDeps({
      findUser: async () => ({
        enrolledProgram: programSlug,
        organizationId: 'org-1',
        courseProgress: [],
      }),
      resolveActiveProgram: async () => programSlug,
      getProgramBySlug: () => ({ courses: catalogProgram.courses }),
      getOrgScopedCourseUrl: providerLookup,
      getOrgScopedProgramUrl: providerLookup,
      buildCourseraLaunchUrl: () => 'https://www.coursera.org/learn/wrong-course',
    }));

    for (const course of catalogProgram.courses) {
      const res = await handler(new Request(
        `https://workforceap.test/api/member/coursera/launch?course=${course.slug}`,
      ));
      assert.equal(
        res.redirectedTo,
        `https://workforceap.test/dashboard/learning/modules/${course.slug}?program=${programSlug}`,
      );
      assert.doesNotMatch(res.redirectedTo, /coursera/i);
    }
    assert.equal(providerLookupCount, 0);
  });
}

test('Coursera launch route blocks a dormant approved curriculum before provider lookup', async () => {
  let providerLookupCalled = false;
  const programSlug = 'data-analytics-professional-certificate-google';
  const handler = createCourseraLaunchHandler(makeDeps({
    findUser: async () => ({
      enrolledProgram: programSlug,
      organizationId: 'org-1',
      courseEnrollments: [{
        programSlug,
        curriculumVersion: '2026-approved-v2',
      }],
      courseProgress: [],
    }),
    resolveActiveProgram: async () => programSlug,
    getProgramBySlug: () => ({
      courses: [{
        slug: 'introduction-to-management-consulting',
        kind: 'coursera',
        courseraCourseId: 'provider-id',
      }],
    }),
    getApprovedCurriculumTrack: () => ({
      status: 'pending',
      collectionId: null,
      assignmentMode: 'disabled',
    }),
    findCourse: async () => {
      providerLookupCalled = true;
      return { courseraSlug: 'wrong-course' };
    },
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=introduction-to-management-consulting',
  ));

  assert.equal(providerLookupCalled, false);
  assert.equal(
    res.redirectedTo,
    'https://workforceap.test/dashboard/training?error=curriculum_track_pending&course=introduction-to-management-consulting',
  );
});

test('Coursera launch route pins an approved course to its validated collection id', async () => {
  const programSlug = 'data-analytics-professional-certificate-google';
  let launchArgs: [string, string, string, (string | null)?] | null = null;
  const handler = createCourseraLaunchHandler(makeDeps({
    findUser: async () => ({
      enrolledProgram: programSlug,
      organizationId: 'org-1',
      courseEnrollments: [{
        programSlug,
        curriculumVersion: '2026-approved-v2',
      }],
      courseProgress: [],
    }),
    resolveActiveProgram: async () => programSlug,
    getApprovedCurriculumTrack: () => ({
      status: 'validated',
      collectionId: 'approved-collection-id',
      assignmentMode: 'disabled',
    }),
    getProgramBySlug: () => ({
      courses: [{
        slug: 'introduction-to-management-consulting',
        kind: 'coursera',
        courseraCourseId: 'approved-provider-id',
        courseraSlug: 'introduction-to-management-consulting',
      }],
    }),
    getOrgScopedCourseUrl: async (...args) => {
      launchArgs = args;
      return 'https://www.coursera.org/programs/approved-track/learn/course';
    },
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=introduction-to-management-consulting',
  ));

  assert.deepEqual(launchArgs, [
    programSlug,
    'approved-provider-id',
    'introduction-to-management-consulting',
    'approved-collection-id',
  ]);
  assert.equal(
    res.redirectedTo,
    'https://www.coursera.org/programs/approved-track/learn/course',
  );
});

test('Coursera launch route fails closed when a validated collection disappears', async () => {
  const programSlug = 'data-analytics-professional-certificate-google';
  const handler = createCourseraLaunchHandler(makeDeps({
    findUser: async () => ({
      enrolledProgram: programSlug,
      organizationId: 'org-1',
      courseEnrollments: [{
        programSlug,
        curriculumVersion: '2026-approved-v2',
      }],
      courseProgress: [],
    }),
    resolveActiveProgram: async () => programSlug,
    getApprovedCurriculumTrack: () => ({
      status: 'validated',
      collectionId: 'missing-approved-collection',
      assignmentMode: 'disabled',
    }),
    getProgramBySlug: () => ({
      courses: [{
        slug: 'introduction-to-management-consulting',
        kind: 'coursera',
        courseraCourseId: 'approved-provider-id',
        courseraSlug: 'introduction-to-management-consulting',
      }],
    }),
    getOrgScopedCourseUrl: async () => null,
    getOrgScopedProgramUrl: async () => null,
  }));

  const res = await handler(new Request(
    'https://workforceap.test/api/member/coursera/launch?course=introduction-to-management-consulting',
  ));

  assert.equal(
    res.redirectedTo,
    'https://workforceap.test/dashboard/training?error=launch_failed&course=introduction-to-management-consulting',
  );
});

test('Coursera launch route prefers the assigned curriculum provider id over an index map', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    getProgramBySlug: () => ({
      courses: [{ slug: 'first-course', courseraCourseId: 'approved-provider-id' }],
    }),
    getCourseraConfig: () => ({
      courseIdMap: {
        'it-support-professional-certificate-ibm': ['retired-index-id'],
      },
    }),
    buildCourseraLaunchUrl: ({ currentCourseId }) =>
      `https://www.coursera.org/programs/org/learn/${currentCourseId}`,
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(
    res.redirectedTo,
    'https://www.coursera.org/programs/org/learn/approved-provider-id',
  );
});

test('Coursera launch route uses active dashboard program instead of legacy enrolledProgram', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    resolveActiveProgram: async () => 'cybersecurity-professional-certificate-google',
    getCourseraConfig: () => ({
      courseIdMap: { 'cybersecurity-professional-certificate-google': ['active-course-id'] },
    }),
    buildCourseraLaunchUrl: ({ programSlug, currentCourseId }) =>
      `https://www.coursera.org/programs/${programSlug}/learn/${currentCourseId}`,
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(
    res.redirectedTo,
    'https://www.coursera.org/programs/cybersecurity-professional-certificate-google/learn/active-course-id',
  );
});

test('Coursera launch route falls through to resolved configured launch URL', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    buildCourseraLaunchUrl: () => 'https://www.coursera.org/programs/configured-program/learn/course',
    getOrgScopedProgramUrl: async () => 'https://www.coursera.org/programs/org-program',
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(res.redirectedTo, 'https://www.coursera.org/programs/configured-program/learn/course');
});

test('Coursera launch route replaces useless Coursera program fallback with first org course URL', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    getOrgScopedProgramUrl: async () => 'https://www.coursera.org/programs/it-support-professional-certificate-ibm',
    findFirstCourse: async () => ({ courseraSlug: 'first-course-slug', courseraUrlType: 'learn' }),
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(res.redirectedTo, 'https://www.coursera.org/learn/first-course-slug');
});

test('Coursera launch route redirects to training error when no launch URL resolves', async () => {
  const handler = createCourseraLaunchHandler(makeDeps({
    buildCourseraLaunchUrl: () => null,
    getOrgScopedProgramUrl: async () => null,
  }));

  const res = await handler(new Request('https://workforceap.test/api/member/coursera/launch'));

  assert.equal(res.redirectedTo, 'https://workforceap.test/dashboard/training?error=launch_failed');
});
