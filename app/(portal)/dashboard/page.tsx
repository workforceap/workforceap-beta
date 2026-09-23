import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect, unstable_rethrow } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { canBypassMemberAssessment, isSuperAdmin } from '@/lib/auth/roles';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import { getTranslations } from 'next-intl/server';
import PortalEntryErrorBoundary from '@/components/portal/PortalEntryErrorBoundary';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import { MEMBER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import { getApprovalWaitEstimate } from '@/lib/member/counselorContext';
import { memberApprovalCardPlacement } from '@/lib/member/memberApprovalCardPlacement';
import { legacyDashboardRedirectTarget } from '@/lib/member/dashboardLegacyRedirect';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { MemberHomeViewEvents } from '@/components/portal/kit/pages/member/MemberHomeViewEvents';

const PWAInstallPrompt = dynamic(() => import('@/components/pwa/PWAInstallPrompt'), {
  loading: () => null,
});

// The member home is one implementation: the kit home, fed by the 1-2 op
// loadMemberDashboardHome. The retired `?ui=legacy` home (WAP-195) and its
// 60s maxDuration are gone; the platform default covers this render.

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
  searchParams?: Promise<{ program?: string | string[]; tab?: string | string[]; ui?: string | string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard');
  const t = await getTranslations('dashboard');

  // `?ui=legacy` and `?tab=` were switches on the retired legacy home. Send
  // them to the one home, keeping a well-formed `?program=<slug>` (the kit
  // home's loader decides whether it is one of the member's enrollments).
  const params = await searchParams;
  const legacyRedirect = legacyDashboardRedirectTarget(params);
  if (legacyRedirect) redirect(legacyRedirect);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  // Multi-program, view only (WAP-194): `?program=<slug>` picks which of the
  // member's own enrollments the home describes; the loader validates it and
  // falls back to the primary.
  const rawProgram = Array.isArray(params?.program) ? params.program[0] : params?.program;
  const requestedProgramSlug = typeof rawProgram === 'string' ? rawProgram.trim() || null : null;

  try {
    return await renderMemberDashboard(user, { requestedProgramSlug, readOnlyAudit });
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
  args: { requestedProgramSlug: string | null; readOnlyAudit?: boolean } = { requestedProgramSlug: null, readOnlyAudit: false },
) {
  // Query budget lives in loadMemberDashboardHome (1-2 Prisma ops in one
  // $transaction). Coursera/B4B and the member-state pipeline stay off this path.
  const home = await loadMemberDashboardHome({
    userId: user.id,
    fallbackDisplayName: user.email,
    // View-only: picks which of the member's own enrollments the home
    // describes (validated in the loader); it never changes an enrollment.
    requestedProgramSlug: args.requestedProgramSlug,
    provisionIfMissing: () => ensureAppUserProvisioned(user, { readOnlyAudit: args.readOnlyAudit }),
  });
  // Presentation only: a pathway with a live next step keeps the approval
  // card above the dashboard; a finished or closed one drops below the
  // content as a single collapsed line (memberApprovalCardPlacement).
  const approvalPlacement = memberApprovalCardPlacement(home.approvalStatus);
  // Who reviews the pending step comes from the loader's own user read. The
  // measured wait is a separate read, taken only while the application
  // itself is under review, so the loader keeps its operation budget.
  const homeCounselorContext = home.counselorContext ?? null;
  const counselorContext = homeCounselorContext?.awaiting === 'approval' && home.organizationId
    ? { ...homeCounselorContext, waitEstimate: await getApprovalWaitEstimate(home.organizationId) }
    : homeCounselorContext;
  const approvalCard = (
    <MemberApprovalStatusCard
      status={home.approvalStatus}
      storageUserId={user.id}
      placement={approvalPlacement}
      counselorContext={counselorContext}
    />
  );
  // Staff looking at a member home see the same notice My Program shows
  // (the retired legacy home showed it too). Role reads are request-cached (the layout already
  // resolved them), so this is not a new round trip on a member's visit.
  let staffViewer = false;
  try {
    staffViewer = await canBypassMemberAssessment(user.id);
  } catch (e) {
    console.error('[dashboard] canBypassMemberAssessment failed', e);
  }
  // First-login guidance (WAP-194): the wizard while onboarding is not done,
  // then the first-visit tour once. Never two tours: with `guided_tours_v2`
  // on, the shell's first-login strip and Help menu own the tour, so the
  // legacy auto-start stays off. The flag is read only when the auto-start
  // could apply at all.
  const onboarding = home.onboarding;
  const tourAutoStart = onboarding?.showTour
    ? (await getTourOffer(user.id, 'member.home'))?.enabled !== true
    : false;
  let superAdmin = false;
  if (onboarding && (onboarding.showWizard || tourAutoStart)) {
    try {
      superAdmin = await isSuperAdmin(user.id);
    } catch (e) {
      console.error('[dashboard] isSuperAdmin failed', e);
    }
  }
  return (
    <>
    {/* The dashboard view / activation events the admin metrics and health
        score read (moved here from the retired legacy home, WAP-188). */}
    {home.dashboardViewFacts ? <MemberHomeViewEvents {...home.dashboardViewFacts} /> : null}
    <PWAInstallPrompt />
    {onboarding && (onboarding.showWizard || tourAutoStart) ? (
      // A sibling, not a wrapper: if the wizard or tour throws, the boundary
      // keeps the home itself on screen. Phone and desktop alike.
      <PortalEntryErrorBoundary>
        <PortalEntryClient
          portal="member"
          tourStorageUserId={user.id}
          showOnboardingWizard={onboarding.showWizard}
          showTour={tourAutoStart}
          readOnlyAudit={Boolean(args.readOnlyAudit)}
          isSuperAdmin={superAdmin}
          tourSteps={MEMBER_PORTAL_TOUR_STEPS}
          wizardProps={{
            ...onboarding.wizard,
            // Same counselor and measured wait as the approval card above.
            counselor: counselorContext?.counselor
              ? { firstName: counselorContext.counselor.firstName, messagingHref: counselorContext.counselor.messagingHref }
              : null,
            waitEstimate: counselorContext?.awaiting === 'approval' ? counselorContext.waitEstimate : null,
          }}
        >
          {null}
        </PortalEntryClient>
      </PortalEntryErrorBoundary>
    ) : null}
    {approvalPlacement === 'primary' ? approvalCard : null}
    <MemberHomeKit
      showStaffViewBanner={staffViewer}
      programSwitch={home.programSwitch}
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
      pointsSpark={home.pointsSpark}
      programHref={home.programHref}
      resumeHref={home.resumeHref}
      coursesHref={home.coursesHref}
      toolkitHref={home.toolkitHref}
      jobsHref={home.jobsHref}
      doThisNext={home.doThisNext}
      upNext={home.upNext}
      recommendedTool={home.recommendedTool}
      ungatedDigitalBasicsHref={home.programTitle ? null : home.ungatedDigitalBasicsHref}
      jobOffers={home.jobOffers}
      first90={home.first90}
      youthNoticeAge={home.youthNoticeAge}
    />
    {approvalPlacement === 'demoted' ? approvalCard : null}
    </>
  );
}
