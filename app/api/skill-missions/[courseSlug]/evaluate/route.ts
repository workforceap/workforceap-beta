import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { prisma } from '@/lib/db/prisma';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import {
  discardMissionArtifact,
  evaluateSkillMission,
  MissionEvalUnavailableError,
  saveMissionArtifact,
} from '@/lib/ai/skillMissionEval';
import {
  commitMissionVerdict,
  reserveMissionAttempt,
} from '@/lib/member/skillMissions';
import {
  buildSkillMissionEventKey,
  parseSkillMissionEventKey,
  resolveSkillMissionAssignment,
  resolveSkillMissionForCurriculum,
} from '@/lib/member/skillMissionCurriculum';
import { programSlugReadCandidates } from '@/lib/content/programSlug';
import type { MissionEvalErrorCode, MissionEvalResponse, MissionResult } from '@/lib/ai/skillMissionEval';

const MAX_ATTEMPTS_PER_DAY = 5;

const MIN_RESPONSE_CHARS = 20;
const MAX_RESPONSE_CHARS = 4000;

/* No `correct` flag and no programSlug from the client: the quiz is graded
   server-side against the catalog, and the program is bound to the member's
   enrollment. The response is trimmed before its length is checked, so
   whitespace cannot stand in for an answer and spend an AI call. */
const bodySchema = z.object({
  missionKey: z.string().min(1).max(300),
  quizAnswers: z
    .array(
      z.object({
        questionIndex: z.number().int().min(0).max(2),
        selectedIndex: z.number().int().min(0).max(3),
      })
    )
    .length(3),
  scenarioResponse: z
    .string()
    .trim()
    .min(MIN_RESPONSE_CHARS, `Write at least ${MIN_RESPONSE_CHARS} characters so the coach has something to review.`)
    .max(MAX_RESPONSE_CHARS, `Keep your response under ${MAX_RESPONSE_CHARS} characters.`),
});

function fail(error: string, status: number, code?: MissionEvalErrorCode) {
  return NextResponse.json({ ok: false, error, ...(code ? { code } : {}) } satisfies MissionEvalResponse, { status });
}

