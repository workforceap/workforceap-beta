import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { buildCourseraLaunchUrl, getCourseraConfig } from '@/lib/coursera/config';
import { getProgramBySlug as getCatalogProgramBySlug } from '@/lib/content/programs';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import {
  getOrgScopedCourseUrl,
  getOrgScopedProgramUrl,
  localFallbackUrl,
} from '@/lib/coursera/orgScopedUrls';
import { createCourseraLaunchHandler } from '@/lib/coursera/launchRouteCore';
import { getFirstIncompleteCourseIndex } from '@/lib/member/courseraCourseProgress';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { getProgramCurriculumManifest } from '@/lib/content/programCurriculumManifest';

const courseraLaunchHandler = createCourseraLaunchHandler({
  getUser,
  findUser: (userId: string) => prisma.user.findUnique({
    where: { id: userId },
    select: {
      enrolledProgram: true,
      organizationId: true,
      courseEnrollments: {
        select: { programSlug: true, curriculumVersion: true },
      },
      courseProgress: {
        where: { status: 'COMPLETED' },
        select: { programSlug: true, courseSlug: true },
      },
    },
  }),
  resolveActiveProgram: async (userId: string, _legacy: string | null, requestedProgramSlug?: string | null) => {
    const activeProgramView = await getActiveProgramForDashboard({ userId, requestedProgramSlug });
    return activeProgramView.activeProgramSlug;
  },
  findCourse: ({ organizationId, programSlug, courseSlug }) => prisma.course.findUnique({
    where: {
      organizationId_programSlug_courseSlug: {
        organizationId,
        programSlug,
        courseSlug,
      },
    },
    select: { courseraSlug: true, courseraUrlType: true },
  }),
  findFirstCourse: ({ organizationId, programSlug }) => prisma.course.findFirst({
    where: {
      organizationId,
      programSlug,
      courseraSlug: { not: null },
    },
    orderBy: { displayOrder: 'asc' },
    select: { courseraSlug: true, courseraUrlType: true },
  }),
  getProgramBySlug: (programSlug: string, curriculumVersion?: string) => {
    const program = getCatalogProgramBySlug(programSlug);
    return program
      ? {
          ...program,
          courses: getProgramCoursesForCurriculumVersion(
            program,
            curriculumVersion ?? 'legacy-v1',
          ),
        }
      : null;
  },
  getApprovedCurriculumTrack: (programSlug: string, curriculumVersion: string) =>
    getProgramCurriculumManifest(programSlug, curriculumVersion)?.externalTrack ?? null,
  getFirstIncompleteCourseIndex,
  getCourseraConfig,
  buildCourseraLaunchUrl,
  getDiscoveredProgram: (programSlug: string) => DISCOVERED_COURSERA_PROGRAMS[programSlug] ?? null,
  getOrgScopedCourseUrl,
  getOrgScopedProgramUrl,
  localFallbackUrl,
  redirect: (url: URL | string) => NextResponse.redirect(url),
});

export const GET = withApiGuc(async (request: Request) => {
  try {
    return await courseraLaunchHandler(request);
  } catch (error) {
    console.error('/member/coursera/launch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
