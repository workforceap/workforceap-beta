import { prisma } from '../db/prisma';
import { generateResumeBullet } from '../ai/proactiveResumeGenerator';
import { findBestEmployerMatch } from '../ai/proactiveJobMatcher';
import { recordWorkflowDiagnostic, type WorkflowDiagnosticParams } from '../diagnostics';
import { createNotification } from '../notifications/create';
import { persistEvent } from '../events/track';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '../member/activeWrite';

type LearningCompletionResult = {
  actionId: string | null;
  created: boolean;
  duplicatedRecentAction: boolean;
  matchedJobId: string | null;
  resumeBullet: string;
};

const DUPLICATE_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 7;
export const CAREER_OS_WORKFLOW = 'career_os_learning_completion';

const inactiveLearningCompletion = (): LearningCompletionResult => ({
  actionId: null, created: false, duplicatedRecentAction: false,
  matchedJobId: null, resumeBullet: '',
});

async function recordActiveMemberDiagnostic(memberId: string, params: WorkflowDiagnosticParams): Promise<boolean> {
  try {
    await withActiveMemberWrite(memberId, (tx) => recordWorkflowDiagnostic(params, tx));
    return true;
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) return false;
    throw error;
  }
}

function normalizeCourseName(courseName: string) {
  return courseName.trim().replace(/\s+/g, ' ');
}

export async function handleLearningCompletion(memberId: string, courseName: string): Promise<LearningCompletionResult> {
  const normalizedCourseName = normalizeCourseName(courseName);
  const startedAt = Date.now();

  const active = await recordActiveMemberDiagnostic(memberId, {
    workflow: CAREER_OS_WORKFLOW,
    status: 'started',
    entityType: 'user',
    entityId: memberId,
    summary: `Processing learning completion for ${normalizedCourseName}`,
    method: 'webhook',
    metadata: { courseName: normalizedCourseName },
  });
  if (!active) return inactiveLearningCompletion();

  try {
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
      await withActiveMemberWrite(memberId, async (tx) => {
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
        }, tx);

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
        }, tx);
      });

      return {
        actionId: existingRecentAction.id,
        created: false,
        duplicatedRecentAction: true,
        matchedJobId: jobMatch?.id ?? null,
        resumeBullet: bullet,
      };
    }

    const action = await withActiveMemberWrite(memberId, async (tx) => {
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

      await recordWorkflowDiagnostic({
        workflow: CAREER_OS_WORKFLOW,
        status: 'success',
        entityType: 'MemberNextBestAction',
        entityId: createdAction.id,
        summary: jobMatch ? 'Created matched interview action' : 'Created resume follow-up action',
        provider: jobMatch ? 'job_matcher' : 'resume_only',
        method: 'webhook',
        metadata: {
          memberId,
          courseName: normalizedCourseName,
          matchedJobId: jobMatch?.id ?? null,
          durationMs: Date.now() - startedAt,
        },
      }, tx);

      return createdAction;
    });

    return {
      actionId: action.id,
      created: true,
      duplicatedRecentAction: false,
      matchedJobId: jobMatch?.id ?? null,
      resumeBullet: bullet,
    };
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) return inactiveLearningCompletion();
    const stillActive = await recordActiveMemberDiagnostic(memberId, {
      workflow: CAREER_OS_WORKFLOW,
      status: 'error',
      entityType: 'user',
      entityId: memberId,
      summary: 'Learning completion workflow failed',
      method: 'webhook',
      failureReason: error instanceof Error ? error.message : 'unknown_error',
      metadata: { courseName: normalizedCourseName },
    });
    if (!stillActive) return inactiveLearningCompletion();
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
    const action = await withActiveMemberWrite(memberId, async (tx) => {
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

      await recordWorkflowDiagnostic({
        workflow: 'career_os_program_completion',
        status: 'success',
        entityType: 'MemberNextBestAction',
        entityId: createdAction.id,
        summary: `Program completion kit created for ${memberId}`,
        method: 'course_completion',
        metadata: { memberId, programSlug, programTitle },
      }, tx);

      return createdAction;
    });

    await createNotification({
      userId: memberId,
      subjectMemberId: memberId,
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
          subjectMemberId: memberId,
          type: 'program_complete',
          title: 'Member finished their program',
          body: `A member you counsel completed ${programTitle}. Their placement window starts now.`,
          data: { memberId, link: `/counselor/students/${memberId}` },
        });
      }
    }

    return { created: true, actionId: action.id };
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) return { created: false, actionId: null };
    const stillActive = await recordActiveMemberDiagnostic(memberId, {
      workflow: 'career_os_program_completion',
      status: 'error',
      entityType: 'user',
      entityId: memberId,
      summary: 'Program completion workflow failed',
      method: 'course_completion',
      failureReason: error instanceof Error ? error.message : 'unknown_error',
      metadata: { programSlug, programTitle },
    });
    if (!stillActive) return { created: false, actionId: null };
    throw error;
  }
}
