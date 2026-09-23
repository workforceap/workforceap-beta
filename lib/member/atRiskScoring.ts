import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { memberReportedFactors } from '@/lib/member/counselorEscalation';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { getMemberEngagementSignals } from '@/lib/member/memberEngagementSignals';
import type { MemberEngagementSignals } from '@/lib/member/memberEngagementSignals';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';

// ─── Scoring Configuration ────────────────────────────────────────────────────

export interface AtRiskFactor {
  name: string;
  weight: number;
  description: string;
}

export interface AtRiskScore {
  userId: string;
  score: number; // 0–100
  factors: AtRiskFactor[];
  lastActivityAt: Date | null;
  recommendedAction: string;
}

const FACTORS = {
  NO_LOGIN_7_DAYS: { weight: 25, description: 'No login in 7 days' },
  NO_LOGIN_14_DAYS: { weight: 40, description: 'No login in 14 days' },
  NO_COURSE_ACTIVITY_7_DAYS: { weight: 15, description: 'No course activity in 7+ days' },
  NO_COURSE_ACTIVITY_14_DAYS: { weight: 25, description: 'No course activity in 14+ days' },
  NO_COURSE_ACTIVITY_30_DAYS: { weight: 35, description: 'No course activity in 30+ days' },
  INCOMPLETE_FIRST_COURSE: { weight: 20, description: 'Enrolled but has not started first course' },
  NO_COUNSELOR_MESSAGE_7_DAYS: { weight: 15, description: 'No counselor message in 7 days' },
  ASSESSMENT_INCOMPLETE: { weight: 25, description: 'Enrolled but assessment not completed' },
  NO_RESUME: { weight: 10, description: 'No resume uploaded' },
  NO_JOB_APPLICATIONS: { weight: 15, description: 'No job applications after placement-ready' },
} as const;

// Graduated in place of a flat "flagged stale" weight — severity now tracks
// actual days since the member's last CourseProgress touch (xAPI-driven),
// checked highest-first so only the matching tier's weight applies.
const COURSE_ACTIVITY_GAP_TIERS = [
  { minDays: 30, name: 'NO_COURSE_ACTIVITY_30_DAYS' as const },
  { minDays: 14, name: 'NO_COURSE_ACTIVITY_14_DAYS' as const },
  { minDays: 7, name: 'NO_COURSE_ACTIVITY_7_DAYS' as const },
];

export const THRESHOLDS = {
  CRITICAL: 70,
  HIGH: 50,
  MEDIUM: 30,
  LOW: 0,
} as const;

