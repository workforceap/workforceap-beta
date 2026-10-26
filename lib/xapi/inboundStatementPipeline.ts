import 'server-only';

import { isAdmin } from '@/lib/auth/roles';
import { completeMemberCourse } from '@/lib/member/courseCompletion';
import { upsertCourseProgressFromXapiStatement } from '@/lib/member/courseProgress';
import { resolveStaffTrainingPreviewProgramSlug } from '@/lib/member/staffTrainingProgramFallback';
import { dailyStudyAwardKey } from '@/lib/member/dailyStudyPoints';
import { awardPoints } from '@/lib/member/points';
import { prisma } from '@/lib/db/prisma';
import { recordXapiEvent, resolveXapiUser } from '@/lib/xapi/mappings';
import { resolveInboundProgramSlug } from '@/lib/xapi/resolveInboundProgram';
import {
  isXapiCompletionVerb,
  isXapiCourseProgressVerb,
  type ParsedXapiStatement,
} from '@/lib/xapi/statements';
import { markXapiStatementProcessed } from '@/lib/xapi/storage';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { detectTrainingMilestone } from '@/lib/milestoneCascade/detectCompletionMilestone';
import { resolveInboundCourseScopes } from '@/lib/xapi/resolveInboundCourseScopes';
import { xapiLearnerActivityAt } from '@/lib/xapi/activityTimestamp';

export type InboundStatementRunResult = {
  completions: Array<Record<string, unknown>>;
  /** Durable classification, also available when a statement has only a hash. */
  outcome?: 'completed' | 'ignored' | 'unresolved_course' | 'unmatched';
};

/**
 * Shared Coursera xAPI ingest path (webhook replay or live POST).
 * Does not persist into `xapi_statements` — caller handles storage.
 */
