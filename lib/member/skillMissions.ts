import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { EventName } from '@/lib/events/names';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  type SkillMissionDefinition,
} from '@/lib/content/skillMissionCatalog';
import { isMissionCourseComplete } from '@/lib/member/missionCourseUnlock';
import {
  buildSkillMissionEventKey,
  getMissionDefinitionForEventKey,
  resolveSkillMissionsForCurriculum,
} from '@/lib/member/skillMissionCurriculum';
import { persistEvent } from '@/lib/events/track';

export { type SkillMissionDefinition };

export const MISSION_EVENT_SUBMITTED = 'skill_mission_submitted' satisfies EventName;
export const MISSION_EVENT_PASSED = 'skill_mission_passed' satisfies EventName;
export const MISSION_EVENT_RETRY = 'skill_mission_needs_retry' satisfies EventName;

export type MissionStatus = 'locked' | 'ready' | 'passed' | 'needs_retry';

export type MissionResult = {
  verdict: 'passed' | 'needs_retry';
  coachingNote: string;
  starStory: string;
  resumeBullet: string;
  skillsUnlocked: string[];
};

/** Quiz question as exposed to the client — correctIndex and explanation are
    server-only so answers can't be read out of the RSC payload/page source.
    Grading and feedback happen via the quiz-check + evaluate endpoints. */
export type ClientQuizQuestion = {
  text: string;
  options: [string, string, string, string];
};

export type SkillMissionSummaryItem = Omit<SkillMissionDefinition, 'quizQuestions'> & {
  quizQuestions: ClientQuizQuestion[];
  status: MissionStatus;
  completedAt: Date | null;
  latestResult: MissionResult | null;
  aiToolResultId: string | null;
};

export type SkillMissionSummary = {
  programSlug: string;
  programTitle: string | null;
  totalMissions: number;
  passedCount: number;
  readyCount: number;
  retryCount: number;
  streak: number;
  careerReadinessPct: number;
  demonstratedSkills: string[];
  missions: SkillMissionSummaryItem[];
};

