import type { Metadata } from 'next';
import { redirect, unstable_rethrow } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { ensureAppUserProvisioned } from '@/lib/member/ensureAppUser';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import { getTranslations } from 'next-intl/server';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import { getApprovalWaitEstimate } from '@/lib/member/counselorContext';
import { memberApprovalCardPlacement } from '@/lib/member/memberApprovalCardPlacement';
import { legacyDashboardRedirectTarget } from '@/lib/member/dashboardLegacyRedirect';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { MemberHomeViewEvents } from '@/components/portal/kit/pages/member/MemberHomeViewEvents';

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

  try {
    return await renderMemberDashboard(user, { readOnlyAudit });
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
  args: { readOnlyAudit?: boolean } = { readOnlyAudit: false },
) {
  // Query budget lives in loadMemberDashboardHome (1-2 Prisma ops in one
  // $transaction). Coursera/B4B + getMemberState stay off this path.
  const home = await loadMemberDashboardHome({
    userId: user.id,
    fallbackDisplayName: user.email,
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
  return (
    <>
    {/* The dashboard view / activation events the admin metrics and health
        score read (moved here from the retired legacy home, WAP-188). */}
    {home.dashboardViewFacts ? <MemberHomeViewEvents {...home.dashboardViewFacts} /> : null}
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