export async function handleInboundParsedStatement(
  parsed: ParsedXapiStatement,
  options: {
    organizationId?: string | null;
    statementHash?: string | null;
    expectedUserId?: string | null;
    requireOrganizationId?: boolean;
  } = {},
): Promise<InboundStatementRunResult> {
  const completions: Array<Record<string, unknown>> = [];

  const identity = {
    email: parsed.email,
    actorIdentifier: parsed.actorIdentifier,
    actorHomePage: parsed.actorHomePage,
  };

  const finishUnmatched = async (error: string): Promise<InboundStatementRunResult> => {
    await recordXapiEvent({
      statementId: parsed.statementId,
      identity,
      organizationId: options.organizationId,
      courseSlug: parsed.courseSlug,
      courseName: parsed.courseName,
      verbId: parsed.verbId,
      completionStatus: 'unmatched',
      error,
      rawPayload: parsed.rawStatement,
    });

    if (isXapiCompletionVerb(parsed)) {
      completions.push({
        email: parsed.email,
        actorIdentifier: parsed.actorIdentifier,
        statementId: parsed.statementId,
        ok: false,
        error: 'Member not found',
      });
    }

    await markXapiStatementProcessed(parsed.statementId, options.statementHash);
    return { completions, outcome: 'unmatched' };
  };

  const expectedOrganizationId = options.organizationId?.trim() || null;
  if (options.requireOrganizationId && !expectedOrganizationId) {
    return finishUnmatched('Persisted xAPI statement has no trustworthy organization');
  }

  const expectedUserId = options.expectedUserId?.trim() || null;
  const resolvedUser = await resolveXapiUser(identity, {
    organizationId: expectedOrganizationId,
    expectedUserId,
  });

  if (!resolvedUser) {
    return finishUnmatched('No matching member identity found');
  }

  if (expectedUserId && resolvedUser.userId !== expectedUserId) {
    console.warn('[inboundStatementPipeline] rejected unexpected replay target', {
      resolvedUserId: resolvedUser.userId,
      expectedUserId,
      expectedOrganizationId,
    });
    return finishUnmatched('Resolved member does not match the expected replay target');
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: resolvedUser.userId },
    select: {
      organizationId: true,
      deletedAt: true,
      enrolledProgram: true,
      courseEnrollments: {
        where: options.organizationId ? { organizationId: options.organizationId } : undefined,
        select: { programSlug: true, curriculumVersion: true, isPrimary: true },
      },
    },
  });
  if (
    !dbUser
    || dbUser.deletedAt
    || (expectedOrganizationId && dbUser.organizationId !== expectedOrganizationId)
  ) {
    console.warn('[inboundStatementPipeline] rejected stale or cross-tenant xAPI identity', {
      userId: resolvedUser.userId,
      expectedOrganizationId,
      memberOrganizationId: dbUser?.organizationId ?? null,
      deleted: Boolean(dbUser?.deletedAt),
    });
    return finishUnmatched('Resolved member is not active in the expected organization');
  }
  let enrolledProgram = resolveInboundProgramSlug({
    enrollments: dbUser.courseEnrollments,
    legacyEnrolledProgram: dbUser.enrolledProgram,
  });

  if (!enrolledProgram && (await isAdmin(resolvedUser.userId))) {
    enrolledProgram = await resolveStaffTrainingPreviewProgramSlug(resolvedUser.userId);
  }
  const enrolledCurriculumVersion = enrolledProgram
    ? dbUser.courseEnrollments.find(
        (enrollment) => enrollment.programSlug === enrolledProgram,
      )?.curriculumVersion ?? 'legacy-v1'
    : 'legacy-v1';
  const inboundScopes = await resolveInboundCourseScopes({
    courseraCourseId: parsed.courseraCourseId,
    assignments: dbUser.courseEnrollments,
    fallbackProgramSlug: enrolledProgram,
    fallbackCurriculumVersion: enrolledCurriculumVersion,
    requireResolvedDetachedCourse: true,
  });

  if (isXapiCompletionVerb(parsed) && inboundScopes.length === 0) {
    // A matched learner is not sufficient course attribution. Keep the raw
    // statement pending until mapping/assignment evidence resolves it; even
    // an existing COMPLETED progress row must not choose a curriculum or
    // justify consuming the live completion/reward/notification claim.
    const error = 'Course attribution unresolved; retry after mapping or assignment is resolved';
    await recordXapiEvent({
      statementId: parsed.statementId,
      identity,
      courseSlug: parsed.courseSlug,
      courseName: parsed.courseName,
      verbId: parsed.verbId,
      matchedUserId: resolvedUser.userId,
      organizationId: options.organizationId,
      mappingMethod: resolvedUser.mappingMethod,
      completionStatus: 'unresolved_course',
      error,
      rawPayload: parsed.rawStatement,
    });
    completions.push({
      email: parsed.email,
      actorIdentifier: parsed.actorIdentifier,
      statementId: parsed.statementId,
      matchedUserId: resolvedUser.userId,
      mappingMethod: resolvedUser.mappingMethod,
      ok: false,
      retryable: true,
      error,
    });
    return { completions, outcome: 'unresolved_course' };
  }

  // Enrollment gates rewards, not persistence. Detached linked learners still
  // keep exact mapped progress below, but must not receive a daily-study point
  // or any course-completion celebration until they have a current program.
  // The award follows the learner's event day, so replays of old statements
  // (hourly auto-heal) never award "Studied today" (WAP-276).
  const dailyStudyKey = dailyStudyAwardKey(xapiLearnerActivityAt(parsed.timestamp));
  if (enrolledProgram && dailyStudyKey) {
    await awardPoints(resolvedUser.userId, 'daily_study', dailyStudyKey).catch((error) => {
      console.warn('[inboundStatementPipeline] daily_study points award failed:', error);
    });
  }

  if (!isXapiCompletionVerb(parsed)) {
    let progressWritten = false;
    for (const scope of inboundScopes) {
      const progress = await upsertCourseProgressFromXapiStatement({
        userId: resolvedUser.userId,
        enrolledProgramSlug: scope.programSlug,
        curriculumVersion: scope.curriculumVersion,
        parsed,
      });
      if (progress) progressWritten = true;
      if (
        scope.assignmentMatched
        && progress?.trainingStartedTransition
        && dbUser.organizationId
      ) {
        const validated = await loadValidatedProgramCourses({
          organizationId: dbUser.organizationId,
          programSlug: progress.programSlug,
          checkB4BContents: false,
          curriculumVersion: scope.curriculumVersion,
        });
        await detectTrainingMilestone({
          userId: resolvedUser.userId,
          milestoneType: 'training_started',
          milestoneRef: progress.programSlug,
          programSlug: progress.programSlug,
          courseSlug: progress.courseSlug,
          courseName: progress.courseName,
          completedCount: 0,
          totalCourses: validated.courses.length,
          source: 'coursera-webhook',
          sourceEventId: parsed.statementId,
        }).catch((error) => {
          console.warn('[inboundStatementPipeline] training_started detection failed:', error);
        });
      }
    }
    const outcome = isXapiCourseProgressVerb(parsed) && !progressWritten
      ? 'unresolved_course'
      : 'ignored';
    await recordXapiEvent({
      statementId: parsed.statementId,
      identity,
      courseSlug: parsed.courseSlug,
      courseName: parsed.courseName,
      verbId: parsed.verbId,
      matchedUserId: resolvedUser.userId,
      organizationId: options.organizationId,
      mappingMethod: resolvedUser.mappingMethod,
      // A course-progress statement that wrote no progress lost it: its course
      // did not resolve. Only those are replay/heal candidates; every other
      // non-completion statement (item completions, experienced, …) is normal
      // traffic (WAP-276).
      completionStatus: outcome,
      rawPayload: parsed.rawStatement,
    });
    await markXapiStatementProcessed(parsed.statementId, options.statementHash);
    return { completions, outcome };
  }

  let completionFailed = false;
  let retryableCompletionError: Error | null = null;
  try {
    // Completion orchestration must observe the pre-completion row. Persisting
    // the xAPI statement first would set COMPLETED, trigger the orchestrator's
    // idempotent early return, and silently skip the first completion's
    // email/points/milestone transitions. The orchestrator writes the durable
    // completion first; the xAPI upsert then adds statement/score detail.
    for (const scope of inboundScopes) {
      const result = await completeMemberCourse({
        userId: resolvedUser.userId,
        resolvedProgramSlug: scope.programSlug,
        courseSlug: parsed.courseSlug,
        courseName: parsed.courseName,
        courseraCourseId: parsed.courseraCourseId ?? null,
        source: 'coursera-webhook',
        learnerActivityAt: xapiLearnerActivityAt(parsed.timestamp),
        notify: scope.assignmentMatched ? undefined : false,
      });

      await upsertCourseProgressFromXapiStatement({
        userId: resolvedUser.userId,
        enrolledProgramSlug: scope.programSlug,
        curriculumVersion: scope.curriculumVersion,
        parsed,
      });
      const completion = {
        email: parsed.email,
        actorIdentifier: parsed.actorIdentifier,
        statementId: parsed.statementId,
        matchedUserId: resolvedUser.userId,
        mappingMethod: resolvedUser.mappingMethod,
        ...(result as Record<string, unknown>),
      };
      completions.push(completion);
    }

    await recordXapiEvent({
      statementId: parsed.statementId,
      identity,
      courseSlug: parsed.courseSlug,
      courseName: parsed.courseName,
      verbId: parsed.verbId,
      matchedUserId: resolvedUser.userId,
      organizationId: options.organizationId,
      mappingMethod: resolvedUser.mappingMethod,
      completionStatus: 'completed',
      rawPayload: parsed.rawStatement,
    });

  } catch (error) {
    completionFailed = true;
    const message = error instanceof Error ? error.message : 'Unable to process statement';
    retryableCompletionError = error instanceof Error ? error : new Error(message);

    await recordXapiEvent({
      statementId: parsed.statementId,
      identity,
      courseSlug: parsed.courseSlug,
      courseName: parsed.courseName,
      verbId: parsed.verbId,
      matchedUserId: resolvedUser.userId,
      organizationId: options.organizationId,
      mappingMethod: resolvedUser.mappingMethod,
      completionStatus: 'error',
      error: message,
      rawPayload: parsed.rawStatement,
    });

    completions.push({
      email: parsed.email,
      actorIdentifier: parsed.actorIdentifier,
      statementId: parsed.statementId,
      matchedUserId: resolvedUser.userId,
      mappingMethod: resolvedUser.mappingMethod,
      ok: false,
      error: message,
    });
  }

  // A shared provider course can target more than one assigned curriculum.
  // If any target fails, leave the durable statement unprocessed so replay
  // can retry the failed target. Successful targets are idempotent and may be
  // re-run; marking the statement here would permanently lose later scopes.
  if (!completionFailed) {
    await markXapiStatementProcessed(parsed.statementId, options.statementHash);
  }
  if (completionFailed) {
    throw retryableCompletionError ?? new Error('Unable to process statement');
  }
  return { completions, outcome: 'completed' };
}
