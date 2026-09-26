import { prisma } from '@/lib/db/prisma';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { buildMemberApplicationStatusView, type MemberApplicationStatusView } from './memberApplicationStatus';
import { loadMemberProgramTrainingView, type MemberProgramTrainingView } from './memberProgramTrainingView';
import { getProfileCompleteness, getProfileMissingFields } from '@/lib/resume/profileCompleteness';
import { buildNextBestActions, type NextBestAction, type NextBestActionsContext } from './nextBestActions';
import { getMemberEngagementSignals, type MemberEngagementSignals } from './memberEngagementSignals';
import { getMemberResumePlainText } from './getMemberResumePlainText';
import type { CareerMatchResult } from '@/lib/onet/types';
import type { LearnerProgressByContent } from '@/lib/coursera/learnerProgress';
import { resolveActiveDashboardProgram } from './resolveActiveDashboardProgram';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from './starterProfileReview';
import { deriveTrainingMilestoneTruth } from '@/lib/coursera/milestones';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemberChecklist = {
  createAccount: true;
  chooseProgram: boolean;
  completeAssessment: boolean;
  startFirstCourse: boolean;
  completeFirstCourse: boolean;
};

export type MemberState = {
  userId: string;
  email: string;
  fullName: string | null;
  contactPhone: string | null;

  // Application
  application: MemberApplicationStatusView | null;

  // Program / Training
  enrolledProgram: string | null;
  programName: string | null;
  trainingView: MemberProgramTrainingView | null;
  assessmentCompleted: boolean;

  // Profile
  profileCompletenessPct: number;
  profileMissingFields: string[];
  profile: {
    employmentStatus: string | null;
    educationLevel: string | null;
  } | null;

  // Engagement / Artifacts
  hasResume: boolean;
  hasCompletedInterviewPractice: boolean;
  jobApplicationCount: number;
  counselorUnreadCount: number;
  weeklyRecapUnopened: boolean;

  // Career
  careerRecommendation: CareerMatchResult | null;
  inferredTargetRole: string | null;

  // Recorded training progress; legacy field name, not credential evidence (0–100)
  firstCertProgressPercent: number;

  // Derived
  checklist: MemberChecklist;
  nextBestActions: NextBestAction[];
  stateLetter: 'A' | 'B' | 'C' | 'D';
};

export type MemberStateFull = MemberState & {
  placement: { placedAt: Date | null; retentionDecision: string | null; onboardingWindowEnd: Date | null } | null;
  courseEnrollment: { enrolledByAdminId: string | null; id: string } | null;
  counselorAssignment: { counselorName: string | null; assignedAt: Date | null } | null;
  recentMessages: { unreadCount: number; lastMessageAt: Date | null };
  memberEvents: Array<{ type: string; createdAt: Date; metadata?: Record<string, unknown> }>;
  partnerContext: { partnerName: string | null; referralSource: string | null } | null;
};

// ─── Core Data Fetch ─────────────────────────────────────────────────────────

async function loadMemberCore(userId: string) {
  const user = await prisma.$transaction((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        courseEnrollments: {
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          select: { id: true, programSlug: true, isPrimary: true, enrolledAt: true, enrolledByAdminId: true },
        },
        enrolledProgram: true,
        enrolledAt: true,
        assessmentCompleted: true,
        assessmentCompletedAt: true,
        careerRecommendationJson: true,
        programInterest: true,
        interviewEligible: true,
        interviewRequestedAt: true,
        interviewCompletedAt: true,
        onboardingCompletedAt: true,
        tourCompletedAt: true,
        needsComputerSupportFollowUp: true,
        workspaceEmail: true,
        workspaceEmailProvisioned: true,
        preScreeningResponse: { select: { id: true } },
        profile: {
          select: {
            profilePhone: true,
            profileAddress: true,
            profileLinkedin: true,
            profileBio: true,
            employmentStatus: true,
            educationLevel: true,
            resumeOriginalPath: true,
            resumeEnhancedPath: true,
            referralSource: true,
            city: true,
            state: true,
            zip: true,
            dob: true,
            isMinor: true,
          },
        },
        applications: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            programInterest: true,
            submittedAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            jobApplications: true,
          },
        },
      },
    })
  );
  return user;
}

async function loadEngagement(userId: string): Promise<MemberEngagementSignals> {
  return getMemberEngagementSignals(userId);
}

