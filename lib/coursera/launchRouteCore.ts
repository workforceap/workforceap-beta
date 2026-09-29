export type CourseraLaunchUser = {
  id: string;
  email?: string | null;
};

type DbUser = {
  enrolledProgram: string | null;
  organizationId: string | null;
  courseEnrollments?: Array<{ programSlug: string; curriculumVersion: string }>;
  courseProgress: Array<{ programSlug: string; courseSlug: string }>;
} | null;

type ProgramWithCourses = {
  /** One-stop external course: launch it directly, skipping Coursera. */
  externalCourseUrl?: string;
  courses: Array<{
    slug: string;
    kind?: 'coursera' | 'workforceap';
    courseraSlug?: string;
    courseraCourseId?: string;
  }>;
};

type CourseOverride = {
  courseraSlug: string | null;
  courseraUrlType?: string | null;
} | null;

type DiscoveredProgram = {
  courses: Array<{ slug: string; courseId: string }>;
} | null;

type ApprovedCurriculumTrack = {
  status: 'pending' | 'validated';
  collectionId: string | null;
  assignmentMode: 'disabled' | 'canary' | 'enabled';
} | null;

export type CourseraLaunchDependencies<ResponseLike, ProgramType extends ProgramWithCourses> = {
  getUser: () => Promise<CourseraLaunchUser | null>;
  findUser: (userId: string) => Promise<DbUser>;
  /** `requestedProgramSlug` is the `&program=` of the page the member launched
   *  from; the resolver honors it only for one of the member's own enrollments
   *  (WAP-196), and otherwise falls back to the primary program. */
  resolveActiveProgram: (
    userId: string,
    legacyEnrolledProgram: string | null,
    requestedProgramSlug?: string | null,
  ) => Promise<string | null>;
  findCourse: (args: {
    organizationId: string;
    programSlug: string;
    courseSlug: string;
  }) => Promise<CourseOverride>;
  findFirstCourse: (args: {
    organizationId: string;
    programSlug: string;
  }) => Promise<CourseOverride>;
  getProgramBySlug: (programSlug: string, curriculumVersion?: string) => ProgramType | null;
  getApprovedCurriculumTrack: (
    programSlug: string,
    curriculumVersion: string,
  ) => ApprovedCurriculumTrack;
  getFirstIncompleteCourseIndex: (program: ProgramType, completedSlugs: string[]) => number | undefined;
  getCourseraConfig: () => { courseIdMap: Record<string, string[] | undefined> };
  buildCourseraLaunchUrl: (args: {
    programSlug: string | null;
    userId: string;
    email: string;
    currentCourseIndex?: number;
    currentCourseId?: string | null;
  }) => string | null;
  getDiscoveredProgram: (programSlug: string) => DiscoveredProgram;
  getOrgScopedCourseUrl: (
    programSlug: string,
    courseId: string,
    courseSlug: string,
    preferredProgramId?: string | null,
  ) => Promise<string | null>;
  getOrgScopedProgramUrl: (
    programSlug: string,
    preferredProgramId?: string | null,
  ) => Promise<string | null>;
  localFallbackUrl: (slug: string, kind: 'course' | 'specialization') => string;
  redirect: (url: URL | string) => ResponseLike;
};

function isProgramSpecificLaunchUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/programs\//.test(url) || /\/learn\//.test(url) || /\/professional-certificates\//.test(url);
}