export async function loadSkillMissionSummary(args: {
  userId: string;
  programSlug: string | null;
  curriculumVersion: string;
  completedCourseSlugs: string[];
}): Promise<SkillMissionSummary | null> {
  if (!args.programSlug) return null;
  const resolvedMissions = resolveSkillMissionsForCurriculum({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
  });
  if (!resolvedMissions.length) return null;

  const missionKeys = resolvedMissions.map(({ definition }) =>
    buildSkillMissionEventKey({
      programSlug: args.programSlug!,
      curriculumVersion: args.curriculumVersion,
      missionCourseSlug: definition.courseSlug,
    }),
  );

  const events = await prisma.memberEvent.findMany({
    where: {
      userId: args.userId,
      entityType: 'skill_checkpoint',
      entityId: { in: missionKeys },
      eventName: { in: [MISSION_EVENT_PASSED, MISSION_EVENT_RETRY] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      eventName: true,
      entityId: true,
      createdAt: true,
      metadata: true,
    },
  });

  // Build map of entityId → latest event (most recent createdAt wins due to asc order)
  const latestEventMap = new Map<
    string,
    { eventName: string; createdAt: Date; metadata: unknown }
  >();
  for (const event of events) {
    if (event.entityId) {
      latestEventMap.set(event.entityId, {
        eventName: event.eventName,
        createdAt: event.createdAt,
        metadata: event.metadata,
      });
    }
  }

  function asRecord(v: unknown): Record<string, unknown> | null {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  }

  function parseMissionResult(metadata: unknown): {
    result: MissionResult | null;
    aiToolResultId: string | null;
  } {
    const rec = asRecord(metadata);
    if (!rec) return { result: null, aiToolResultId: null };

    const verdict = rec['verdict'];
    if (verdict !== 'passed' && verdict !== 'needs_retry') {
      return { result: null, aiToolResultId: null };
    }

    const coachingNote = typeof rec['coachingNote'] === 'string' ? rec['coachingNote'] : '';
    const starStory = typeof rec['starStory'] === 'string' ? rec['starStory'] : '';
    const resumeBullet = typeof rec['resumeBullet'] === 'string' ? rec['resumeBullet'] : '';
    const rawSkills = rec['skillsUnlocked'];
    const skillsUnlocked: string[] = Array.isArray(rawSkills)
      ? rawSkills.filter((s): s is string => typeof s === 'string')
      : [];
    const aiToolResultId =
      typeof rec['aiToolResultId'] === 'string' ? rec['aiToolResultId'] : null;

    return {
      result: { verdict, coachingNote, starStory, resumeBullet, skillsUnlocked },
      aiToolResultId,
    };
  }

  const missions: SkillMissionSummaryItem[] = resolvedMissions.map((resolved) => {
    const def = resolved.definition;
    const eventKey = buildSkillMissionEventKey({
      programSlug: args.programSlug!,
      curriculumVersion: args.curriculumVersion,
      missionCourseSlug: def.courseSlug,
    });
    const latestEvent = latestEventMap.get(eventKey) ?? null;

    let status: MissionStatus;
    if (!isMissionCourseComplete(resolved.unlockSlugs, args.completedCourseSlugs)) {
      status = 'locked';
    } else if (latestEvent?.eventName === MISSION_EVENT_PASSED) {
      status = 'passed';
    } else if (latestEvent?.eventName === MISSION_EVENT_RETRY) {
      status = 'needs_retry';
    } else {
      status = 'ready';
    }

    const { result: latestResult, aiToolResultId } = parseMissionResult(
      latestEvent?.metadata ?? null,
    );

    const completedAt =
      latestEvent?.eventName === MISSION_EVENT_PASSED ? latestEvent.createdAt : null;

    return {
      ...def,
      key: eventKey,
      // Strip answers/explanations — see ClientQuizQuestion.
      quizQuestions: def.quizQuestions.map((q) => ({ text: q.text, options: q.options })),
      status,
      completedAt,
      latestResult,
      aiToolResultId,
    };
  });

  // Streak: count consecutive 'passed' from the END, stop at first non-passed
  let streak = 0;
  for (let i = missions.length - 1; i >= 0; i--) {
    if (missions[i].status === 'passed') {
      streak++;
    } else {
      break;
    }
  }

  // demonstratedSkills: unique skill labels from passed missions
  const skillSet = new Set<string>();
  for (const m of missions) {
    if (m.status === 'passed' && m.skillLabels) {
      for (const label of m.skillLabels) {
        skillSet.add(label);
      }
    }
  }
  const demonstratedSkills = Array.from(skillSet);

  const passedCount = missions.filter((m) => m.status === 'passed').length;
  const readyCount = missions.filter((m) => m.status === 'ready').length;
  const retryCount = missions.filter((m) => m.status === 'needs_retry').length;
  const totalMissions = resolvedMissions.length;
  const careerReadinessPct = Math.round((passedCount / totalMissions) * 100);

  return {
    programSlug: args.programSlug,
    programTitle: getProgramBySlug(args.programSlug)?.title ?? null,
    totalMissions,
    passedCount,
    readyCount,
    retryCount,
    streak,
    careerReadinessPct,
    demonstratedSkills,
    missions,
  };
}

export async function recordMissionResult(args: {
  userId: string;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  assignedCourseSlug: string;
  result: MissionResult;
  aiToolResultId: string | null;
}): Promise<void> {
  const key = buildSkillMissionEventKey({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
    missionCourseSlug: args.courseSlug,
  });
  const eventName =
    args.result.verdict === 'passed' ? MISSION_EVENT_PASSED : MISSION_EVENT_RETRY;

  await persistEvent({
    userId: args.userId,
    eventName,
    entityType: 'skill_checkpoint',
    entityId: key,
    sourcePage: '/member/missions',
    metadata: {
      ...args.result,
      aiToolResultId: args.aiToolResultId,
      courseSlug: args.courseSlug,
      assignedCourseSlug: args.assignedCourseSlug,
      programSlug: args.programSlug,
      curriculumVersion: args.curriculumVersion,
      recordedAt: new Date().toISOString(),
    },
  }, prisma);
}

/** Record a submission attempt (counted toward the daily attempt cap even
    when the AI eval fails, so failures can't be retried infinitely). */
export async function recordMissionSubmission(args: {
  userId: string;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  assignedCourseSlug: string;
}): Promise<void> {
  const key = buildSkillMissionEventKey({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
    missionCourseSlug: args.courseSlug,
  });
  await persistEvent({
    userId: args.userId,
    eventName: MISSION_EVENT_SUBMITTED,
    entityType: 'skill_checkpoint',
    entityId: key,
    sourcePage: '/member/missions',
    metadata: {
      courseSlug: args.courseSlug,
      assignedCourseSlug: args.assignedCourseSlug,
      programSlug: args.programSlug,
      curriculumVersion: args.curriculumVersion,
    },
  }, prisma);
}

/** Count submissions for a mission within the trailing window — used for the
    per-mission daily attempt cap on the LLM-backed evaluate endpoint. */
export async function countRecentMissionSubmissions(args: {
  userId: string;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  sinceHours: number;
}): Promise<number> {
  const key = buildSkillMissionEventKey({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
    missionCourseSlug: args.courseSlug,
  });
  const since = new Date(Date.now() - args.sinceHours * 60 * 60 * 1000);
  return prisma.memberEvent.count({
    where: {
      userId: args.userId,
      entityType: 'skill_checkpoint',
      entityId: key,
      eventName: MISSION_EVENT_SUBMITTED,
      createdAt: { gte: since },
    },
  });
}

export function getMissionDefinitionForKey(key: string): SkillMissionDefinition | null {
  return getMissionDefinitionForEventKey(key);
}