export function getRiskLevel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= THRESHOLDS.HIGH) return 'HIGH';
  if (score >= THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

// ─── Core Scoring Function ──────────────────────────────────────────────────

export async function calculateAtRiskScore(userId: string): Promise<AtRiskScore> {
  const [user, engagement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        enrolledProgram: true,
        courseraEnrollmentApproved: true,
        courseEnrollments: {
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          select: {
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
          },
        },
        assessmentCompleted: true,
        lastCourseraAutoSyncAt: true,
        createdAt: true,
        profile: {
          select: {
            resumeOriginalPath: true,
            resumeEnhancedPath: true,
          },
        },
        _count: {
          select: {
            jobApplications: true,
          },
        },
      },
    }),
    getMemberEngagementSignals(userId),
  ]);

  if (!user) {
    throw new Error(`Member not found: ${userId}`);
  }

  const factors: AtRiskFactor[] = [];
  let score = 0;

  // Login recency
  const daysSinceLogin = engagement.lastLoginAt
    ? Math.floor((Date.now() - engagement.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (daysSinceLogin >= 14) {
    score += FACTORS.NO_LOGIN_14_DAYS.weight;
    factors.push({ ...FACTORS.NO_LOGIN_14_DAYS, name: 'NO_LOGIN_14_DAYS' });
  } else if (daysSinceLogin >= 7) {
    score += FACTORS.NO_LOGIN_7_DAYS.weight;
    factors.push({ ...FACTORS.NO_LOGIN_7_DAYS, name: 'NO_LOGIN_7_DAYS' });
  }

  // Enrollment + training progress (prefer live B4B enrollmentReports when configured).
  // CourseEnrollment is authoritative over the transitional User pointer.
  const trainingAssignment = resolveTrainingProgressAssignment(
    user.enrolledProgram,
    user.courseEnrollments,
  );
  const activeProgramSlug = trainingAssignment.programSlug;
  if (activeProgramSlug) {
    const courseraProgramId =
      DISCOVERED_COURSERA_PROGRAMS[activeProgramSlug]?.courseraProgramId;
    const b4bProgress =
      user.email?.trim()
        ? await fetchLearnerProgressFromB4B(user.email, {
            programId: courseraProgramId,
          }).catch(() => new Map())
        : new Map();

    const trainingView = await loadMemberProgramTrainingView({
      userId,
      programSlug: activeProgramSlug,
      b4bProgress,
    });

    if (!trainingView?.hasStartedTraining) {
      // A saved program can still be waiting for funding/enrollment approval.
      // Only an approved member can be expected to start the first course.
      if (user.courseraEnrollmentApproved === true) {
        score += FACTORS.INCOMPLETE_FIRST_COURSE.weight;
        factors.push({ ...FACTORS.INCOMPLETE_FIRST_COURSE, name: 'INCOMPLETE_FIRST_COURSE' });
      }
    } else if (!trainingView.allCoursesComplete && trainingView.lastTrainingActivityAt) {
      // Started but has gone quiet — graduated by actual days since last
      // CourseProgress touch instead of a flat "flagged stale" weight.
      const daysSinceActivity = Math.floor(
        (Date.now() - trainingView.lastTrainingActivityAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const tier = COURSE_ACTIVITY_GAP_TIERS.find((t) => daysSinceActivity >= t.minDays);
      if (tier) {
        score += FACTORS[tier.name].weight;
        factors.push({ ...FACTORS[tier.name], name: tier.name });
      }
    }

    if (!user.assessmentCompleted) {
      score += FACTORS.ASSESSMENT_INCOMPLETE.weight;
      factors.push({ ...FACTORS.ASSESSMENT_INCOMPLETE, name: 'ASSESSMENT_INCOMPLETE' });
    }

    // Job applications (only if placement-ready: completed courses + assessment)
    if (
      trainingView &&
      trainingView.allCoursesComplete &&
      user.assessmentCompleted &&
      user._count.jobApplications === 0
    ) {
      score += FACTORS.NO_JOB_APPLICATIONS.weight;
      factors.push({ ...FACTORS.NO_JOB_APPLICATIONS, name: 'NO_JOB_APPLICATIONS' });
    }
  }

  // Counselor message recency
  const lastCounselorMessage = await prisma.message.findFirst({
    where: {
      thread: { memberId: userId },
      authorId: { not: userId },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (lastCounselorMessage) {
    const daysSinceCounselorMessage = Math.floor(
      (Date.now() - lastCounselorMessage.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCounselorMessage >= 7) {
      score += FACTORS.NO_COUNSELOR_MESSAGE_7_DAYS.weight;
      factors.push({ ...FACTORS.NO_COUNSELOR_MESSAGE_7_DAYS, name: 'NO_COUNSELOR_MESSAGE_7_DAYS' });
    }
  }

  // Resume
  const hasResume = !!(user.profile?.resumeOriginalPath || user.profile?.resumeEnhancedPath);
  if (!hasResume) {
    score += FACTORS.NO_RESUME.weight;
    factors.push({ ...FACTORS.NO_RESUME, name: 'NO_RESUME' });
  }

  // Cap at 100
  score = Math.min(100, score);

  const lastActivityAt = engagement.lastLoginAt ?? user.lastCourseraAutoSyncAt ?? user.createdAt;
  const recommendedAction = buildRecommendedAction(score, factors);

  return {
    userId,
    score,
    factors,
    lastActivityAt,
    recommendedAction,
  };
}

export function buildRecommendedAction(score: number, factors: AtRiskFactor[]): string {
  if (score >= THRESHOLDS.CRITICAL) {
    const topFactor = factors.sort((a, b) => b.weight - a.weight)[0];
    return `Immediate outreach needed: ${topFactor?.description ?? 'Multiple risk factors'}. Schedule call within 24 hours.`;
  }
  if (score >= THRESHOLDS.HIGH) {
    return 'Proactive outreach recommended: Send check-in message or schedule counseling session this week.';
  }
  if (score >= THRESHOLDS.MEDIUM) {
    return 'Monitor and include in weekly digest. Consider nudge if score increases.';
  }
  return 'Low risk. Continue standard support cadence.';
}

// ─── Batch Scoring ──────────────────────────────────────────────────────────

// ─── Tiered Classification (G5 retention loop) ──────────────────────────────
//
// Wraps the existing scoring helpers + getMemberState/staleTrainingCron data
// to produce a 3-tier label the nudge cron + counselor queue can switch on.
// Rules (PLAN-2026-Q3 §1.2 + §2.1 G5):
//   - green   active in last 3 days OR training on track
//   - yellow  3–7 days since login OR training stalled (no Coursera progress 5+ days)
//   - red     7+ days since login OR training stalled 14+ days
//             OR cert earned 30+ days ago with 0 job applications

export type AtRiskTier = 'green' | 'yellow' | 'red';

export type ClassifyMemberInput = {
  userId: string;
  /** ms since epoch of last portal login, or null. */
  lastLoginAt: Date | null;
  /** When the daily cron first flagged stalled training, or null. */
  staleTrainingDetectedAt: Date | null;
  /** Most recent training activity timestamp from memberProgramTrainingView. */
  lastTrainingActivityAt: Date | null;
  /** True once all enrolled program courses are complete. */
  allCoursesComplete: boolean;
  /** Earliest cert earnedAt (UserCertification.earnedAt) we've seen, or null. */
  earliestCertEarnedAt: Date | null;
  /** Total submitted job applications. */
  jobApplicationCount: number;
};

export type ClassifyMemberResult = {
  tier: AtRiskTier;
  reasons: string[];
  daysSinceLogin: number;
};

const DAY_MS = 86_400_000;

function daysBetween(from: Date | null, to: Date): number {
  if (!from) return Number.POSITIVE_INFINITY;
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Classify a member into green/yellow/red for the G5 retention loop.
 *
 * Pure function — pass the snapshot from {@link buildMemberClassificationInput}
 * (or any other source). No DB calls; safe to call in hot loops.
 */
export function classifyMember(input: ClassifyMemberInput): ClassifyMemberResult {
  const now = new Date();
  const daysSinceLogin = daysBetween(input.lastLoginAt, now);
  const daysStale = daysBetween(input.staleTrainingDetectedAt, now);
  const daysSinceTraining = daysBetween(input.lastTrainingActivityAt, now);
  const daysSinceCert = daysBetween(input.earliestCertEarnedAt, now);

  const reasons: string[] = [];
  const state: { tier: AtRiskTier } = { tier: 'green' };

  const bump = (next: AtRiskTier, reason: string) => {
    reasons.push(reason);
    if (next === 'red') state.tier = 'red';
    else if (next === 'yellow' && state.tier === 'green') state.tier = 'yellow';
  };

  // Red conditions
  if (Number.isFinite(daysSinceLogin) && daysSinceLogin >= 7) {
    bump('red', `No login in ${daysSinceLogin} days`);
  } else if (!Number.isFinite(daysSinceLogin)) {
    bump('red', 'Never logged into the portal');
  }

  if (input.staleTrainingDetectedAt && daysStale >= 14) {
    bump('red', `Training stalled for ${daysStale} days`);
  }

  if (
    input.earliestCertEarnedAt &&
    daysSinceCert >= 30 &&
    input.jobApplicationCount === 0
  ) {
    bump(
      'red',
      `Cert earned ${daysSinceCert} days ago with no job applications submitted`,
    );
  }

  // Yellow conditions (only escalate if not already red)
  if (
    state.tier !== 'red' &&
    Number.isFinite(daysSinceLogin) &&
    daysSinceLogin >= 3 &&
    daysSinceLogin < 7
  ) {
    bump('yellow', `${daysSinceLogin} days since last login`);
  }

  if (
    state.tier !== 'red' &&
    input.lastTrainingActivityAt &&
    daysSinceTraining >= 5 &&
    !input.allCoursesComplete
  ) {
    bump('yellow', `No Coursera progress in ${daysSinceTraining} days`);
  }

  if (
    state.tier !== 'red' &&
    input.staleTrainingDetectedAt &&
    daysStale >= 1 &&
    daysStale < 14
  ) {
    bump('yellow', `Training flagged stale (${daysStale}d ago)`);
  }

  if (state.tier === 'green' && reasons.length === 0) {
    reasons.push(
      Number.isFinite(daysSinceLogin)
        ? `Active ${daysSinceLogin}d ago`
        : 'Active recently',
    );
  }

  return {
    tier: state.tier,
    reasons,
    daysSinceLogin: Number.isFinite(daysSinceLogin) ? daysSinceLogin : 999,
  };
}

/**
 * Pull the snapshot needed by {@link classifyMember} for a single user.
 * Wraps existing helpers (getMemberEngagementSignals, loadMemberProgramTrainingView)
 * so callers don't have to re-implement the data fetch.
 */
export async function buildMemberClassificationInput(
  userId: string,
): Promise<ClassifyMemberInput> {
  const [user, engagement] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        enrolledProgram: true,
        courseEnrollments: {
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          select: {
            programSlug: true,
            curriculumVersion: true,
            isPrimary: true,
          },
        },
        staleTrainingDetectedAt: true,
        userCertifications: {
          orderBy: { earnedAt: 'asc' },
          select: { earnedAt: true },
          take: 1,
        },
        _count: { select: { jobApplications: true } },
      },
    }),
    getMemberEngagementSignals(userId),
  ]);

  if (!user) {
    throw new Error(`Member not found: ${userId}`);
  }

  let lastTrainingActivityAt: Date | null = null;
  let allCoursesComplete = false;

  const trainingAssignment = resolveTrainingProgressAssignment(
    user.enrolledProgram,
    user.courseEnrollments,
  );
  const activeProgramSlug = trainingAssignment.programSlug;
  if (activeProgramSlug) {
    const courseraProgramId =
      DISCOVERED_COURSERA_PROGRAMS[activeProgramSlug]?.courseraProgramId;
    const b4bProgress = user.email?.trim()
      ? await fetchLearnerProgressFromB4B(user.email, {
          programId: courseraProgramId,
        }).catch(() => new Map())
      : new Map();
    const trainingView = await loadMemberProgramTrainingView({
      userId,
      programSlug: activeProgramSlug,
      b4bProgress,
    });
    if (trainingView) {
      lastTrainingActivityAt = trainingView.lastTrainingActivityAt ?? null;
      allCoursesComplete = trainingView.allCoursesComplete;
    }
  }

  return {
    userId,
    lastLoginAt: engagement.lastLoginAt,
    staleTrainingDetectedAt: user.staleTrainingDetectedAt,
    lastTrainingActivityAt,
    allCoursesComplete,
    earliestCertEarnedAt: user.userCertifications[0]?.earnedAt ?? null,
    jobApplicationCount: user._count.jobApplications,
  };
}

// Bounded-concurrency batch size. Each member scored does a Prisma lookup
// plus an external B4B/Coursera HTTP call, so we fan out in small batches
// rather than looping sequentially (which could take minutes for 500
// members) or firing all requests at once (which could overwhelm the
// external API / DB pool).
const SCORING_BATCH_SIZE = 15;

/**
 * The population the nightly check scores and persists alerts for: member-role
 * accounts (`MEMBER_ONLY_WHERE`) enrolled in a program and not yet placed. At
 * risk = not active lately AND in a program (Mike, 2026-09-20), the same rule
 * every read side applies, so `at_risk_alerts` no longer fills with staff or
 * no-program alerts that the Command Center, /admin and counselor surfaces ignore.
 */
export const AT_RISK_SCORING_POPULATION_WHERE = {
  deletedAt: null,
  ...MEMBER_ONLY_WHERE,
  enrolledProgram: { not: null },
  // Exclude already placed members
  placementRecord: null,
} as const;

export async function calculateAllAtRiskScores(): Promise<AtRiskScore[]> {
  const activeMembers = await prisma.user.findMany({
    take: 500,
    where: AT_RISK_SCORING_POPULATION_WHERE,
    select: { id: true },
  });

  const scores: AtRiskScore[] = [];
  for (let i = 0; i < activeMembers.length; i += SCORING_BATCH_SIZE) {
    const batch = activeMembers.slice(i, i + SCORING_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (member) => {
        try {
          return await calculateAtRiskScore(member.id);
        } catch (err) {
          console.error(`[atRisk] Failed to score member ${member.id}:`, err);
          return null;
        }
      }),
    );
    for (const result of batchResults) {
      if (result) scores.push(result);
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}

// ─── Alert Persistence ──────────────────────────────────────────────────────

/** JSON.stringify with object keys sorted, so jsonb key reordering does not count as a change. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export async function persistAtRiskAlert(score: AtRiskScore): Promise<void> {
  const existing = await prisma.atRiskAlert.findFirst({
    where: {
      userId: score.userId,
      status: { in: ['open', 'acknowledged'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Update if score changed significantly (>10 points)
    if (Math.abs(existing.score - score.score) > 10) {
      // A member-reported escalation (escalateToCounselor) survives a
      // rescore: keep its factors next to the fresh scorer factors and never
      // drop below the escalation's score floor. Without one, overwrite.
      const kept = memberReportedFactors(existing.factors);
      let factors: unknown[] = score.factors;
      let nextScore = score.score;
      if (kept.length > 0) {
        const seen = new Set(score.factors.map((f) => f.name));
        factors = [...score.factors];
        for (const f of kept) {
          if (seen.has(f.name)) continue;
          seen.add(f.name);
          factors.push(f);
        }
        nextScore = Math.max(score.score, existing.score);
        // Nothing changed (same floor, same factors): skip the write so the
        // nightly run does not bump updatedAt, which readers use as lastActivityAt.
        // Compare key-order-insensitively: jsonb returns object keys in its own
        // order (name, weight, description) while scorer factors are built as
        // { weight, description, name }, so a plain JSON.stringify never matches.
        if (nextScore === existing.score && canonicalJson(factors) === canonicalJson(existing.factors)) {
          return;
        }
      }
      await prisma.atRiskAlert.update({
        where: { id: existing.id },
        data: {
          score: nextScore,
          factors: factors as any,
          updatedAt: new Date(),
        },
      });
    }
  } else {
    await prisma.atRiskAlert.create({
      data: {
        userId: score.userId,
        score: score.score,
        factors: score.factors as any,
        status: 'open',
      },
    });
  }
}

/**
 * Read the persisted risk picture instead of re-scoring (WAP-30 / TODO-006).
 * The nightly `at-risk-check` is the single scorer; every consumer that needs
 * scores between runs — the weekly counselor alert, the command centers, the
 * at-risk dashboard — reads `AtRiskAlert` so they all agree on the same day.
 * Returns one score per member with an open/acknowledged alert at or above
 * `minScore`, newest alert first per member.
 */
export async function loadPersistedAtRiskScores(minScore: number = THRESHOLDS.MEDIUM): Promise<AtRiskScore[]> {
  const alerts = await prisma.atRiskAlert.findMany({
    where: { status: { in: ['open', 'acknowledged'] }, score: { gte: minScore }, user: { deletedAt: null } },
    orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
    select: { userId: true, score: true, factors: true, updatedAt: true },
    take: 2000,
  });
  const seen = new Set<string>();
  const scores: AtRiskScore[] = [];
  for (const alert of alerts) {
    if (seen.has(alert.userId)) continue;
    seen.add(alert.userId);
    const factors = Array.isArray(alert.factors) ? (alert.factors as unknown as AtRiskFactor[]) : [];
    scores.push({
      userId: alert.userId,
      score: alert.score,
      factors,
      lastActivityAt: alert.updatedAt,
      recommendedAction: buildRecommendedAction(alert.score, [...factors]),
    });
  }
  return scores;
}
