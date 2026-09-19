import { prisma } from '../db/prisma';
import { generateResumeBullet } from '../ai/proactiveResumeGenerator';
import { findBestEmployerMatch } from '../ai/proactiveJobMatcher';
import { recordWorkflowDiagnostic } from '../diagnostics';
import { createNotification } from '../notifications/create';
import { persistEvent } from '../events/track';

type LearningCompletionResult = {
  actionId: string;
  created: boolean;
  duplicatedRecentAction: boolean;
  matchedJobId: string | null;
  resumeBullet: string;
};

const DUPLICATE_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 7;
export const CAREER_OS_WORKFLOW = 'career_os_learning_completion';

function normalizeCourseName(courseName: string) {
  return courseName.trim().replace(/\s+/g, ' ');
}

export async function handleLearningCompletion(memberId: string, courseName: string): Promise<LearningCompletionResult> {
  const normalizedCourseName = normalizeCourseName(courseName);
  const startedAt = Date.now();

  await recordWorkflowDiagnostic({
    workflow: CAREER_OS_WORKFLOW,
    status: 'started',
    entityType: 'user',
    entityId: memberId,
    summary: `Processing learning completion for ${normalizedCourseName}`,
    method: 'webhook',
    metadata: { courseName: normalizedCourseName },
  });

  try {
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: { id: true, fullName: true },
    });

    if (!member) {
      await recordWorkflowDiagnostic({
        workflow: CAREER_OS_WORKFLOW,
        status: 'error',
        entityType: 'user',
        entityId: memberId,
        summary: 'Learning completion received for missing member',
        method: 'webhook',
        failureReason: 'member_not_found',
        metadata: { courseName: normalizedCourseName },
      });
      throw new Error(`Member not found: ${memberId}`);
    }

    const duplicateCutoff = new Date(Date.now() - DUPLICATE_LOOKBACK_MS);
    const existingRecentAction = await prisma.memberNextBestAction.findFirst({
      where: {
        memberId,
        status: 'PENDING',
        description: { contains: normalizedCourseName },
        createdAt: { gte: duplicateCutoff },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ctaHref: true },
    });

    const bullet = await generateResumeBullet(normalizedCourseName);
    const jobMatch = await findBestEmployerMatch(memberId, normalizedCourseName);

    let title = 'Update your Resume';
    let desc = `You finished ${normalizedCourseName}. We drafted a new resume bullet for you.`;
    let ctaLabel = 'Review Resume';
    let ctaHref = '/dashboard/resume';

    if (jobMatch) {
      title = `New Skill Match: ${jobMatch.title}`;
      desc = `You finished ${normalizedCourseName}. We matched that skill to ${jobMatch.title}. Practice a 3-minute mock interview now.`;
      ctaLabel = 'Practice Interview';
      ctaHref = `/dashboard/ai-tools/interview-practice?jobId=${jobMatch.id}`;
    }

    if (existingRecentAction) {
      await persistEvent({
        userId: memberId,
        eventName: 'career_os.learning_completion_duplicate',
        entityType: 'MemberNextBestAction',
        entityId: existingRecentAction.id,
        sourcePage: '/api/webhooks/learning-completion',
        metadata: {
          courseName: normalizedCourseName,
          resumeBullet: bullet,
          matchedJobId: jobMatch?.id ?? null,
        },
      }, prisma);

      await recordWorkflowDiagnostic({
        workflow: CAREER_OS_WORKFLOW,
        status: 'inspection',
        entityType: 'MemberNextBestAction',
        entityId: existingRecentAction.id,
        summary: 'Skipped duplicate next-best action for recent learning completion',
        method: 'dedupe_recent_pending_action',
        metadata: {
          memberId,
          courseName: normalizedCourseName,
          matchedJobId: jobMatch?.id ?? null,
        },
      });

      return {
        actionId: existingRecentAction.id,
        created: false,
        duplicatedRecentAction: true,
        matchedJobId: jobMatch?.id ?? null,
        resumeBullet: bullet,
      };
    }

    const action = await prisma.$transaction(async (tx) => {
      await tx.memberNextBestAction.updateMany({
        where: {
          memberId,
          status: 'PENDING',
          icon: 'auto_awesome',
        },
        data: {
          status: 'DISMISSED',
        },
      });

      const createdAction = await tx.memberNextBestAction.create({
        data: {
          memberId,
          title,
          description: desc,
          ctaLabel,
          ctaHref,
          icon: 'auto_awesome',
          priority: 100,
        },
      });

      await persistEvent({
        userId: memberId,
        eventName: 'career_os.learning_completion_processed',
        entityType: 'MemberNextBestAction',
        entityId: createdAction.id,
        sourcePage: '/api/webhooks/learning-completion',
        metadata: {
          courseName: normalizedCourseName,
          resumeBullet: bullet,
          matchedJobId: jobMatch?.id ?? null,
          ctaHref,
        },
      }, tx);

      return createdAction;
    });

    await recordWorkflowDiagnostic({
      workflow: CAREER_OS_WORKFLOW,
      status: 'success',
      entityType: 'MemberNextBestAction',
      entityId: action.id,
      summary: jobMatch
        ? `Created matched interview action for ${member.fullName ?? member.id}`
        : `Created resume follow-up action for ${member.fullName ?? member.id}`,
      provider: jobMatch ? 'job_matcher' : 'resume_only',
      method: 'webhook',
      metadata: {
        memberId,
        courseName: normalizedCourseName,
        matchedJobId: jobMatch?.id ?? null,
        durationMs: Date.now() - startedAt,
      },
    });

    return {
      actionId: action.id,
      created: true,
      duplicatedRecentAction: false,
      matchedJobId: jobMatch?.id ?? null,
      resumeBullet: bullet,
    };
  } catch (error) {
    await recordWorkflowDiagnostic({
      workflow: CAREER_OS_WORKFLOW,
      status: 'error',
      entityType: 'user',
      entityId: memberId,
      summary: 'Learning completion workflow failed',
      method: 'webhook',
      failureReason: error instanceof Error ? error.message : 'unknown_error',
      metadata: { courseName: normalizedCourseName },
    });
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Program completion — the "graduation" moment.
//
// Previously the only completion signal was per-course (handleLearningCompletion
// above): a member finishing their LAST course got the exact same "update
// your resume" nudge as finishing course 2 of 10. There was no distinct
// transition into active job search when someone actually finishes their
// certificate — the single highest-leverage moment in the whole journey.
//
// This deterministic job-ready transition is separate from the
// counselor-reviewed milestone_cascades draft. The cascade may also record a
// `program_completed` milestone, but this idempotent workflow remains the
// authority for the member's job-ready action and notifications.
// ────────────────────────────────────────────────────────────────────────────

export const PROGRAM_COMPLETION_EVENT = 'program_completed';

type ProgramCompletionResult = { created: boolean; actionId: string | null };

/**
 * Idempotent per (memberId, programSlug) via a MemberEvent existence check —
 * safe to call from every completion path without double-firing if a member
 * somehow re-triggers their last course's completion.
 */
export async function handleProgramCompletion(
  memberId: string,
  programSlug: string,
  programTitle: string
): Promise<ProgramCompletionResult> {
  const already = await prisma.memberEvent.findFirst({
    where: { userId: memberId, eventName: PROGRAM_COMPLETION_EVENT, entityId: programSlug },
    select: { id: true },
  });
  if (already) return { created: false, actionId: null };

  try {
    const action = await prisma.$transaction(async (tx) => {
      // The job-ready kit supersedes any in-flight "keep learning" nudges —
      // there's nothing left to nudge on the training side once a member
      // graduates.
      await tx.memberNextBestAction.updateMany({
        where: { memberId, status: 'PENDING' },
        data: { status: 'DISMISSED' },
      });

      const createdAction = await tx.memberNextBestAction.create({
        data: {
          memberId,
          title: `You finished ${programTitle}!`,
          description:
            'Time to put your new skills to work: polish your resume, review jobs matched to your program, and book an interview-prep session.',
          ctaLabel: 'See matched jobs',
          ctaHref: '/dashboard/jobs',
          icon: 'military_tech',
          priority: 200,
        },
      });

      await persistEvent({
        userId: memberId,
        eventName: PROGRAM_COMPLETION_EVENT,
        entityType: 'Program',
        entityId: programSlug,
        sourcePage: 'lib/member/courseCompletion.ts',
        metadata: { programSlug, programTitle },
      }, tx);

      return createdAction;
    });

    await createNotification({
      userId: memberId,
      type: 'program_complete',
      title: `You finished ${programTitle}!`,
      body: "Congratulations — you're job-ready. Check out jobs matched to your new skills.",
      data: { link: '/dashboard/jobs', programSlug },
    });

    const counselors = await prisma.counselorAssignment.findMany({
      where: { memberId, active: true },
      select: { counselor: { select: { userId: true } } },
    });
    for (const assignment of counselors) {
      if (assignment.counselor?.userId) {
        await createNotification({
          userId: assignment.counselor.userId,
          type: 'program_complete',
          title: 'Member finished their program',
          body: `A member you counsel completed ${programTitle}. Their placement window starts now.`,
          data: { memberId, link: `/counselor/students/${memberId}` },
        });
      }
    }

    await recordWorkflowDiagnostic({
      workflow: 'career_os_program_completion',
      status: 'success',
      entityType: 'MemberNextBestAction',
      entityId: action.id,
      summary: `Program completion kit created for ${memberId}`,
      method: 'course_completion',
      metadata: { memberId, programSlug, programTitle },
    });

    return { created: true, actionId: action.id };
  } catch (error) {
    await recordWorkflowDiagnostic({
      workflow: 'career_os_program_completion',
      status: 'error',
      entityType: 'user',
      entityId: memberId,
      summary: 'Program completion workflow failed',
      method: 'course_completion',
      failureReason: error instanceof Error ? error.message : 'unknown_error',
      metadata: { programSlug, programTitle },
    });
    throw error;
  }
}