async function loadLatestResumeText(
  userId: string,
  opts: { readOnlyAudit?: boolean } = {},
): Promise<string | null> {
  if (!opts.readOnlyAudit) {
    // Best-effort: a storage or configuration failure here must not take the
    // member dashboard down; fall through to the last resume analysis instead.
    let fromFile = '';
    try {
      fromFile = await getMemberResumePlainText(userId, 8000, { preferOriginal: true });
    } catch (err) {
      console.error('[getMemberState] resume text unavailable, using last analysis:', err instanceof Error ? err.message : String(err));
    }
    if (fromFile && fromFile.trim().length > 40) return fromFile.trim();
  }

  const aiResult = await prisma.$transaction((tx) =>
    tx.aIToolResult.findFirst({
      where: { userId, toolType: 'resume_analysis' },
      orderBy: { createdAt: 'desc' },
      select: { output: true },
    })
  );
  if (aiResult?.output && aiResult.output.trim().length > 40) return aiResult.output.trim().slice(0, 8000);

  return null;
}

async function loadHasCompletedInterviewPractice(userId: string): Promise<boolean> {
  const event = await prisma.$transaction((tx) =>
    tx.memberEvent.findFirst({
      where: { userId, eventName: 'career_os.interview_practice_completed' },
      select: { id: true },
    })
  );

  return !!event;
}

type PlacementForActions = {
  placedAt: Date | null;
  retentionDecision: string | null;
  retentionStatus: string | null;
} | null;

/**
 * Cheap single-row lookup on PlacementRecord's unique `userId` so the
 * dashboard's next-best-actions can render the placement_retention_window_90/180
 * nudges (lib/member/nextBestActions.ts) and the job-loss re-activation nudge
 * for separated members. Previously `_getMemberStateUncached` hardcoded
 * placementPlacedAt/placementRetentionDecision to null here even though
 * `loadMemberFullContext` below fetches the same PlacementRecord for the
 * admin/counselor full-state view — those nudges could never render for a
 * placed member on their own dashboard.
 */
async function loadPlacementForActions(userId: string): Promise<PlacementForActions> {
  return prisma.$transaction((tx) =>
    tx.placementRecord.findUnique({
      where: { userId },
      select: { placedAt: true, retentionDecision: true, retentionStatus: true },
    })
  );
}

/** True when the placement's retention outcome indicates the member lost/left the job. */
function isPlacementSeparated(placement: PlacementForActions): boolean {
  if (!placement) return false;
  return (
    placement.retentionDecision === 'not_retained' || placement.retentionStatus === 'separated'
  );
}

function inferTargetRole(
  careerRec: CareerMatchResult | null,
  programInterest: string | null,
  enrolledProgram: string | null
): string | null {
  if (careerRec?.topOccupations?.[0]?.title) {
    return careerRec.topOccupations[0].title;
  }
  if (programInterest) {
    return programInterest;
  }
  if (enrolledProgram) {
    return programDisplayTitle(enrolledProgram);
  }
  return null;
}

