import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { redirect, unstable_rethrow } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  programSlugReadCandidates,
  programSlugsEquivalent,
} from '@/lib/content/programSlug';
import { loadMemberCareerBriefBundleSafe } from '@/lib/content/careerBriefPersonalization';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { canBypassMemberAssessment, getProfileRole, isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import StaffViewBanner from '@/components/portal/StaffViewBanner';
import { formatPortalDate } from '@/lib/formatDate';
import MemberDashboardVoiceSectionLazy from '@/components/portal/MemberDashboardVoiceSectionLazy';
import VoiceSectionErrorBoundary from '@/components/portal/VoiceSectionErrorBoundary';
import MemberNextStepsStrip from '@/components/portal/MemberNextStepsStrip';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import MemberFirstValuePanel from '@/components/portal/MemberFirstValuePanel';
import { buildFirstValueActions } from '@/lib/member/firstValueActions';
import { isNewMember, secondsSinceAccountCreation } from '@/lib/member/isNewMember';
import MemberProgressStrip from '@/components/portal/MemberProgressStrip';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import MemberSessionCard from '@/components/portal/MemberSessionCard';
import MemberStuckCounselorStrip from '@/components/portal/MemberStuckCounselorStrip';
import GoalsModule from '@/components/portal/GoalsModule';
import TodayHero from '@/components/portal/TodayHero';
import { getGoodTimeOfDayPhrase } from '@/lib/time/greeting';
import { classifyMember } from '@/lib/member/atRiskScoring';
import { buildProactiveInsights } from '@/lib/member/proactiveInsights';
import { parseGoalDescription } from '@/lib/member/goalSteps';
import PortalEntryErrorBoundary from '@/components/portal/PortalEntryErrorBoundary';
import { getMemberState } from '@/lib/member/getMemberState';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { resolveMemberDashboardTabs } from '@/lib/member/dashboardTabs';
import {
  fetchLearnerProgressFromB4B,
  type LearnerProgressByContent,
} from '@/lib/coursera/learnerProgress';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { getAIToolFollowThrough } from '@/lib/member/aiToolFollowThrough';
import { isTrainingStaleForCounselorEscalation } from '@/lib/member/memberProgramTrainingView';
import { trainingEligibleSince as resolveTrainingEligibleSince } from '@/lib/member/trainingStaleness';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import DashboardErrorFallback from '@/components/error/DashboardErrorFallback';
import { getMemberPoints } from '@/lib/member/points';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import First90DaysCard from '@/components/portal/First90DaysCard';
import {
  FIRST90_CHECK_IN_EVENT,
  buildCheckInsByStage,
  daysSincePlacement,
  getFirst90Stage,
  type First90Stage,
} from '@/lib/member/first90Days';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from '@/lib/member/starterProfileReview';
import { getTranslations } from 'next-intl/server';
import MobileProgramTrainingCard from './_components/MobileProgramTrainingCard';
import MobileStateANextStepCard from './_components/MobileStateANextStepCard';
import MobilePriorityActionCard from './_components/MobilePriorityActionCard';
import MobileJourneyTimeline from './_components/MobileJourneyTimeline';
import MobilePointsSection from './_components/MobilePointsSection';
import MobileDiscoverSection from './_components/MobileDiscoverSection';
import MobileQuickActions from './_components/MobileQuickActions';
import MobileRecentActivity from './_components/MobileRecentActivity';
import DesktopDashboard from './_components/DesktopDashboard';
import { MemberDashboardKit } from '@/components/portal/kit';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import { memberApprovalCardPlacement } from '@/lib/member/memberApprovalCardPlacement';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import SkillMissionTeaserCard, {
  type SkillMissionTeaserData,
} from '@/components/portal/SkillMissionTeaserCard';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';

const MemberCareerPathSection = dynamic(
  () => import('@/components/portal/MemberCareerPathSection'),
  { loading: () => null }
);
const LogCertificationModal = dynamic(() => import('./LogCertificationModal'), {
  loading: () => null,
});
const PlacementConfirmationStrip = dynamic(() => import('./PlacementConfirmationStrip'), {
  loading: () => null,
});
const PWAInstallPrompt = dynamic(() => import('@/components/pwa/PWAInstallPrompt'), {
  loading: () => null,
});

// Kit-default home is a 1–2 query loader (see loadMemberDashboardHome).
// `?ui=legacy` is still the fat path (member state + B4B). The 60s ceiling
// is a timeout bandage for that escape hatch, not the default kit render.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
  title: t('yourDashboard'),
  description: t('dashboardDescription'),
  path: '/dashboard',
});
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ program?: string; tab?: string; ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard');
  const t = await getTranslations('dashboard');

  // Multi-program: optional `?program=<slug>` switches the home hero +
  // metric cards to a secondary enrollment. Validated server-side via
  // `getActiveProgramForDashboard` (slug must be one of the user's
  // enrollments).
  const params = await searchParams;
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const requestedProgramSlug =
    typeof params?.program === 'string' ? params.program.trim() : null;
  const requestedTab = typeof params?.tab === 'string' ? params.tab.trim() : null;

  try {
    return await renderMemberDashboard(user, t, { requestedProgramSlug, requestedTab, requestedUi: params?.ui ?? null, readOnlyAudit });
  } catch (err) {
    // redirect()/notFound() work by throwing — rethrow them so they keep
    // navigating instead of being logged and rendered as the error fallback.
    unstable_rethrow(err);
    console.error('[dashboard] unhandled render error', err);
    return (
      <div
        className="portal-error-fallback"
        data-portal-error-state="member-dashboard-render"
        style={{ padding: '2rem', maxWidth: '36rem', margin: '0 auto' }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t('errorTitle')}</h2>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          {t('errorBody')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <a href="/dashboard" className="btn btn-primary">
            {t('tryAgain')}
          </a>
          <a href="https://www.workforceap.org/" className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
            {t('waHome')}
          </a>
        </div>
      </div>
    );
  }
}