function isUselessProgramFallback(url: string | null): boolean {
  if (!url) return false;
  return (
    /^https?:\/\/(www\.)?coursera\.org\/?$/.test(url) ||
    /^https?:\/\/(www\.)?coursera\.org\/programs\/[^/?#]+\/?$/.test(url)
  );
}

function courseraUrlKind(urlType: string | null | undefined): 'course' | 'specialization' {
  return urlType === 'specializations' || urlType === 'specialization'
    ? 'specialization'
    : 'course';
}

export function createCourseraLaunchHandler<ResponseLike, ProgramType extends ProgramWithCourses>(
  deps: CourseraLaunchDependencies<ResponseLike, ProgramType>,
) {
  return async function courseraLaunchGET(request: Request): Promise<ResponseLike> {
    const searchParams = new URL(request.url).searchParams;
    const requestedSlug = searchParams.get('course')?.trim() || '';
    // The enrollment the member was viewing (a secondary program's My Program
    // page passes it; WAP-196). Validated by resolveActiveProgram.
    const requestedProgram = searchParams.get('program')?.trim() || '';
    // Query string that returns to the same program and course.
    const backQuery = new URLSearchParams({
      ...(requestedProgram ? { program: requestedProgram } : {}),
      ...(requestedSlug ? { course: requestedSlug } : {}),
    }).toString();
    const user = await deps.getUser();
    if (!user) {
      // Come back to My Program with the course the member clicked, so login
      // does not drop them on the default course.
      const loginUrl = new URL('/login', request.url);
      const back = backQuery ? `/dashboard/program?${backQuery}` : '/dashboard/program';
      loginUrl.searchParams.set('redirectTo', back);
      return deps.redirect(loginUrl);
    }

    // Failed launches return to My Program (via /dashboard/training), which
    // turns `error` into a plain-language notice and keeps `course` selected.
    const launchErrorRedirect = (code: 'curriculum_track_pending' | 'course_not_assigned' | 'launch_failed') => {
      const errorUrl = new URL('/dashboard/training', request.url);
      errorUrl.searchParams.set('error', code);
      if (requestedProgram) errorUrl.searchParams.set('program', requestedProgram);
      if (requestedSlug) errorUrl.searchParams.set('course', requestedSlug);
      return deps.redirect(errorUrl);
    };

    const dbUser = await deps.findUser(user.id);

    // Use the same active-program resolution as `/dashboard/training` and
    // My Program (`getActiveProgramForDashboard`) so the launch button never disagrees with what the
    // member is looking at. Pre-fix this used `User.enrolledProgram` (legacy
    // single-program field) directly — when a member had multiple
    // CourseEnrollment rows with a primary that diverged from the legacy
    // field, the dashboard showed Program A while the launch button opened
    // Program B's course.
    const enrolledProgram = await deps.resolveActiveProgram(
      user.id,
      dbUser?.enrolledProgram ?? null,
      requestedProgram || null,
    );
    const curriculumVersion = enrolledProgram
      ? dbUser?.courseEnrollments?.find(
          (enrollment) => enrollment.programSlug === enrolledProgram,
        )?.curriculumVersion ?? 'legacy-v1'
      : 'legacy-v1';
    const program = enrolledProgram
      ? deps.getProgramBySlug(enrolledProgram, curriculumVersion)
      : null;

    // One-stop external courses (Digital Literacy → Microsoft) have nothing to
    // provision or map on Coursera: send the member straight to the course.
    if (program?.externalCourseUrl) {
      return deps.redirect(program.externalCourseUrl);
    }

    const approvedTrack = enrolledProgram && curriculumVersion === APPROVED_CURRICULUM_VERSION
      ? deps.getApprovedCurriculumTrack(enrolledProgram, curriculumVersion)
      : null;
    const approvedCollectionId = approvedTrack?.collectionId?.trim() || null;
    if (enrolledProgram && curriculumVersion === APPROVED_CURRICULUM_VERSION) {
      if (!isExternalCurriculumTrackReady(approvedTrack)) {
        return launchErrorRedirect('curriculum_track_pending');
      }
    }

    // A URL can be hand-edited. Never launch a Course DB/discovered entry that
    // is outside the learner's immutable curriculum assignment.
    if (requestedSlug && (!program || !program.courses.some((course) => course.slug === requestedSlug))) {
      return launchErrorRedirect('course_not_assigned');
    }

    const requestedCourse = requestedSlug
      ? program?.courses.find((course) => course.slug === requestedSlug)
      : null;
    if (requestedCourse && isWorkforceApCourse(requestedCourse)) {
      return deps.redirect(new URL(
        workforceApCourseHref(requestedCourse.slug, enrolledProgram ?? ''),
        request.url,
      ));
    }
    if (
      requestedCourse?.courseraCourseId
      && requestedCourse.courseraSlug
      && enrolledProgram
      && approvedCollectionId
    ) {
      const approvedCourseUrl = await deps.getOrgScopedCourseUrl(
        enrolledProgram,
        requestedCourse.courseraCourseId,
        requestedCourse.courseraSlug,
        approvedCollectionId,
      );
      if (approvedCourseUrl) return deps.redirect(approvedCourseUrl);
      return launchErrorRedirect('launch_failed');
    }

    if (requestedSlug && enrolledProgram) {
      if (dbUser?.organizationId) {
        const course = await deps.findCourse({
          organizationId: dbUser.organizationId,
          programSlug: enrolledProgram,
          courseSlug: requestedSlug,
        });

        if (course?.courseraSlug) {
          return deps.redirect(
            deps.localFallbackUrl(course.courseraSlug, courseraUrlKind(course.courseraUrlType)),
          );
        }
      }

      const discoveredProg = deps.getDiscoveredProgram(enrolledProgram);
      if (discoveredProg) {
        const discoveredCourse = discoveredProg.courses.find((c) => c.slug === requestedSlug);
        if (discoveredCourse) {
          const orgScoped = await deps.getOrgScopedCourseUrl(
            enrolledProgram,
            discoveredCourse.courseId,
            discoveredCourse.slug,
          );
          if (orgScoped) return deps.redirect(orgScoped);
        }
      }

      // A board-approved syllabus can replace a legacy Coursera collection
      // before the Enterprise discovery snapshot is refreshed. In that gap,
      // use the exact official /learn slug carried by the approved syllabus.
      // This must run before the index-based ID fallback so a new course at an
      // old index can never launch the retired course that previously occupied
      // that slot.
      const approvedCourse = program?.courses.find((course) => course.slug === requestedSlug);
      if (approvedCourse?.courseraSlug) {
        return deps.redirect(deps.localFallbackUrl(approvedCourse.courseraSlug, 'course'));
      }
    }
    const completedSlugs = enrolledProgram
      ? dbUser?.courseProgress
          .filter((row) => row.programSlug === enrolledProgram)
          .map((row) => row.courseSlug) ?? []
      : [];

    const requestedIndex = requestedSlug && program
      ? program.courses.findIndex((c) => c.slug === requestedSlug)
      : -1;

    const defaultCurrentIndex = program
      ? deps.getFirstIncompleteCourseIndex(program, completedSlugs)
      : undefined;

    const currentCourseIndex = requestedIndex >= 0 ? requestedIndex : defaultCurrentIndex;

    const courseIdMap = enrolledProgram ? deps.getCourseraConfig().courseIdMap[enrolledProgram] : undefined;
    const currentCourse = currentCourseIndex != null && currentCourseIndex >= 0
      ? program?.courses[currentCourseIndex]
      : undefined;
    if (currentCourse && isWorkforceApCourse(currentCourse)) {
      return deps.redirect(new URL(
        workforceApCourseHref(currentCourse.slug, enrolledProgram ?? ''),
        request.url,
      ));
    }
    const currentCourseId = currentCourseIndex != null && currentCourseIndex >= 0
      ? currentCourse?.courseraCourseId ?? courseIdMap?.[currentCourseIndex]
      : undefined;

    if (requestedSlug) {
      if (enrolledProgram && currentCourseId) {
        const orgScoped = await deps.getOrgScopedCourseUrl(
          enrolledProgram,
          currentCourseId,
          requestedSlug,
        );
        if (orgScoped) return deps.redirect(orgScoped);
      }

      return launchErrorRedirect('launch_failed');
    }

    const orgScopedProgramUrl = enrolledProgram
      ? await deps.getOrgScopedProgramUrl(enrolledProgram, approvedCollectionId)
      : null;

    const configuredLaunchUrl = deps.buildCourseraLaunchUrl({
      programSlug: enrolledProgram,
      userId: user.id,
      email: user.email ?? '',
      currentCourseIndex,
      currentCourseId,
    });

    const resolvedUrl = approvedCollectionId
      ? orgScopedProgramUrl
      : (isProgramSpecificLaunchUrl(configuredLaunchUrl) ? configuredLaunchUrl : null) ??
        orgScopedProgramUrl ??
        configuredLaunchUrl ??
        null;

    let safeUrl = resolvedUrl;
    if (isUselessProgramFallback(safeUrl) && enrolledProgram && dbUser?.organizationId) {
      const firstCourse = await deps.findFirstCourse({
        organizationId: dbUser.organizationId,
        programSlug: enrolledProgram,
      });

      if (firstCourse?.courseraSlug) {
        safeUrl = deps.localFallbackUrl(
          firstCourse.courseraSlug,
          courseraUrlKind(firstCourse.courseraUrlType),
        );
      }
    }

    if (!safeUrl) {
      return launchErrorRedirect('launch_failed');
    }

    return deps.redirect(safeUrl);
  };
}
import { isWorkforceApCourse, workforceApCourseHref } from '@/lib/content/courseDelivery';
import {
  APPROVED_CURRICULUM_VERSION,
  isExternalCurriculumTrackReady,
} from '@/lib/content/programCurriculumManifest';