export const POST = withApiGuc(
  async (
    request: NextRequest,
    context: { params: Promise<{ courseSlug: string }> }
  ) => {
    try {
      // 1. Auth
      const user = await getUser();
      if (!user) return fail('Unauthorized', 401, 'unauthorized');

      // 2. Rate limit — this endpoint makes up to 2 LLM round-trips per call
      const { success: withinRateLimit } = await checkAIToolRateLimit(user.id);
      if (!withinRateLimit) {
        return fail('Rate limit exceeded. Please try again in a few minutes.', 429, 'rate_limited');
      }

      // 3. Validate body
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return fail('Invalid JSON', 400);
      }
      const parsed = bodySchema.safeParse(rawBody);
      if (!parsed.success) {
        return fail(parsed.error.errors[0]?.message ?? 'Validation failed', 400);
      }
      const { missionKey, quizAnswers, scenarioResponse } = parsed.data;
      const requestedMission = parseSkillMissionEventKey(missionKey);
      if (!requestedMission) return fail('Mission not found', 404, 'mission_not_found');

      // Each question must be answered exactly once
      const answeredIndexes = new Set(quizAnswers.map((a) => a.questionIndex));
      if (answeredIndexes.size !== 3) {
        return fail('Each quiz question must be answered exactly once.', 400);
      }

      const { courseSlug } = await context.params;

      // 4. Bind the program to the member's enrollment — never to the body
      const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id: user.id },
        select: {
          enrolledProgram: true,
          courseEnrollments: {
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          },
        },
      }));
      const assignment = resolveSkillMissionAssignment({
        enrolledProgram: dbUser?.enrolledProgram,
        enrollments: dbUser?.courseEnrollments ?? [],
        requestedProgramSlug: requestedMission.programSlug,
      });
      if (!assignment) {
        return fail('You must be enrolled in a program to attempt skill missions.', 403, 'not_enrolled');
      }
      const { programSlug, curriculumVersion } = assignment;

      // 5. Look up the mission for (enrolled program, course) and verify the
      //    client is talking about the same mission
      const resolvedMission = resolveSkillMissionForCurriculum({
        programSlug,
        curriculumVersion,
        missionCourseSlug: courseSlug,
      });
      const expectedMissionKey = resolvedMission
        ? buildSkillMissionEventKey({
            programSlug,
            curriculumVersion,
            missionCourseSlug: resolvedMission.definition.courseSlug,
          })
        : null;
      if (!resolvedMission || expectedMissionKey !== missionKey) {
        return fail('Mission not found', 404, 'mission_not_found');
      }
      const missionDef = resolvedMission.definition;

      // 6. Verify the student has completed this course
      const progress = await prisma.$transaction((tx) => tx.courseProgress.findFirst({
        where: {
          userId: user.id,
          programSlug: { in: programSlugReadCandidates(programSlug) },
          courseSlug: { in: resolvedMission.unlockSlugs },
          status: 'COMPLETED',
        },
        select: { id: true },
      }));
      if (!progress) {
        return fail('You must complete this course before attempting its skill mission.', 403, 'course_incomplete');
      }

      // 7. Grade the quiz server-side against the catalog
      const quizCorrectCount = quizAnswers.reduce((count, answer) => {
        const question = missionDef.quizQuestions[answer.questionIndex];
        return question && question.correctIndex === answer.selectedIndex ? count + 1 : count;
      }, 0);

      // 8. Claim an attempt. Under a per-mission lock this enforces the daily
      //    cap (AI-failed attempts count too) and writes the submission event.
      //    It also says whether the mission is already passed: a passed member
      //    can practise again and get feedback, but never a second pass.
      const reservation = await reserveMissionAttempt({
        userId: user.id,
        programSlug,
        curriculumVersion,
        courseSlug,
        assignedCourseSlug: resolvedMission.assignedCourseSlug,
        maxAttempts: MAX_ATTEMPTS_PER_DAY,
        sinceHours: 24,
      });
      if (reservation.kind === 'cap_reached') {
        return fail(
          'Daily attempt limit reached for this mission. Take a break and come back tomorrow.',
          429,
          'attempt_cap'
        );
      }

      // 9. Run AI evaluation (throws MissionEvalUnavailableError on AI failure
      //    — nothing is persisted in that case and the mission stays unpassed)
      let evalResult: MissionResult;
      try {
        evalResult = await evaluateSkillMission({
          courseSlug: resolvedMission.assignedCourseSlug,
          programSlug,
          missionKey,
          courseTitle: missionDef.courseTitle,
          skillLabels: missionDef.skillLabels,
          scenarioPrompt: missionDef.scenarioPrompt,
          evidenceHint: missionDef.evidenceHint,
          quizCorrectCount,
          quizTotal: missionDef.quizQuestions.length,
          scenarioResponse,
          userId: user.id,
        });
      } catch (evalErr) {
        if (evalErr instanceof MissionEvalUnavailableError) {
          return fail(
            'Our coach is unavailable right now. Your response was not graded. Please try again in a few minutes.',
            503,
            'coach_unavailable'
          );
        }
        throw evalErr;
      }

      // 10. Store the verdict. A pass is only reported once it is stored: if
      //     the write fails the member gets a retryable error and the mission
      //     stays unpassed. A non-pass that fails to store still returns its
      //     coaching, since it claims nothing the saved state contradicts.
      const practiceOnly = reservation.alreadyPassed;
      const aiToolResultId = evalResult.verdict === 'passed' && !practiceOnly
        ? await saveMissionArtifact({
            userId: user.id,
            courseTitle: missionDef.courseTitle,
            programSlug,
            skillLabels: missionDef.skillLabels,
            starStory: evalResult.starStory,
            resumeBullet: evalResult.resumeBullet,
          })
        : null;
      let committed: Awaited<ReturnType<typeof commitMissionVerdict>> | null = null;
      try {
        committed = await commitMissionVerdict({
          userId: user.id,
          courseSlug,
          programSlug,
          curriculumVersion,
          assignedCourseSlug: resolvedMission.assignedCourseSlug,
          result: evalResult,
          aiToolResultId,
        });
      } catch (recordErr) {
        console.error('[skill-missions/evaluate] commitMissionVerdict failed:', recordErr instanceof Error ? recordErr.message : recordErr);
        if (aiToolResultId) await discardMissionArtifact(user.id, aiToolResultId);
        if (evalResult.verdict === 'passed' && !practiceOnly) {
          return fail('We could not save your result. Your mission is not marked passed yet. Please try again.', 503, 'save_failed');
        }
      }
      // Already passed, or a parallel request stored the pass first: the stored
      // pass stands. Return this attempt's feedback as practice and keep only
      // the first Resume Studio copy.
      const storedPass = committed?.kind === 'already_passed' ? committed : null;
      if (storedPass && aiToolResultId) await discardMissionArtifact(user.id, aiToolResultId);

      // 11. Return the evaluation result
      const response: MissionEvalResponse = {
        ok: true,
        verdict: evalResult.verdict,
        coachingNote: evalResult.coachingNote,
        starStory: evalResult.starStory,
        resumeBullet: evalResult.resumeBullet,
        skillsUnlocked: evalResult.skillsUnlocked,
        quizCorrectCount,
        aiToolResultId: storedPass ? storedPass.aiToolResultId : aiToolResultId,
        ...(storedPass || practiceOnly ? { alreadyPassed: true } : {}),
      };
      return NextResponse.json(response);
    } catch (err) {
      console.error('[skill-missions/evaluate] unhandled error:', err instanceof Error ? err.message : err);
      return fail('Something went wrong on our side. Your response was not graded. Please try again.', 500, 'server_error');
    }
  }
);
