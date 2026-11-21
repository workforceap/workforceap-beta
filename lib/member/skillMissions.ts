import 'server-only';

import { Prisma } from '@prisma/client';
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
import { persistEvent, type TrackEventParams } from '@/lib/events/track';

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

  // Streak: missions passed in a row from the first mission in the program,
  // stopping at the first one that is not passed. (It used to count back from
  // the LAST mission, which stayed 0 until the whole list was passed.)
  let streak = 0;
  for (const mission of missions) {
    if (mission.status !== 'passed') break;
    streak++;
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

type MissionVerdictArgs = {
  userId: string;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  assignedCourseSlug: string;
  result: MissionResult;
  aiToolResultId: string | null;
};

function buildVerdictEvent(args: MissionVerdictArgs): TrackEventParams {
  const key = buildSkillMissionEventKey({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
    missionCourseSlug: args.courseSlug,
  });
  return {
    userId: args.userId,
    eventName: args.result.verdict === 'passed' ? MISSION_EVENT_PASSED : MISSION_EVENT_RETRY,
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
  };
}

type MissionLockTx = Pick<Prisma.TransactionClient, '$executeRaw' | 'memberEvent'>;

/** Serialise attempts and verdict writes for one member and one mission.
    `$executeRaw`, never `$queryRaw`: pg_advisory_xact_lock returns void
    (lib/db/advisoryLockRawQuery.test.ts). The lock is held for the short
    reserve and commit transactions only, never across the AI call. */
async function lockMission(tx: MissionLockTx, userId: string, key: string): Promise<void> {
  const lockKey = `skill-mission:${userId}:${key}`;
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `);
}

type PassedMission = { result: MissionResult; aiToolResultId: string | null };

/** The stored pass for this mission, when the latest verdict event is a pass. */
async function findStoredPass(
  tx: MissionLockTx,
  userId: string,
  key: string,
): Promise<PassedMission | null> {
  const latest = await tx.memberEvent.findFirst({
    where: {
      userId,
      entityType: 'skill_checkpoint',
      entityId: key,
      eventName: { in: [MISSION_EVENT_PASSED, MISSION_EVENT_RETRY] },
    },
    orderBy: { createdAt: 'desc' },
    select: { eventName: true, metadata: true },
  });
  if (!latest || latest.eventName !== MISSION_EVENT_PASSED) return null;
  const parsed = parseMissionResult(latest.metadata);
  return {
    result: parsed.result ?? {
      verdict: 'passed',
      coachingNote: '',
      starStory: '',
      resumeBullet: '',
      skillsUnlocked: [],
    },
    aiToolResultId: parsed.aiToolResultId,
  };
}

/**
 * Admin override verdict write. It can set either verdict at any time, so it
 * does not check the course gate or the attempt cap. It does take the same
 * per-mission lock as member attempts, and a pass restated over a stored pass
 * writes nothing: a second `skill_mission_passed` event would show the
 * partner a second milestone for one pass (a double click, or "Force pass" on
 * a mission the member already passed). Member attempts go through
 * `commitMissionVerdict`, which refuses to duplicate or undo a pass.
 */
export async function recordMissionResult(args: MissionVerdictArgs): Promise<void> {
  const event = buildVerdictEvent(args);
  const key = event.entityId as string;
  await prisma.$transaction(async (tx) => {
    await lockMission(tx, args.userId, key);
    if (args.result.verdict === 'passed' && (await findStoredPass(tx, args.userId, key))) return;
    await persistEvent(event, tx);
  });
}

export type MissionAttemptReservation =
  | { kind: 'reserved'; alreadyPassed: boolean; submissionId: string }
  | { kind: 'cap_reached' };

/**
 * Claim one attempt. Under the per-mission lock it (1) enforces the
 * trailing-window attempt cap and (2) writes the submission event, in one
 * transaction, so parallel requests cannot all slip under the cap. It also
 * reports whether the mission is already passed: the Course practice screen
 * offers "Practice this skill again", so a passed member may be graded again
 * for feedback, but that practice never stores a second pass or undoes the
 * first (see `commitMissionVerdict`).
 */
export async function reserveMissionAttempt(args: {
  userId: string;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  assignedCourseSlug: string;
  maxAttempts: number;
  sinceHours: number;
}): Promise<MissionAttemptReservation> {
  const key = buildSkillMissionEventKey({
    programSlug: args.programSlug,
    curriculumVersion: args.curriculumVersion,
    missionCourseSlug: args.courseSlug,
  });
  return prisma.$transaction(async (tx) => {
    await lockMission(tx, args.userId, key);

    const alreadyPassed = (await findStoredPass(tx, args.userId, key)) !== null;

    const since = new Date(Date.now() - args.sinceHours * 60 * 60 * 1000);
    const recent = await tx.memberEvent.count({
      where: {
        userId: args.userId,
        entityType: 'skill_checkpoint',
        entityId: key,
        eventName: MISSION_EVENT_SUBMITTED,
        createdAt: { gte: since },
      },
    });
    if (recent >= args.maxAttempts) return { kind: 'cap_reached' } as const;

    const submission = await persistEvent({
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
    }, tx);
    return { kind: 'reserved', alreadyPassed, submissionId: submission.id } as const;
  });
}

/** Release only this request's reservation when no usable evaluation could be
    returned. In-flight reservations still count until released, so parallel
    requests cannot spend the same slot. Repeated cleanup is a no-op and cannot
    release a replacement request. Callers retain the reservation after returning
    a usable evaluation; this helper is only for failed requests. */
export async function releaseMissionAttempt(args: {
  userId: string;
  missionKey: string;
  submissionId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockMission(tx, args.userId, args.missionKey);
    await tx.memberEvent.deleteMany({
      where: {
        id: args.submissionId,
        userId: args.userId,
        entityType: 'skill_checkpoint',
        entityId: args.missionKey,
        eventName: MISSION_EVENT_SUBMITTED,
      },
    });
  });
}

export type MissionVerdictCommit =
  | { kind: 'recorded' }
  | ({ kind: 'already_passed' } & PassedMission);

/**
 * Store a graded attempt. Under the same lock, a mission that is already
 * passed keeps its pass: a second pass is not written (no duplicate
 * partner milestone) and a later non-pass cannot undo it. The caller gets
 * the stored pass back and can still show the member the feedback from this
 * attempt as practice.
 */
export async function commitMissionVerdict(args: MissionVerdictArgs): Promise<MissionVerdictCommit> {
  const event = buildVerdictEvent(args);
  const key = event.entityId as string;
  return prisma.$transaction(async (tx) => {
    await lockMission(tx, args.userId, key);
    const stored = await findStoredPass(tx, args.userId, key);
    if (stored) return { kind: 'already_passed', ...stored } as const;
    await persistEvent(event, tx);
    return { kind: 'recorded' } as const;
  });
}

export function getMissionDefinitionForKey(key: string): SkillMissionDefinition | null {
  return getMissionDefinitionForEventKey(key);
}