async function renderMemberDashboard(
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>,
  t: Awaited<ReturnType<typeof getTranslations>>,
  args: { requestedProgramSlug: string | null; requestedTab?: string | null; requestedUi?: string | null; readOnlyAudit?: boolean } = {
    requestedProgramSlug: null,
    requestedTab: null,
    requestedUi: null,
    readOnlyAudit: false,
  },
) {

  // Kit-default home. Query budget lives in loadMemberDashboardHome (1–2 Prisma
  // ops in one $transaction). Coursera/B4B + getMemberState stay off this path.
  // `?ui=legacy` below is the fat escape hatch and may keep its 24-call fan-out.
  if (args.requestedUi !== 'legacy') {
    const home = await loadMemberDashboardHome({
      userId: user.id,
      fallbackDisplayName: user.email,
      provisionIfMissing: () => ensureAppUserProvisioned(user, { readOnlyAudit: args.readOnlyAudit }),
    });
    // Presentation only: a pathway with a live next step keeps the approval
    // card above the dashboard; a finished or closed one drops below the
    // content as a single collapsed line (memberApprovalCardPlacement).
    const approvalPlacement = memberApprovalCardPlacement(home.approvalStatus);
    const approvalCard = (
      <MemberApprovalStatusCard
        status={home.approvalStatus}
        storageUserId={user.id}
        placement={approvalPlacement}
      />
    );
    return (
      <>
      {approvalPlacement === 'primary' ? approvalCard : null}
      <MemberHomeKit
        firstName={home.firstName}
        coursePercent={home.coursePercent}
        courseProgressStale={home.courseProgressStale}
        programTitle={home.programTitle}
        programStatus={home.programStatus}
        noProgram={home.noProgram}
        activeJobs={home.activeJobs}
        certs={home.certs}
        points={home.points}
        currentStreak={home.currentStreak}
        longestStreak={home.longestStreak}
        goals={home.goals}
        nextLesson={home.nextLesson}
        nextLessonDue={home.nextLessonDue}
        nextLessonHref={home.nextLessonHref}
        nextBadgeName={home.nextBadgeName}
        nextBadgePercent={home.nextBadgePercent}
        nextBadgeRemaining={home.nextBadgeRemaining}
        pipeline={home.pipeline}
        certModulesDone={home.certModulesDone}
        certModulesTotal={home.certModulesTotal}
        programCoursesNote={home.programCoursesNote}
        pointsLedger={home.pointsLedger}
        pointsThisWeek={home.pointsThisWeek}
        programHref={home.programHref}
        resumeHref={home.resumeHref}
        coursesHref={home.coursesHref}
        toolkitHref={home.toolkitHref}
        jobsHref={home.jobsHref}
        doThisNext={home.doThisNext}
        ungatedDigitalBasicsHref={home.programTitle ? null : home.ungatedDigitalBasicsHref}
      />
      {approvalPlacement === 'demoted' ? approvalCard : null}
      </>
    );
  }

  const { user: dbUser, careerBrief } = await loadMemberCareerBriefBundleSafe(user.id, { activeMemberOnly: true });
  if (!dbUser) {
    // Authenticated session without a member row — staff accounts land here
    // when something links them to /dashboard. Send them to their own portal
    // instead of showing the login form to an already-logged-in user.
    if (await isAdmin(user.id)) redirect('/admin');
    const role = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      console.error('[dashboard:page] profileRole lookup failed; degrading to member', err);
      return 'member';
    });
    if (role === 'counselor') redirect('/counselor');
    if (role === 'employer') redirect('/employer');
    if (role === 'partner') redirect('/partner');
    redirect('/login');
  }

  // Coursera auto-sync is off the render path (SCALE Phase 2). Hourly cron
  // `coursera-training-sync` seeds enrollment + xAPI. This `?ui=legacy` branch
  // is still fat (career-brief + getMemberState + B4B + ~24 Prisma calls).

  // ── Multi-program resolution ──
  // Drive the hero name + progress + selector chip from `CourseEnrollment`
  // rows (with `?program=<slug>` to pick a secondary). Reading
  // `User.enrolledProgram` directly here is what produced the
  // hero/course-list mismatch when that legacy field went stale — the
  // helper falls back to it only for never-migrated users.
  const activeProgramView = await getActiveProgramForDashboard({
    userId: user.id,
    requestedProgramSlug: args.requestedProgramSlug,
  });
  if (
    activeProgramView.legacyEnrolledProgramMismatch &&
    activeProgramView.primaryProgramSlug
  ) {
    // We do NOT auto-reconcile (admin call). Just leave a breadcrumb so
    // the drift is visible in logs and can be cleaned up by a counselor.
    console.warn(
      '[dashboard] User.enrolledProgram differs from primary CourseEnrollment',
      {
        userId: user.id,
        legacyEnrolledProgram: dbUser.enrolledProgram,
        primaryProgramSlug: activeProgramView.primaryProgramSlug,
      },
    );
  }
  const enrolledProgramSlug = activeProgramView.activeProgramSlug;

  // ── B4B authoritative progress for the hero ring ──
  // Pulled in parallel with the rest of the page data; the 60s cache in
  // learnerProgress.ts means a refresh + sub-page navigation reuses one
  // request. Failure → empty map → fall back to local rollup. No DB writes.
  const courseraProgramIdForEnrolled = enrolledProgramSlug
    ? DISCOVERED_COURSERA_PROGRAMS[enrolledProgramSlug]?.courseraProgramId
    : undefined;
  const b4bProgressPromise: Promise<LearnerProgressByContent> = user.email
      ? fetchLearnerProgressFromB4B(user.email, {
        programId: courseraProgramIdForEnrolled,
        readOnlyAudit: args.readOnlyAudit,
      }).catch((err) => {
        console.warn('[dashboard] B4B learner progress unavailable:', err);
        return new Map() as LearnerProgressByContent;
      })
    : Promise.resolve(new Map() as LearnerProgressByContent);
  // Hard ceiling on the awaited B4B read. Each underlying request is already
  // capped (b4bClient withAttemptTimeout), but the program lookup + per-program
  // enrollment reports are additive, so bound the total here. On timeout we
  // render with the local-rollup fallback (empty map); the promise above
  // already maps errors to an empty map, so this only adds the timeout arm.
  const b4bProgress = await Promise.race([
    b4bProgressPromise,
    new Promise<LearnerProgressByContent>((resolve) =>
      setTimeout(() => {
        console.warn('[dashboard] B4B learner progress exceeded 4s deadline — using local fallback');
        resolve(new Map() as LearnerProgressByContent);
      }, 4000),
    ),
  ]);

  // Single source of truth for member state (application, training, profile, checklist, next actions).
  // `b4bProgress` is threaded through so `trainingView.progressPercentDisplay`
  // prefers Coursera B4B enrollmentReports per course when available (fallback:
  // local CourseProgress / xAPI-fed rows).
  const memberState = await getMemberState(user.id, {
    b4bProgress,
    activeProgramSlug: enrolledProgramSlug,
    readOnlyAudit: args.readOnlyAudit,
  });

  // Lightweight query for presentation-layer metadata not in getMemberState
  const intakePromise = prisma.user.findUnique({
    where: { id: user.id },
    select: {
      interviewEligible: true,
      interviewRequestedAt: true,
      interviewCompletedAt: true,
      preScreeningResponse: { select: { id: true } },
      onboardingCompletedAt: true,
      onboardingCurrentStep: true,
      tourCompletedAt: true,
      assessmentCompletedAt: true,
      fullName: true,
      phone: true,
      programInterest: true,
      needsComputerSupportFollowUp: true,
      profile: {
        select: {
          city: true,
          state: true,
          zip: true,
          profilePhone: true,
          profileAddress: true,
          referralSource: true,
          dob: true,
          isMinor: true,
        },
      },
      // Multi-program: dashboard intake reads enrolledByAdminId from the
      // primary enrollment (counselor-created flag).
      courseEnrollments: {
        where: { isPrimary: true },
        select: { enrolledByAdminId: true, id: true },
        take: 1,
      },
      placementRecord: { select: { placedAt: true, retentionDecision: true, onboardingWindowEnd: true, employerName: true } },
    },
  });

  const [intakeResult, toolsResult, applicationResult, dynamicActionsResult, jobApplicationsResult, pointsResult, recentTxResult, sessionEventsResult, interviewPracticeCompletionResult, first90EventsResult] = await Promise.allSettled([
    intakePromise,
    prisma.aIToolResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, toolType: true, inputSummary: true, createdAt: true },
    }),
    prisma.application.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        programInterest: true,
        submittedAt: true,
        createdAt: true,
      },
    }),
    prisma.memberNextBestAction.findMany({
      where: { memberId: user.id, status: 'PENDING' },
      orderBy: { priority: 'desc' },
      take: 2,
      select: {
        id: true,
        title: true,
        description: true,
        ctaHref: true,
        ctaLabel: true,
        priority: true,
      },
    }),
    prisma.jobApplication.findMany({
      take: 500,
      where: { userId: user.id, status: 'OFFER' },
      select: {
        id: true,
        company: true,
      },
    }),
    getMemberPoints(user.id),
    prisma.pointsTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, event: true, points: true, note: true, createdAt: true },
    }),
    // In-office session events ΓÇö see lib/auth/actAsSubject.ts. Pulls every
    // ai_tool_run_completed event in the last 30 days where a counselor or
    // admin acted on behalf of this member, so the dashboard can render a
    // "Your session with {actor} on {date}" card.
    prisma.memberEvent.findMany({
      where: {
        userId: user.id,
        eventName: 'ai_tool_run_completed',
        sessionId: { not: null },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { sessionId: true, entityId: true, createdAt: true, metadata: true },
    }),
    prisma.memberEvent.findFirst({
      where: { userId: user.id, eventName: 'career_os.interview_practice_completed' },
      select: { id: true },
    }),
    // First 90 Days check-in responses (one MemberEvent per stage) — drives
    // the post-placement coach card. See lib/member/first90Days.ts.
    prisma.memberEvent.findMany({
      where: { userId: user.id, eventName: FIRST90_CHECK_IN_EVENT },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { entityId: true, metadata: true, createdAt: true },
    }),
  ]);

  const intakeExtra = intakeResult.status === 'fulfilled' ? intakeResult.value : null;
  if (intakeResult.status === 'rejected') {
    console.error('[dashboard] intake query failed', intakeResult.reason);
  }

  const careerMatchFromProfile = memberState.careerRecommendation;
  if (toolsResult.status === 'rejected') {
    console.error('[dashboard] recent AI tools query failed', toolsResult.reason);
  }

  const recentTools = toolsResult.status === 'fulfilled' ? toolsResult.value : [];
  if (applicationResult.status === 'rejected') {
    console.error('[dashboard] latest application query failed', applicationResult.reason);
  }

  const dynamicNextActions = dynamicActionsResult.status === 'fulfilled' ? dynamicActionsResult.value : [];
  if (dynamicActionsResult.status === 'rejected') {
    console.error('[dashboard] dynamic actions query failed', dynamicActionsResult.reason);
  }

  const jobOffers = jobApplicationsResult.status === 'fulfilled' ? jobApplicationsResult.value : [];

  const memberPoints = pointsResult.status === 'fulfilled' ? pointsResult.value : null;
  const recentTx = recentTxResult.status === 'fulfilled' ? recentTxResult.value : [];
  const hasCompletedInterviewPractice = interviewPracticeCompletionResult.status === 'fulfilled'
    ? !!interviewPracticeCompletionResult.value
    : false;
  if (interviewPracticeCompletionResult.status === 'rejected') {
    console.error('[dashboard] interview practice completion query failed', interviewPracticeCompletionResult.reason);
  }

  // Group on-behalf-of session events by sessionId so the dashboard can
  // render a single "Your session with {actor}" card for the most recent run.
  const sessionEvents = sessionEventsResult.status === 'fulfilled' ? sessionEventsResult.value : [];
  if (sessionEventsResult.status === 'rejected') {
    console.error('[dashboard] session events query failed', sessionEventsResult.reason);
  }
  type SessionSummary = {
    sessionId: string;
    actorName: string;
    startedAt: Date;
    toolCount: number;
    resultIds: string[];
  };
  const sessionMap = new Map<string, SessionSummary>();
  for (const ev of sessionEvents) {
    if (!ev.sessionId) continue;
    const meta = (ev.metadata ?? {}) as { runOnBehalf?: boolean; actorName?: string | null };
    if (!meta.runOnBehalf) continue;
    const existing = sessionMap.get(ev.sessionId);
    if (existing) {
      existing.toolCount += 1;
      if (ev.entityId) existing.resultIds.push(ev.entityId);
      if (ev.createdAt < existing.startedAt) existing.startedAt = ev.createdAt;
    } else {
      sessionMap.set(ev.sessionId, {
        sessionId: ev.sessionId,
        actorName: meta.actorName ?? t('yourCounselor'),
        startedAt: ev.createdAt,
        toolCount: 1,
        resultIds: ev.entityId ? [ev.entityId] : [],
      });
    }
  }
  const latestSession =
    [...sessionMap.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null;

  const latestTool = recentTools[0] ?? null;
  const latestToolFollowThrough = latestTool
    ? getAIToolFollowThrough({
        toolType: latestTool.toolType,
        inputSummary: latestTool.inputSummary,
      })
    : null;

  const showMemberOnboarding = intakeExtra?.onboardingCompletedAt == null;
  const showMemberTour =
    intakeExtra?.onboardingCompletedAt != null && intakeExtra?.tourCompletedAt == null;
  const wizardProgramInterest =
    memberState.application?.programInterest ?? intakeExtra?.programInterest ?? '';

  // ── Application status ── (from memberState, single source of truth)
  const applicationStatusView = memberState.application;
  const applicationStatus = applicationStatusView
    ? {
        label: applicationStatusView.label,
        submittedAt: applicationStatusView.submittedAt?.toISOString() ?? null,
        programInterest: applicationStatusView.programInterest,
        nextStep: applicationStatusView.nextStep,
        nextStepHref: applicationStatusView.nextStepHref,
        showResponseEstimate: applicationStatusView.showResponseEstimate,
        progressIndex: applicationStatusView.progressIndex,
        stage: applicationStatusView.stage,
      }
    : null;
  const noApplicationOnFile = !applicationStatusView;

  const firstName = dbUser.fullName?.split(' ')[0] ?? 'there';
  // Use the active program (resolved from CourseEnrollment rows above)
  // rather than `dbUser.enrolledProgram` so the hero, journey timeline,
  // and "X of N courses" all key off the same enrollment that drives
  // the course list below.
  const enrolledProgram = enrolledProgramSlug;
  const assessmentCompleted = dbUser.assessmentCompleted ?? false;
  const userAge = intakeExtra?.profile?.dob 
    ? Math.floor((Date.now() - new Date(intakeExtra.profile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const isMinor = intakeExtra?.profile?.isMinor || (userAge !== null && userAge < 18);

  const program = enrolledProgram ? getProgramBySlug(enrolledProgram) : null;
  const activeEnrollment = activeProgramView.allEnrollments.find((enrollment) =>
    enrolledProgram
      ? programSlugsEquivalent(enrollment.programSlug, enrolledProgram)
      : false,
  );
  const curriculumCourses = program
    ? getProgramCoursesForCurriculumVersion(
        program,
        activeEnrollment?.curriculumVersion ?? 'legacy-v1',
      )
    : [];

  // Multi-program: build the dropdown options for the dashboard hero.
  // Single-enrollment users see no chip — keeps the existing layout
  // unchanged. The selector reloads `/dashboard?program=<slug>` so the
  // server re-runs with a different active enrollment.
  const programSelectorOptions = activeProgramView.allEnrollments.map((e) => ({
    id: e.id,
    programSlug: e.programSlug,
    programTitle: programDisplayTitle(e.programSlug),
    isPrimary: e.isPrimary,
  }));
  const showProgramSelector = programSelectorOptions.length > 1 && !!enrolledProgram;

  // ── Training state ── (from memberState, single source of truth)
  const trainingView = memberState.trainingView;
  const completedCount = trainingView?.completedCount ?? 0;
  const totalCourses = trainingView?.totalCourses ?? curriculumCourses.length;
  const allCoursesComplete = trainingView?.allCoursesComplete ?? false;
  const progressPercentDisplay = trainingView?.progressPercentDisplay ?? 0;

  // ── Skill Missions teaser ── always rendered on the dashboard home so the
  // feature stays one tap away; data only loads when a program is active.
  let skillMissionTeaserData: SkillMissionTeaserData | null = null;
  if (enrolledProgram) {
    try {
      const completedRows = await prisma.courseProgress.findMany({
        where: {
          userId: user.id,
          programSlug: { in: programSlugReadCandidates(enrolledProgram) },
          status: 'COMPLETED',
        },
        select: { courseSlug: true },
      });
      const missionSummary = await loadSkillMissionSummary({
        userId: user.id,
        programSlug: enrolledProgram,
        curriculumVersion: activeEnrollment?.curriculumVersion ?? 'legacy-v1',
        completedCourseSlugs: completedRows.map((r) => r.courseSlug),
      });
      if (missionSummary) {
        const nextReady = missionSummary.missions.find((m) => m.status === 'ready') ?? null;
        skillMissionTeaserData = {
          careerReadinessPct: missionSummary.careerReadinessPct,
          passedCount: missionSummary.passedCount,
          totalMissions: missionSummary.totalMissions,
          readyCount: missionSummary.readyCount,
          retryCount: missionSummary.retryCount,
          streak: missionSummary.streak,
          nextMissionName: nextReady?.missionName ?? null,
          nextMissionCourse: nextReady?.courseTitle ?? null,
        };
      }
    } catch (err) {
      console.error('[dashboard] skill mission teaser load failed', err);
    }
  }
  const skillMissionTeaser = (
    <SkillMissionTeaserCard data={skillMissionTeaserData} />
  );

  // Shared with the dashboard home loader so the two training surfaces cannot
  // disagree about when a member became able to start (WAP-135 follow-up).
  const trainingEligibleSince = resolveTrainingEligibleSince({
    enrolledProgram,
    assessmentCompleted,
    enrolledAt: dbUser.enrolledAt,
    assessmentCompletedAt: intakeExtra?.assessmentCompletedAt,
  });

  const hasPlacementRecord = !!intakeExtra?.placementRecord?.placedAt;

  // ── First 90 Days coach card ── derived deterministically from
  // PlacementRecord.placedAt (week 1 / day 30 / 60 / 90). Shown to both
  // mobile + desktop, like MemberSessionCard. No schema changes — responses
  // live in MemberEvent rows.
  const first90Events = first90EventsResult.status === 'fulfilled' ? first90EventsResult.value : [];
  if (first90EventsResult.status === 'rejected') {
    console.error('[dashboard] first 90 days events query failed', first90EventsResult.reason);
  }
  let first90Card: ReactNode = null;
  if (intakeExtra?.placementRecord?.placedAt) {
    const placedAt = intakeExtra.placementRecord.placedAt;
    const first90Stage = getFirst90Stage(placedAt);
    if (first90Stage) {
      const checkInsByStage = buildCheckInsByStage(first90Events);
      const completedStages = Object.keys(checkInsByStage) as First90Stage[];
      first90Card = (
        <ErrorBoundary fallback={null}>
          <First90DaysCard
            stage={first90Stage}
            daysSincePlacement={daysSincePlacement(placedAt)}
            employerName={intakeExtra.placementRecord.employerName ?? ''}
            currentStageResponse={checkInsByStage[first90Stage]?.response ?? null}
            completedStages={completedStages}
          />
        </ErrorBoundary>
      );
    }
  }

  const progressStripProps = {
    intake:
      intakeExtra?.onboardingCompletedAt != null ||
      intakeExtra?.preScreeningResponse != null,
    assessment: assessmentCompleted,
    trainingStarted: trainingView?.hasStartedTraining ?? false,
    certsComplete: allCoursesComplete,
    employed: hasPlacementRecord,
  };

  // ── Dashboard state letter ── (from memberState, single source of truth)
  const dashboardState = memberState.stateLetter;

  const showStuckCounselor =
    dashboardState === 'C' &&
    trainingView != null &&
    isTrainingStaleForCounselorEscalation({
      trainingView,
      trainingEligibleSince,
      allCoursesComplete,
      dashboardInTraining: true,
    });

  // ── Profile + next actions ── (from memberState, single source of truth)
  const profileCompletenessPct = memberState.profileCompletenessPct;
  const profileMissingFields = memberState.profileMissingFields;

  let nextBestActions = memberState.nextBestActions;

  // Starter profile review (for counselor-created accounts)
  const starterProfileReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!intakeExtra?.courseEnrollments?.[0]?.enrolledByAdminId,
    phone: intakeExtra?.phone,
    profilePhone: intakeExtra?.profile?.profilePhone,
    profileAddress: intakeExtra?.profile?.profileAddress,
    city: intakeExtra?.profile?.city,
    state: intakeExtra?.profile?.state,
    zip: intakeExtra?.profile?.zip,
    referralSource: intakeExtra?.profile?.referralSource,
  });
  const starterProfileMissingLabels = getStarterProfileFieldLabels(starterProfileReview.missing);

  for (const dbAction of dynamicNextActions.reverse()) {
    nextBestActions.unshift({
      id: dbAction.id,
      title: dbAction.title,
      body: dbAction.description,
      href: dbAction.ctaHref,
      cta: dbAction.ctaLabel,
      variant: 'urgent',
      weight: dbAction.priority + 100,
    });
  }
  nextBestActions = nextBestActions.slice(0, 4);
  const dominantNextAction = nextBestActions[0] ?? null;

  const showFirstValuePanel = isNewMember(dbUser.createdAt);
  const firstValueActions = showFirstValuePanel
    ? buildFirstValueActions({
        state: dashboardState,
        noApplicationOnFile,
        application: applicationStatusView,
        enrolledProgram: enrolledProgramSlug,
        assessmentCompleted,
        hasResume: memberState.hasResume,
        profileCompletenessPct,
        careerRecommendation: memberState.careerRecommendation,
      })
    : [];
  const firstValueSecondsSinceSignup = secondsSinceAccountCreation(dbUser.createdAt);

  const mobileStripActions =
    dominantNextAction && nextBestActions[0]?.id === dominantNextAction.id
      ? nextBestActions.slice(1)
      : nextBestActions;

  const checklist = {
    createAccount: true,
    chooseProgram: !!enrolledProgram,
    completeAssessment: assessmentCompleted,
    // Milestones follow `CourseProgress` / xAPI when present, fall back to raw count.
    startFirstCourse: trainingView ? trainingView.hasStartedTraining : completedCount >= 1,
    completeFirstCourse: trainingView ? trainingView.hasCompletedFirstCourse : completedCount >= 1,
  };
  const checklistAllDone = Object.values(checklist).every(Boolean);

  const recentActivity: Array<{ label: string; timestamp: Date }> = [];
  if (dbUser.enrolledAt) {
    recentActivity.push({ label: t('enrolled'), timestamp: dbUser.enrolledAt });
  }
  if (dbUser.assessmentCompletedAt) {
    recentActivity.push({ label: t('completedAssessment'), timestamp: dbUser.assessmentCompletedAt });
  }
  recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const lastThree = recentActivity.slice(0, 3);

  const nextIncompleteCourse =
    program && trainingView?.nextIncompleteCourseSlug
      ? curriculumCourses.find((c) => c.slug === trainingView.nextIncompleteCourseSlug) ?? null
      : program && trainingView
        ? curriculumCourses.find((c) =>
            !trainingView.completedSlugsAuthoritative.includes(c.slug),
          ) ?? null
        : null;
  const careerPlanTrainingNextStep = program
    ? {
        programTitle: program.title,
        href: `/dashboard?program=${encodeURIComponent(program.slug)}`,
        ctaLabel: nextIncompleteCourse ? `Continue ${nextIncompleteCourse.name}` : 'Start Step 1',
        detail: nextIncompleteCourse
          ? `Your next course is ${nextIncompleteCourse.name}.`
          : 'Start with the first course in this training path.',
      }
    : null;

  const recommendedActions = careerBrief.recommendedActions;
  const jobSearchUrl = careerBrief.jobSearchUrl;

  const showMatchedRoles = assessmentCompleted;
  const learningAvailable = !!enrolledProgram && (dashboardState === 'C' || dashboardState === 'D');
  const opportunitiesAvailable =
    dashboardState !== 'A' &&
    (showMatchedRoles || recommendedActions.length > 0 || !!jobSearchUrl || hasCompletedInterviewPractice);
  const { activeTab, availableTabs } = resolveMemberDashboardTabs({
    requestedTab: args.requestedTab,
    learningAvailable,
    opportunitiesAvailable,
    programSlug: enrolledProgram,
  });
  let superAdmin = false;
  try {
    superAdmin = await isSuperAdmin(user.id);
  } catch (e) {
    console.error('[dashboard] isSuperAdmin failed', e);
  }
  let staffViewer = false;
  try {
    staffViewer = await canBypassMemberAssessment(user.id);
  } catch (e) {
    console.error('[dashboard] canBypassMemberAssessment failed', e);
  }

  /* Mobile hero uses a My Training hub link (states C/D) — training home is now /dashboard */

  const interviewCompleted = !!intakeExtra?.interviewCompletedAt;
  const interviewRequested = !!intakeExtra?.interviewRequestedAt;
  const interviewEligibleFlag = intakeExtra?.interviewEligible ?? false;
  const preScreeningDone = !!intakeExtra?.preScreeningResponse;

  // ── Today hero + proactive "we noticed…" insights ──
  // Additive layer at the top of the dashboard. We reuse data already loaded
  // above (trainingView, dbUser) and pull one lightweight query for the login
  // signal + active goals + earliest cert so the proactive cards can read the
  // retention tier without re-running the heavier at-risk pipeline.
  let todayHeroInsights: ReturnType<typeof buildProactiveInsights> = [];
  let topGoalTitle: string | null = null;
  let activeGoalCount = 0;
  let focusLine = '';
  try {
    const todayData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        lastLoginAt: true,
        staleTrainingDetectedAt: true,
        userCertifications: {
          orderBy: { earnedAt: 'asc' },
          select: { earnedAt: true },
          take: 1,
        },
        goals: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { title: true, description: true },
        },
        _count: { select: { jobApplications: true } },
      },
    });

    const activeGoals = todayData?.goals ?? [];
    activeGoalCount = activeGoals.length;

    // Find the goal closest to completion (most steps done, but not finished)
    // so the proactive card + focus line can speak to real momentum.
    let topGoalStepsDone = 0;
    let topGoalStepsTotal = 0;
    let bestRatio = -1;
    for (const g of activeGoals) {
      const { steps } = parseGoalDescription(g.description);
      const total = steps.length;
      const done = steps.filter((s) => s.done).length;
      const ratio = total > 0 ? done / total : 0;
      // Prefer in-progress goals (some done, not all) for the momentum story.
      const score = total > 0 && done < total ? ratio + 0.01 : ratio;
      if (score > bestRatio) {
        bestRatio = score;
        topGoalTitle = g.title;
        topGoalStepsDone = done;
        topGoalStepsTotal = total;
      }
    }
    if (!topGoalTitle && activeGoals[0]) {
      topGoalTitle = activeGoals[0].title;
    }

    const classification = classifyMember({
      userId: user.id,
      lastLoginAt: todayData?.lastLoginAt ?? null,
      staleTrainingDetectedAt: todayData?.staleTrainingDetectedAt ?? null,
      lastTrainingActivityAt: trainingView?.lastTrainingActivityAt ?? null,
      allCoursesComplete,
      earliestCertEarnedAt: todayData?.userCertifications?.[0]?.earnedAt ?? null,
      jobApplicationCount: todayData?._count.jobApplications ?? 0,
    });

    todayHeroInsights = buildProactiveInsights({
      firstName,
      riskTier: classification.tier,
      daysSinceLogin: classification.daysSinceLogin,
      riskReasons: classification.reasons,
      enrolledProgram: !!enrolledProgram,
      totalCourses,
      completedCourses: completedCount,
      allCoursesComplete,
      progressPercentDisplay,
      activeGoalCount,
      topGoalTitle,
      topGoalStepsDone,
      topGoalStepsTotal,
    });
  } catch (err) {
    console.error('[dashboard] today hero signals failed', err);
  }

  // Derive a single warm "your focus today" line. Priority: the most urgent
  // next-best-action, then an active goal, then a gentle default — never blank.
  if (dominantNextAction) {
    focusLine = dominantNextAction.title;
  } else if (topGoalTitle) {
    focusLine = `Continue “${topGoalTitle}”.`;
  } else if (noApplicationOnFile) {
    focusLine = 'Start your application — it takes about 10 minutes.';
  } else if (enrolledProgram && !allCoursesComplete) {
    focusLine = nextIncompleteCourse
      ? `Continue ${nextIncompleteCourse.name}.`
      : 'Continue your training today.';
  } else {
    focusLine = 'Explore your tools or message your counselor for a next step.';
  }

  const todayHeroContextLine = program
    ? `${program.title}${
        enrolledProgram && totalCourses > 0 && !allCoursesComplete
          ? ` · ${completedCount} of ${totalCourses} courses`
          : ''
      }`
    : null;

  const todayHero = (
    <ErrorBoundary fallback={null}>
      <TodayHero
        firstName={firstName}
        dateLabel={formatPortalDate(new Date())}
        isNewMember={noApplicationOnFile}
        focusLine={focusLine}
        contextLine={todayHeroContextLine}
        insights={todayHeroInsights}
        greetingPhrase={getGoodTimeOfDayPhrase()}
      />
    </ErrorBoundary>
  );

  // The v2 kit is the DEFAULT, rendered by the lean early-return at the top of
  // this fn; ?ui=legacy falls through to the original dashboard below. This
  // richer-data kit branch is currently unreachable (kept for the eventual prod
  // path that runs the full pipeline). Condition matches the lean gate so the
  // types line up — requestedUi is narrowed to 'legacy' by the time we get here.
  if (args.requestedUi !== 'legacy') {
    return (
      <MemberDashboardKit
        firstName={firstName}
        progressPercent={progressPercentDisplay}
        programTitle={program?.title ?? null}
        completedCount={completedCount}
        totalCourses={totalCourses}
        nextMilestone={nextIncompleteCourse?.name ?? null}
        recommendedActions={recommendedActions}
        aiToolsUsedCount={recentTools.length}
        jobSearchUrl={jobSearchUrl}
      />
    );
  }

  return (
    <>
      <h1 className="wa-sr-only">{noApplicationOnFile ? `Welcome to WorkforceAP, ${firstName}` : `Welcome back, ${firstName}`}</h1>

      <PWAInstallPrompt />

      {staffViewer && (
        <div style={{ padding: '0.75rem 1rem 0' }}>
          <StaffViewBanner page="dashboard" />
        </div>
      )}

      {/* ΓöÇΓöÇ Recent in-office session card — shown to both mobile + desktop
          when a counselor or admin ran tools on the member's behalf in the
          last 30 days. See lib/auth/actAsSubject.ts. ΓöÇΓöÇ */}
      {latestSession ? (
        <MemberSessionCard
          actorName={latestSession.actorName}
          startedAt={latestSession.startedAt}
          toolCount={latestSession.toolCount}
        />
      ) : null}

      {/* ── First 90 Days coach — shown to both mobile + desktop while the
          member's placement is inside the 90-day window. ── */}
      {first90Card}

      {/* Mobile-only dashboard (≤767px) */}
      <div className="md:wa-hidden portal-mobile-content">
        {availableTabs.length > 1 ? (
          <nav aria-label="Dashboard sections" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '1rem 1.25rem 0' }}>
            {availableTabs.map((tab) => (
              <a
                key={tab.id}
                href={tab.href}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  color: activeTab === tab.id ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                  background: activeTab === tab.id ? 'var(--color-primary)' : 'var(--surface-container-low)',
                }}
              >
                {tab.label}
              </a>
            ))}
          </nav>
        ) : null}

        {activeTab === 'home' ? (
          <>
            <section style={{ padding: '1.25rem 1.25rem 0' }}>{todayHero}</section>

            {showFirstValuePanel && firstValueActions.length > 0 ? (
              <section style={{ padding: '1rem 1.25rem 0' }}>
                <MemberFirstValuePanel
                  actions={firstValueActions}
                  secondsSinceSignup={firstValueSecondsSinceSignup}
                />
              </section>
            ) : null}

            {/* ── First-cert progress bar (mobile) ── */}
            {enrolledProgram && (
              <section style={{ padding: '0.75rem 1.25rem 0' }}>
                <MemberFirstCertProgressBar
                  progress={{
                    percent: memberState.firstCertProgressPercent,
                    stageLabel: totalCourses > 0 && completedCount === totalCourses
                      ? t('firstCertCompleteStage')
                      : memberState.assessmentCompleted
                        ? t('firstCertTrainingStage')
                        : t('firstCertAssessmentStage'),
                    isComplete: totalCourses > 0 && completedCount === totalCourses,
                    stepsComplete: completedCount,
                    stepsTotal: totalCourses,
                  }}
                  compact
                />
              </section>
            )}

            <MobileProgramTrainingCard
              t={t}
              programTitle={program?.title ?? null}
              showProgramSelector={showProgramSelector}
              enrolledProgram={enrolledProgram}
              programSelectorOptions={programSelectorOptions}
              dashboardState={dashboardState}
              nextIncompleteCourseName={nextIncompleteCourse?.name ?? null}
            />

            {dashboardState === 'A' && (
              <MobileStateANextStepCard t={t} noApplicationOnFile={noApplicationOnFile} />
            )}

            {showStuckCounselor && (
              <section aria-label="Counselor help" style={{ padding: '0 1.25rem 0.75rem' }}>
                <MemberStuckCounselorStrip />
              </section>
            )}

            {dashboardState !== 'A' && dominantNextAction ? (
              <ErrorBoundary fallback={<DashboardErrorFallback section="activity" />}>
                <MemberDoThisNextCard action={dominantNextAction} paddingX="1.25rem" />
              </ErrorBoundary>
            ) : null}

            {dashboardState !== 'A' && !dominantNextAction && mobileStripActions.length > 0 && (
              <ErrorBoundary fallback={<DashboardErrorFallback section="activity" />}>
                <section aria-label="Next actions" style={{ padding: '0 1.25rem 1rem' }}>
                  <MemberNextStepsStrip actions={mobileStripActions} compact fillRow />
                </section>
              </ErrorBoundary>
            )}

            <ErrorBoundary fallback={<DashboardErrorFallback section="activity" />}>
              <PlacementConfirmationStrip offers={jobOffers} />
            </ErrorBoundary>
            {!dominantNextAction && applicationStatus?.nextStep && (
              <MobilePriorityActionCard
                t={t}
                applicationStatus={applicationStatus}
                programTitle={program?.title ?? null}
              />
            )}

            <MobileJourneyTimeline
              t={t}
              enrolledProgram={enrolledProgram}
              noApplicationOnFile={noApplicationOnFile}
              assessmentCompleted={assessmentCompleted}
              interviewCompleted={interviewCompleted}
              interviewRequested={interviewRequested}
              interviewEligibleFlag={interviewEligibleFlag}
              preScreeningDone={preScreeningDone}
              completedCount={completedCount}
              allCoursesComplete={allCoursesComplete}
            />
          </>
        ) : null}

        {activeTab === 'learning' ? (
          <>
            <MobileProgramTrainingCard
              t={t}
              programTitle={program?.title ?? null}
              showProgramSelector={showProgramSelector}
              enrolledProgram={enrolledProgram}
              programSelectorOptions={programSelectorOptions}
              dashboardState={dashboardState}
              nextIncompleteCourseName={nextIncompleteCourse?.name ?? null}
            />

            <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
              <section aria-label="Progress overview" style={{ padding: '0 1.5rem 1rem' }}>
                <MemberProgressStrip {...progressStripProps} />
              </section>
            </ErrorBoundary>

            <ErrorBoundary fallback={<DashboardErrorFallback section="training" />}>
              <section aria-label="Certifications" style={{ padding: '0 1.25rem 0.75rem' }}>
                <LogCertificationModal />
              </section>
            </ErrorBoundary>

            <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
              <div role="region" aria-label="Career path" style={{ padding: '0 1.25rem', marginBottom: '0.5rem' }}>
                <MemberCareerPathSection
                  careerMatch={careerMatchFromProfile}
                  coursesCompletedCount={completedCount}
                  trainingNextStep={careerPlanTrainingNextStep}
                />
              </div>
            </ErrorBoundary>

            <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
              <section style={{ padding: '0 1.25rem', marginBottom: '0.85rem' }}>
                {skillMissionTeaser}
              </section>
            </ErrorBoundary>

            <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
              <section id="goals" aria-label="Goals" style={{ padding: '0 1.25rem', marginBottom: '0.85rem', scrollMarginTop: '5rem' }}>
                <GoalsModule />
              </section>
            </ErrorBoundary>

            <MobilePointsSection t={t} memberPoints={memberPoints} recentTx={recentTx} />
            <MobileDiscoverSection
              t={t}
              enrolledProgram={enrolledProgram}
              programTitle={program?.title ?? null}
              nextIncompleteCourseName={nextIncompleteCourse?.name ?? null}
            />
            <MobileRecentActivity t={t} recentTools={recentTools} />
          </>
        ) : null}

        {activeTab === 'opportunities' ? (
          <>
            <MobileDiscoverSection
              t={t}
              enrolledProgram={enrolledProgram}
              programTitle={program?.title ?? null}
              nextIncompleteCourseName={nextIncompleteCourse?.name ?? null}
            />
            <MobileQuickActions t={t} />
            <VoiceSectionErrorBoundary>
              <section aria-label="Career voice assistant" style={{ padding: '0 1.25rem 1.25rem' }}>
                <MemberDashboardVoiceSectionLazy />
              </section>
            </VoiceSectionErrorBoundary>
          </>
        ) : null}
      </div>

      {/* Desktop view (hidden on mobile) - extracted to _components/DesktopDashboard */}
      <DesktopDashboard
        activeTab={activeTab}
        availableTabs={availableTabs}
        userId={user.id}
        showMemberOnboarding={showMemberOnboarding}
        showMemberTour={showMemberTour}
        readOnlyAudit={Boolean(args.readOnlyAudit)}
        superAdmin={superAdmin}
        intakeExtra={intakeExtra}
        wizardProgramInterest={wizardProgramInterest}
        todayHero={todayHero}
        skillMissionTeaser={skillMissionTeaser}
        showProgramSelector={showProgramSelector}
        enrolledProgram={enrolledProgram}
        programSelectorOptions={programSelectorOptions}
        recommendedActions={recommendedActions}
        jobSearchUrl={jobSearchUrl}
        aiToolsUsedCount={recentTools.length}
        firstName={firstName}
        dominantNextAction={dominantNextAction}
        showStuckCounselor={showStuckCounselor}
        progressPercentDisplay={progressPercentDisplay}
        nextBestActions={nextBestActions}
        assessmentCompleted={assessmentCompleted}
        starterProfileReviewRequired={starterProfileReview.required}
        starterProfileMissingLabels={starterProfileMissingLabels}
        dashboardState={dashboardState}
        programTitle={program?.title}
        enrolledAt={dbUser.enrolledAt}
        assessmentScorePct={dbUser.assessmentScorePct}
        completedCount={completedCount}
        totalCourses={totalCourses}
        nextMilestone={nextIncompleteCourse?.name}
        lastThree={lastThree}
        checklist={checklist}
        checklistAllDone={checklistAllDone}
        applicationStatus={applicationStatus}
        noApplicationOnFile={noApplicationOnFile}
        userAge={userAge}
        isMinor={isMinor}
        showFirstValuePanel={showFirstValuePanel}
        firstValueActions={firstValueActions}
        firstValueSecondsSinceSignup={firstValueSecondsSinceSignup}
        progressStripProps={progressStripProps}
        careerMatchFromProfile={careerMatchFromProfile}
        careerPlanTrainingNextStep={careerPlanTrainingNextStep}
        memberPoints={memberPoints}
        recentTx={recentTx}
        jobOffers={jobOffers}
        showMatchedRoles={showMatchedRoles}
        firstCertProgressPercent={memberState.firstCertProgressPercent}
        />

      {/* Bottom nav ΓÇö mobile only */}    </>
  );
}