function deriveStateLetter(args: {
  applicationExists: boolean;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
}): 'A' | 'B' | 'C' | 'D' {
  const { applicationExists, enrolledProgram, assessmentCompleted } = args;
  if (!applicationExists) return 'A';
  if (!enrolledProgram) return 'B';
  if (!assessmentCompleted) return 'C';
  return 'D';
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type GetMemberStateOptions = {
  b4bProgress?: LearnerProgressByContent;
  activeProgramSlug?: string | null;
  /** Avoid shared caches and external resume-storage reads during release audits. */
  readOnlyAudit?: boolean;
};

async function _getMemberStateUncached(
  userId: string,
  opts: GetMemberStateOptions = {},
): Promise<MemberState> {
  const [user, engagement, latestResumeText, hasCompletedInterviewPractice, placementForActions] = await Promise.all([
    loadMemberCore(userId),
    loadEngagement(userId),
    loadLatestResumeText(userId, { readOnlyAudit: opts.readOnlyAudit }),
    loadHasCompletedInterviewPractice(userId),
    loadPlacementForActions(userId),
  ]);

  if (!user) {
    throw new Error(`Member not found: ${userId}`);
  }

  const profile = user.profile;
  const latestApplication = user.applications[0] ?? null;

  const enrollments = user.courseEnrollments ?? [];
  const { activeProgramSlug: programSlugForTraining } = resolveActiveDashboardProgram({
    enrollments,
    legacyEnrolledProgram: user.enrolledProgram,
    requestedProgramSlug: opts.activeProgramSlug,
  });
  const activeEnrollment = enrollments.find((row) =>
    programSlugForTraining && programSlugsEquivalent(row.programSlug, programSlugForTraining),
  );
  const starterReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!enrollments.find((row) => row.isPrimary)?.enrolledByAdminId,
    phone: user.phone,
    ...profile,
  });

  const trainingView = programSlugForTraining
    ? await loadMemberProgramTrainingView({
        userId: user.id,
        programSlug: programSlugForTraining,
        b4bProgress: opts.b4bProgress,
        readOnlyAudit: opts.readOnlyAudit,
      })
    : null;

  const application = latestApplication
    ? buildMemberApplicationStatusView(
        latestApplication,
        {
          enrolledProgram: programSlugForTraining,
          enrolledAt: user.enrolledAt,
          assessmentCompleted: user.assessmentCompleted,
        },
        {
          preScreeningDone: !!user.preScreeningResponse,
          interviewEligible: user.interviewEligible ?? false,
          interviewRequested: !!user.interviewRequestedAt,
          interviewCompleted: !!user.interviewCompletedAt,
        }
      )
    : null;

  const profileCompletenessPct = getProfileCompleteness(profile, {
    fullName: user.fullName,
    email: user.email,
    enrolledProgram: programSlugForTraining,
    assessmentCompleted: user.assessmentCompleted,
  });
  const profileMissingFields = getProfileMissingFields(profile, {
    fullName: user.fullName,
    email: user.email,
    enrolledProgram: programSlugForTraining,
    assessmentCompleted: user.assessmentCompleted,
  });

  const careerRecommendation = user.careerRecommendationJson as CareerMatchResult | null;
  const inferredTargetRole = inferTargetRole(
    careerRecommendation,
    user.programInterest,
    programSlugForTraining
  );

  const stateLetter = deriveStateLetter({
    applicationExists: !!latestApplication,
    enrolledProgram: programSlugForTraining,
    assessmentCompleted: user.assessmentCompleted,
  });

  const completedCount = trainingView?.completedCount ?? 0;
  const milestoneTruth = deriveTrainingMilestoneTruth({
    completedSlugs: trainingView?.completedSlugsAuthoritative ?? [],
    started: trainingView?.hasStartedTraining ?? false,
    validatedSlugs: trainingView?.validatedCourseSlugs ?? [],
  });

  // An application or assessment is not training progress. Keep the legacy
  // field for callers, but use the same recorded course mean as My Program.
  const firstCertProgressPercent = trainingView?.progressPercentDisplay ?? 0;

  const checklist: MemberChecklist = {
    createAccount: true,
    chooseProgram: !!programSlugForTraining,
    completeAssessment: user.assessmentCompleted,
    startFirstCourse: trainingView ? milestoneTruth.trainingStarted : completedCount >= 1,
    completeFirstCourse: trainingView ? milestoneTruth.firstCourseCompleted : completedCount >= 1,
  };

  const actionsCtx: NextBestActionsContext = {
    state: stateLetter,
    noApplicationOnFile: !latestApplication,
    enrolledProgram: programSlugForTraining,
    assessmentCompleted: user.assessmentCompleted,
    completedCourseCount: trainingView?.completedCount,
    starterProfileReviewRequired: starterReview.required,
    starterProfileMissingFields: getStarterProfileFieldLabels(starterReview.missing),
    hasResume: !!latestResumeText,
    hasCompletedInterviewPractice,
    profileCompletenessPct,
    profileMissingFields,
    jobApplicationCount: user._count?.jobApplications ?? 0,
    counselorUnreadCount: engagement.counselorUnreadCount,
    weeklyRecapUnopened: engagement.weeklyRecapUnopened,
    courseEnrollmentActive: !!activeEnrollment,
    placementPlacedAt: placementForActions?.placedAt ?? null,
    placementRetentionDecision: placementForActions?.retentionDecision ?? null,
    placementSeparated: isPlacementSeparated(placementForActions),
    trainingCoursesIncomplete: trainingView ? !trainingView.allCoursesComplete : false,
    nextIncompleteCourseName: trainingView?.nextIncompleteCourseName ?? null,
  };

  const nextBestActions = buildNextBestActions(actionsCtx);

  // Surface the active program (which may differ from the legacy
  // `User.enrolledProgram` after multi-enrollment) so callers always see
  // the title that matches the trainingView numbers above.
  const surfacedProgram = programSlugForTraining;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    contactPhone: profile?.profilePhone?.trim() || user.phone?.trim() || null,
    application,
    enrolledProgram: surfacedProgram,
    programName: surfacedProgram ? programDisplayTitle(surfacedProgram) : null,
    trainingView,
    assessmentCompleted: user.assessmentCompleted,
    profileCompletenessPct,
    profileMissingFields,
    profile: profile ? {
      employmentStatus: profile.employmentStatus ?? null,
      educationLevel: profile.educationLevel ?? null,
    } : null,
    hasResume: !!latestResumeText,
    hasCompletedInterviewPractice,
    jobApplicationCount: user._count?.jobApplications ?? 0,
    counselorUnreadCount: engagement.counselorUnreadCount,
    weeklyRecapUnopened: engagement.weeklyRecapUnopened,
    careerRecommendation,
    inferredTargetRole,
    firstCertProgressPercent,
    checklist,
    nextBestActions,
    stateLetter,
  };
}

