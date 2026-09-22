import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { ensurePendingCertificationForCompletionSafely } from '@/lib/certifications/pendingFromCompletion';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { getProgramBySlug, getDiscoveredProgram } from '@/lib/content/programs';
import {
  claimLiveCourseCompletionEvent,
  markCourseProgressCompleted,
  resolveCanonicalProgramCourseFromCourseraId,
} from '@/lib/member/courseProgress';
import { resolveProgramCourseWithCatalogFallback } from '@/lib/member/programCourseMatch';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { createNotification } from '@/lib/notifications/create';
import { sendCourseCompletedEmail } from '@/lib/email';
import { handleLearningCompletion, handleProgramCompletion } from '@/lib/workflows/careerOS';
import { awardPoints } from '@/lib/member/points';
import { detectTrainingMilestone } from '@/lib/milestoneCascade/detectCompletionMilestone';
import {
  courseCompletionMilestoneRef,
  detectMilestoneTransitions,
} from '@/lib/coursera/milestones';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { runBulkEmailOperation } from '@/lib/email/pacing';

export async function completeMemberCourse(args: {
  userId: string;
  /**
   * Program already resolved by a trusted inbound pipeline. When omitted,
   * preserve the member/self-report behavior by falling back to the legacy
   * User.enrolledProgram mirror.
   */
  resolvedProgramSlug?: string | null;
  courseSlug?: string;
  courseName?: string;
  /** Coursera's canonical courseId from xAPI context.extensions, when known.
   *  Used as the primary join key against the catalog — required for xAPI
   *  ingestion since URL-tail slug heuristics can't tell course IDs from
   *  item IDs. */
  courseraCourseId?: string | null;
  source: 'member' | 'coursera-webhook' | 'coursera-enterprise-sync';
  /** Validated provider learner-event time; absence is not receipt-time activity. */
  learnerActivityAt?: Date | null;
  /**
   * When false, skip milestone emails and career workflows (bulk Coursera API reconciliation).
   * Still writes CourseProgress; enterprise sync does not consume the first
   * later live course-completion event.
   */
  notify?: boolean;
}) {
  const dbUser = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      enrolledProgram: true,
      email: true,
      fullName: true,
      organizationId: true,
      courseEnrollments: {
        select: { programSlug: true, curriculumVersion: true },
      },
    },
  });

  if (!dbUser) throw new Error('Member not found');

  // `undefined` means the member/self-report caller wants the legacy DB
  // enrollment fallback. `null` is an explicit trusted signal from xAPI that
  // there is no current enrollment; never revive stale legacy state in that
  // case.
  const resolvedEnrollment = args.resolvedProgramSlug === undefined
    ? dbUser.enrolledProgram
    : args.resolvedProgramSlug;
  const enrollmentProgramSlug = resolvedEnrollment
    ? canonicalizeProgramSlug(resolvedEnrollment)
    : null;

  let programSlug: string;
  let matchedCourse: { slug: string; name: string };
  let courseId: string | null;
  let resolvedCurriculumVersion = 'legacy-v1';
  if (enrollmentProgramSlug) {
    const enrolledProgram = getProgramBySlug(enrollmentProgramSlug);
    if (!enrolledProgram) throw new Error('Invalid program');
    resolvedCurriculumVersion = dbUser.courseEnrollments?.find((enrollment) =>
      programSlugsEquivalent(enrollment.programSlug, enrollmentProgramSlug),
    )?.curriculumVersion ?? 'legacy-v1';
    const enrollmentMatch = await resolveProgramCourseWithCatalogFallback(enrolledProgram, {
      courseraCourseId: args.courseraCourseId ?? null,
      enrolledProgramSlug: enrollmentProgramSlug,
      courseSlug: args.courseSlug,
      courseName: args.courseName,
    }, { curriculumVersion: resolvedCurriculumVersion });
    if (!enrollmentMatch) throw new Error('Course not found');
    programSlug = enrollmentProgramSlug;
    matchedCourse = enrollmentMatch;
    courseId = args.courseraCourseId
      ?? getDiscoveredProgram(programSlug)?.courses.find(
        (course) => course.slug === matchedCourse.slug,
      )?.courseId
      ?? null;
  } else {
    // A linked learner without an enrollment may still persist exact mapped
    // Coursera progress. Unknown content remains a true error; never invent a
    // program/course slug from provider display text.
    const canonicalCourse = await resolveCanonicalProgramCourseFromCourseraId(
      args.courseraCourseId,
    );
    if (!canonicalCourse) throw new Error('Course not found');
    programSlug = canonicalCourse.programSlug;
    matchedCourse = {
      slug: canonicalCourse.courseSlug,
      name: canonicalCourse.courseName,
    };
    courseId = canonicalCourse.courseraCourseId;
  }

  const persistedWithoutProgram = enrollmentProgramSlug === null;
  const program = getProgramBySlug(programSlug);
  const validatedCourses = program
    ? (await loadValidatedProgramCourses({
        organizationId: dbUser.organizationId,
        programSlug,
        checkB4BContents: false,
        curriculumVersion: resolvedCurriculumVersion,
      })).courses
    : [];
  const validatedSlugs = validatedCourses.map((course) => course.slug);
  const shouldNotify = !persistedWithoutProgram
    && (args.notify ?? args.source !== 'coursera-enterprise-sync');

  const completionWrite = await markCourseProgressCompleted({
    userId: args.userId,
    programSlug,
    courseSlug: matchedCourse.slug,
    courseId,
    ...(args.source === 'member' ? {} : { learnerActivityAt: args.learnerActivityAt ?? null }),
  });

  // Coursera reported this completion (REST webhook, xAPI, enterprise sync):
  // the member gets a pending certificate for it right away instead of a
  // zero on My Certificates while staff verify. A member's own "mark
  // complete" is not a provider report and still goes through the
  // self-report certificate form. Idempotent; never touches an existing row.
  if (args.source !== 'member') {
    await ensurePendingCertificationForCompletionSafely({
      userId: args.userId,
      programSlug,
      courseSlug: matchedCourse.slug,
      courseName: matchedCourse.name,
      courseraCourseId: courseId,
      completedAt: args.learnerActivityAt ?? null,
      source: args.source,
    });
  }

  const rowsAtObservation = completionWrite.previousRows;
  const nextCompletedSlugs = Array.from(
    new Set([
      ...rowsAtObservation
        .filter((row) => row.status === 'COMPLETED')
        .map((row) => row.courseSlug),
      matchedCourse.slug,
    ]),
  );
  const completedCount = nextCompletedSlugs.filter((slug) =>
    validatedSlugs.includes(slug),
  ).length;

  // Enterprise sync writes the durable completion fact but deliberately does
  // not consume the live-observation event. A later xAPI/webhook delivery can
  // therefore claim and emit the member-facing side effects once.
  if (args.source === 'coursera-enterprise-sync') {
    return {
      ok: true,
      alreadyCompleted: !completionWrite.newlyCompleted,
      ...(persistedWithoutProgram ? { persistedWithoutProgram: true as const } : {}),
      courseSlug: matchedCourse.slug,
      courseName: matchedCourse.name,
      programSlug,
      completedCount,
    };
  }

  // Claim the MemberEvent before any external side effect. This distinguishes
  // a historical enterprise completion from a completion already observed
  // live, and serializes concurrent live deliveries on the same exact
  // canonical program/course.
  const claimedLiveObservation = await claimLiveCourseCompletionEvent({
    userId: args.userId,
    programSlug,
    courseSlug: matchedCourse.slug,
    courseName: matchedCourse.name,
    completedCount,
    source: args.source,
  });
  if (!claimedLiveObservation) {
    return {
      ok: true,
      alreadyCompleted: !completionWrite.newlyCompleted,
      ...(persistedWithoutProgram ? { persistedWithoutProgram: true as const } : {}),
      courseSlug: matchedCourse.slug,
      courseName: matchedCourse.name,
      programSlug,
      completedCount,
    };
  }

  // If enterprise sync completed the row first, remove only the currently
  // observed course from the previous state so the first live observation can
  // produce its per-course transition without replaying unrelated courses.
  const rowsBeforeCompletion = completionWrite.newlyCompleted
    ? rowsAtObservation
    : rowsAtObservation.filter((row) => row.courseSlug !== matchedCourse.slug);
  const startedBeforeCompletion = rowsBeforeCompletion.some(
    (row) =>
      row.status !== 'NOT_STARTED' ||
      row.percentComplete > 0 ||
      row.lastActivityAt != null,
  );
  const milestoneTransitions = detectMilestoneTransitions({
    previous: {
      completedSlugs: rowsBeforeCompletion
        .filter((row) => row.status === 'COMPLETED')
        .map((row) => row.courseSlug),
      started: startedBeforeCompletion,
    },
    next: {
      completedSlugs: nextCompletedSlugs,
      started: true,
      validatedSlugs,
    },
    courseSlugJustCompleted: matchedCourse.slug,
  });
  if (shouldNotify) {
    try {
      const partnerDelivery = await runBulkEmailOperation(() =>
        sendPartnerMilestoneEmail(args.userId, 'Course completed', {
          Course: matchedCourse.name,
        }),
      );
      if (partnerDelivery && typeof partnerDelivery === 'object' && 'skipped' in partnerDelivery) {
        console.warn('[course-completion] partner email skipped by cron pacing deadline');
      }
    } catch (error) {
      // The completion event is already durably claimed. Provider rejection
      // must not strand local effects behind a claim replay cannot reacquire.
      console.error('[course-completion] partner email failed:', error);
    }

    try {
      const memberDelivery = await runBulkEmailOperation(() => sendCourseCompletedEmail({
        to: dbUser.email,
        fullName: dbUser.fullName,
        courseName: matchedCourse.name,
      }));
      if (memberDelivery && typeof memberDelivery === 'object' && 'skipped' in memberDelivery && memberDelivery.skipped) {
        console.warn('[course-completion] member email skipped before provider acceptance');
      }
    } catch (error) {
      console.error('[course-completion] member email failed:', error);
    }

    await createNotification({
      userId: args.userId,
      type: 'course_complete',
      title: 'Course completed!',
      body: `You completed ${matchedCourse.name}. Great work!`,
      data: { courseSlug: matchedCourse.slug, courseName: matchedCourse.name, programSlug },
    });

    const counselors = await prisma.counselorAssignment.findMany({
      where: { memberId: args.userId, active: true },
      select: { counselor: { select: { userId: true } } },
    });
    for (const assignment of counselors) {
      if (assignment.counselor?.userId) {
        await createNotification({
          userId: assignment.counselor.userId,
          type: 'course_complete',
          title: `${dbUser.fullName ?? 'Member'} completed a course`,
          body: `${dbUser.fullName ?? 'A member'} completed ${matchedCourse.name}.`,
          data: {
            memberId: args.userId,
            courseSlug: matchedCourse.slug,
            courseName: matchedCourse.name,
            programSlug,
          },
        });
      }
    }

    handleLearningCompletion(args.userId, matchedCourse.name).catch((error) =>
      console.error('[career-os] learning completion workflow failed:', error)
    );

    if (program && milestoneTransitions.includes('program_completed')) {
      handleProgramCompletion(args.userId, programSlug, program.title).catch((error) =>
        console.error('[career-os] program completion workflow failed:', error)
      );
    }

    for (const milestoneType of milestoneTransitions) {
      const detection = await detectTrainingMilestone({
        userId: args.userId,
        milestoneType,
        milestoneRef:
          milestoneType === 'course_completed'
            ? courseCompletionMilestoneRef(programSlug, matchedCourse.slug)
            : programSlug,
        courseSlug: matchedCourse.slug,
        courseName: matchedCourse.name,
        programSlug,
        completedCount,
        totalCourses: validatedSlugs.length,
        source: args.source,
      });
      if (detection && !detection.ok) {
        console.error('[milestone-cascade] detect failed:', detection.reason);
      }
    }
  }

  if (shouldNotify) {
    awardPoints(args.userId, 'course_completed', matchedCourse.slug).catch(() => {});
  }

  return {
    ok: true,
    alreadyCompleted: !completionWrite.newlyCompleted,
    ...(persistedWithoutProgram ? { persistedWithoutProgram: true as const } : {}),
    courseSlug: matchedCourse.slug,
    courseName: matchedCourse.name,
    programSlug,
    completedCount,
  };
}