export async function getMemberState(
  userId: string,
  opts: GetMemberStateOptions = {},
): Promise<MemberState> {
  // Skip cache when dynamic external data is supplied or when an authenticated
  // release audit must not write fixture-derived state into shared Redis.
  if (opts.b4bProgress || opts.readOnlyAudit) {
    return _getMemberStateUncached(userId, opts);
  }
  const cacheKey = `member:state:${userId}:${opts.activeProgramSlug || 'default'}`;
  return getCacheOrFetch(cacheKey, () => _getMemberStateUncached(userId, opts), 300);
}

/** Invalidate member state cache for a given user. Call after mutations. */
export async function invalidateMemberState(userId: string): Promise<void> {
  await invalidateCache(`member:state:${userId}:*`);
}

export async function getMemberStateFull(
  userId: string,
  opts: GetMemberStateOptions = {},
): Promise<MemberStateFull> {
  const [base, fullData] = await Promise.all([
    getMemberState(userId, opts),
    loadMemberFullContext(userId),
  ]);

  return {
    ...base,
    ...fullData,
  };
}

// ─── Full Context Loader (admin/counselor) ─────────────────────────────────
async function loadMemberFullContext(userId: string): Promise<Omit<MemberStateFull, keyof MemberState>> {
  const [placement, courseEnrollment, counselorAssignment, recentMessagesRaw, memberEvents, partnerReferral, unreadCount] = await prisma.$transaction(async (tx) => {
    const [placement, courseEnrollment, counselorAssignment, recentMessagesRaw, memberEvents, partnerReferral] = await Promise.all([
      tx.placementRecord.findUnique({
        where: { userId },
        select: {
          placedAt: true,
          retentionDecision: true,
          onboardingWindowEnd: true,
          employerName: true,
          jobTitle: true,
          salaryOffered: true,
        },
      }),
      tx.courseEnrollment.findFirst({
        where: { userId, isPrimary: true },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          enrolledByAdminId: true,
          programSlug: true,
          enrolledAt: true,
          fundingSource: true,
        },
      }),
      tx.counselorAssignment.findFirst({
        where: { memberId: userId, active: true },
        orderBy: { assignedAt: 'desc' },
        select: {
          assignedAt: true,
          counselor: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      }),
      tx.messageThread.findFirst({
        where: { memberId: userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          updatedAt: true,
          memberLastReadAt: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, body: true },
          },
        },
      }),
      tx.memberEvent.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          eventName: true,
          createdAt: true,
          metadata: true,
          sourcePage: true,
        },
      }),
      tx.partnerReferral.findFirst({
        where: { memberId: userId },
        orderBy: { referredAt: 'desc' },
        select: {
          partner: { select: { name: true } },
          referredAt: true,
        },
      }),
    ]);

    const messageThreadLastReadAt = recentMessagesRaw?.memberLastReadAt;
    const unreadCount = await tx.message.count({
      where: {
        thread: { memberId: userId },
        authorId: { not: userId },
        createdAt: {
          gt: messageThreadLastReadAt ?? new Date(0),
        },
      },
    });

    return [placement, courseEnrollment, counselorAssignment, recentMessagesRaw, memberEvents, partnerReferral, unreadCount] as const;
  });

  return {
    placement: placement
      ? {
          placedAt: placement.placedAt,
          retentionDecision: placement.retentionDecision,
          onboardingWindowEnd: placement.onboardingWindowEnd,
        }
      : null,
    courseEnrollment: courseEnrollment
      ? {
          enrolledByAdminId: courseEnrollment.enrolledByAdminId,
          id: courseEnrollment.id,
        }
      : null,
    counselorAssignment: counselorAssignment
      ? {
          counselorName: counselorAssignment.counselor?.user?.fullName ?? null,
          assignedAt: counselorAssignment.assignedAt,
        }
      : null,
    recentMessages: {
      unreadCount,
      lastMessageAt: recentMessagesRaw?.messages[0]?.createdAt ?? null,
    },
    memberEvents: memberEvents.map((e) => ({
      type: e.eventName,
      createdAt: e.createdAt,
      metadata: (e.metadata ?? undefined) as Record<string, unknown> | undefined,
    })),
    partnerContext: partnerReferral
      ? {
          partnerName: partnerReferral.partner.name,
          referralSource: partnerReferral.partner.name,
        }
      : null,
  };
}
