import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDate } from '@/lib/formatDate';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import { EMPLOYER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { employerVoiceSurface, employerVoiceSessionAccent } from '@/lib/portal/voice';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import StatusBadge from '@/components/portal/StatusBadge';
import PortalCard from '@/components/portal/ui/PortalCard';
import {
  employerJobPostingApplicationStatusBadgeVariant,
  employerJobPostingApplicationStatusLabel,
} from '@/lib/employer/jobPostingApplicationStatus';
import EmployerHiringIntentPanel from '@/components/employer/EmployerHiringIntentPanel';
import { getTranslations } from 'next-intl/server';
import { EMPLOYER_LIST_CAP } from '@/lib/db/queryCaps';
import { matchScoreAsPercent } from '@/lib/employer/matchScoreDisplay';
import {
  EmployerHomeKit,
  type EmployerCandidateRow,
  type EmployerOpenRoleItem,
} from '@/components/portal/kit/pages/employer/EmployerHomeKit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('employerOverview'),
    description: t('manageJobPostings'),
    path: '/employer',
  });
}

export default async function EmployerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer');

  const superAdmin = await isSuperAdmin(user.id);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getEmployerForUser(user.id, { isSuperAdminHint: superAdmin, readOnlyAudit });
  if (!ctx) {
    redirect(await unlinkedEmployerHref(user.id));
  }

  // ── ?ui=kit LEAN PATH ──────────────────────────────────────────────────
  // Runs AFTER the auth/role guard (access control preserved: user + ctx
  // resolved) but BEFORE the heavy `prisma.employer.findUnique`, the
  // 9-query `Promise.all`, the capped hired-application sample, and the
  // aIJobMatch match-to-hire pass — all of which stall on the demo DB.
  // Renders the redesigned employer kit from a handful of cheap queries.
  const params = await searchParams;
  // v2 kit is the DEFAULT employer overview; legacy via ?ui=legacy.
  if (params?.ui !== 'legacy') {
    const kitT = await getTranslations('employer');
    const [
      kitOpenRoles,
      kitTotalCandidates,
      kitInterviews,
      kitHired,
      kitRecent,
      kitOpenRolesList,
    ] = await Promise.all([
      prisma.job.count({ where: { employerId: ctx.employerId, status: 'live' } }),
      prisma.jobPostingApplication.count({
        where: { job: { employerId: ctx.employerId } },
      }),
      prisma.jobPostingApplication.count({
        where: { job: { employerId: ctx.employerId }, status: 'interview' },
      }),
      prisma.jobPostingApplication.count({
        where: { job: { employerId: ctx.employerId }, status: 'hired' },
      }),
      prisma.jobPostingApplication.findMany({
        where: { job: { employerId: ctx.employerId } },
        orderBy: { appliedAt: 'desc' },
        take: 5,
        include: {
          job: { select: { title: true } },
          student: { select: { fullName: true } },
        },
      }),
      // Top live roles by applicant volume for the "Open roles" side queue.
      // `applicationsCount` is a denormalized counter on Job (kept in sync by
      // the application-create path), so this needs no join/aggregate.
      prisma.job.findMany({
        where: { employerId: ctx.employerId, status: 'live' },
        orderBy: { applicationsCount: 'desc' },
        take: 5,
        select: { id: true, title: true, location: true, applicationsCount: true },
      }),
    ]);

    // Cheap, indexed fit-score lookup for the handful of candidates shown in
    // the table below — same OR-of-unique-[jobId,studentId]-pairs pattern as
    // the legacy avgMatchToHireDays computation further down this file,
    // bounded to kitRecent.length (≤ 5).
    const kitFitPairs = kitRecent.map((a) => ({ jobId: a.jobId, studentId: a.studentId }));
    const kitFitMatches = kitFitPairs.length
      ? await prisma.aIJobMatch.findMany({
          where: { OR: kitFitPairs },
          select: { jobId: true, studentId: true, matchScore: true },
        })
      : [];
    const kitFitByPair = new Map(kitFitMatches.map((m) => [`${m.jobId}:${m.studentId}`, m.matchScore]));

    const kitCandidates: EmployerCandidateRow[] = kitRecent.map((app) => {
      const rawScore = kitFitByPair.get(`${app.jobId}:${app.studentId}`);
      return {
        id: app.id,
        name: app.student?.fullName ?? 'Candidate',
        role: app.job?.title ?? 'Open role',
        fitScore: typeof rawScore === 'number' ? matchScoreAsPercent(rawScore) : undefined,
        status: app.status,
        statusLabel: employerJobPostingApplicationStatusLabel(app.status),
        appliedLabel: app.appliedAt ? formatPortalDate(app.appliedAt) : undefined,
        href: `/employer/applications/${app.id}`,
      };
    });

    const kitOpenRolesRows: EmployerOpenRoleItem[] = kitOpenRolesList.map((job) => ({
      id: job.id,
      title: job.title,
      applicants: job.applicationsCount,
      location: job.location ?? undefined,
      href: `/employer/jobs/${job.id}`,
    }));

    return (
      <>
        {/* ── Voice Assistant ── */}
        {/* Mounts the real ElevenLabs voice surface (same wiring as the legacy
            path) so the start control actually opens a hands-free session
            against /api/employer/voice-session — not a Link to the apps list. */}
        <div className="wa-px-6 wa-pt-6">
          <VoiceAgentSurface {...employerVoiceSurface}>
            <PortalVoiceSessionLazy
              sessionEndpoint="/api/employer/voice-session"
              title={kitT('employerVoiceAssistant')}
              description={kitT('askAboutPostingRoles')}
              {...employerVoiceSessionAccent}
              speakingLabel={kitT('assistantIsSpeaking')}
              listeningLabel={kitT('listeningAskYourQuestion')}
            />
          </VoiceAgentSurface>
        </div>

        <EmployerHomeKit
          companyName={ctx.employer.companyName}
          openRoles={kitOpenRoles}
          inPipeline={kitTotalCandidates}
          interviews={kitInterviews}
          hires={kitHired}
          candidates={kitCandidates}
          openRolesList={kitOpenRolesRows}
        />
      </>
    );
  }

  const isPendingApproval = ctx.employer.status === 'pending_approval';

  const employerRow = await prisma.employer.findUnique({
    where: { id: ctx.employerId },
    select: {
      onboardingCompletedAt: true,
      onboardingCurrentStep: true,
      tourCompletedAt: true,
      companyName: true,
      industry: true,
      companySize: true,
      companyWebsite: true,
    },
  });
  if (!employerRow) {
    redirect(await unlinkedEmployerHref(user.id));
  }

  const t = await getTranslations('employer');

  const hiringIntents = await prisma.employerHiringIntent.findMany({
    where: { employerId: ctx.employerId },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  const recentApplications = await prisma.jobPostingApplication.findMany({
    where: { job: { employerId: ctx.employerId } },
    orderBy: { appliedAt: 'desc' },
    take: 5,
    include: {
      job: { select: { title: true } },
      student: { select: { fullName: true } },
    },
  });

  const [
    jobStatusRows,
    totalApplications,
    totalMatches,
    interviewPipelineCount,
    hiredApplications,
    hiredApplicationsCount,
    filledJobsCount,
    offerStageCount,
    screenedCount,
    interviewCount,
  ] = await Promise.all([
    prisma.job.groupBy({
      by: ['status'],
      where: { employerId: ctx.employerId },
      _count: { id: true },
    }),
    prisma.jobPostingApplication.count({
      where: { job: { employerId: ctx.employerId } },
    }),
    prisma.aIJobMatch.count({
      where: { job: { employerId: ctx.employerId, status: 'live' } },
    }),
    prisma.jobPostingApplication.count({
      where: {
        job: { employerId: ctx.employerId },
        status: { in: ['interview', 'offered', 'hired'] },
      },
    }),
    prisma.jobPostingApplication.findMany({
      take: EMPLOYER_LIST_CAP,
      where: { job: { employerId: ctx.employerId }, status: 'hired' },
      select: {
        jobId: true,
        studentId: true,
        statusUpdatedAt: true,
        appliedAt: true,
      },
    }),
    prisma.jobPostingApplication.count({
      where: { job: { employerId: ctx.employerId }, status: 'hired' },
    }),
    prisma.job.count({ where: { employerId: ctx.employerId, status: 'filled' } }),
    prisma.jobPostingApplication.count({
      where: { job: { employerId: ctx.employerId }, status: 'offered' },
    }),
    prisma.jobPostingApplication.count({
      where: { job: { employerId: ctx.employerId }, status: 'reviewing' },
    }),
    prisma.jobPostingApplication.count({
      where: { job: { employerId: ctx.employerId }, status: 'interview' },
    }),
  ]);

  const jobCountsByStatus = new Map(jobStatusRows.map((row) => [row.status, row._count.id]));
  const totalJobs = jobStatusRows.reduce((sum, row) => sum + row._count.id, 0);
  const activeJobs = jobCountsByStatus.get('live') ?? 0;
  const inReview = (jobCountsByStatus.get('pending') ?? 0) + (jobCountsByStatus.get('approved') ?? 0);
  const filledPositions = (jobCountsByStatus.get('filled') ?? 0) + (jobCountsByStatus.get('closed') ?? 0);
  const hiresFromApplications = hiredApplicationsCount;
  const hiresTotal = hiresFromApplications + filledJobsCount;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const applicationsLast30d = await prisma.jobPostingApplication.count({
    where: { job: { employerId: ctx.employerId }, appliedAt: { gte: thirtyDaysAgo } },
  });

  let avgMatchToHireDays: number | null = null;
  if (hiredApplications.length > 0) {
    const matchRows = await prisma.aIJobMatch.findMany({
      take: EMPLOYER_LIST_CAP,
      where: {
        OR: hiredApplications.map((h) => ({ jobId: h.jobId, studentId: h.studentId })),
      },
      select: { jobId: true, studentId: true, createdAt: true },
    });
    const matchMap = new Map(matchRows.map((m) => [`${m.jobId}:${m.studentId}`, m.createdAt]));
    const deltas: number[] = [];
    for (const h of hiredApplications) {
      const start = matchMap.get(`${h.jobId}:${h.studentId}`);
      const end = h.statusUpdatedAt ?? h.appliedAt;
      if (start && end && end.getTime() >= start.getTime()) {
        deltas.push(end.getTime() - start.getTime());
      }
    }
    if (deltas.length > 0) {
      avgMatchToHireDays = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length / (1000 * 60 * 60 * 24));
    }
  }

  const showEmployerOnboarding = employerRow.onboardingCompletedAt == null;
  // Guided tours v2 (flag `guided_tours_v2`): when it is on for this user the
  // shell's first-login strip and Help menu own the tour, so the legacy
  // 1.5 s auto-start stays off. Flag row absent → pre-flag behaviour.
  const guidedToursV2 = (await getTourOffer(user.id, 'employer.home'))?.enabled === true;
  const showEmployerTour =
    !guidedToursV2 && employerRow.onboardingCompletedAt != null && employerRow.tourCompletedAt == null;

  const kpiCards = [
    {
      label: t('totalCandidates'),
      value: totalApplications.toString(),
      trend: applicationsLast30d > 0 ? t('candidateCountLast30d', { count: applicationsLast30d }) : t('noRecentApplicants'),
      trendColor: 'var(--color-on-surface-variant)',
      borderAccent: true,
    },
    {
      label: t('activeTracks'),
      value: activeJobs.toString(),
      trend: inReview > 0 ? t('awaitingGoLiveCount', { count: inReview }) : t('allLiveOrClosed'),
      trendColor: 'var(--color-on-surface-variant)',
    },
    {
      label: t('verifiedHires'),
      value: hiresTotal.toString(),
      trend: offerStageCount > 0 ? t('offersOutCount', { count: offerStageCount }) : t('noOpenOffers'),
      trendColor: 'var(--color-on-surface-variant)',
    },
    {
      label: t('avgTimeToHire'),
      value: avgMatchToHireDays === null ? '\u2014' : `${avgMatchToHireDays}d`,
      trend:
        avgMatchToHireDays !== null
          ? t('matchToHireTracked')
          : t('addHiresToSeeTiming'),
      trendColor: 'var(--color-on-surface-variant)',
    },
  ];

  const placementCards = [
    { label: t('membersMatchedToRoles'), value: totalMatches, icon: 'auto_awesome' },
    { label: t('interviewsOrLater'), value: interviewPipelineCount, icon: 'calendar_today' },
    { label: t('hiresAppsPlusFilled'), value: hiresTotal, icon: 'person_check' },
    { label: t('avgDaysMatchToHire'), value: avgMatchToHireDays === null ? '\u2014' : avgMatchToHireDays, icon: 'timer' },
  ];

  return (
    <PortalEntryClient
      portal="employer"
      tourStorageUserId={user.id}
      showOnboardingWizard={showEmployerOnboarding}
      showTour={showEmployerTour}
      readOnlyAudit={readOnlyAudit}
      isSuperAdmin={superAdmin}
      tourSteps={EMPLOYER_PORTAL_TOUR_STEPS}
      wizardProps={{
        companyName: employerRow.companyName,
        industry: employerRow.industry ?? '',
        companySize: employerRow.companySize ?? '',
        companyWebsite: employerRow.companyWebsite ?? '',
        initialStep: employerRow.onboardingCurrentStep ?? 0,
      }}
    >
    <PortalPageFrame>
      {isPendingApproval && (
        <div style={{
          background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-gold) 32%, transparent)',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-warning-on-surface)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">hourglass_empty</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-warning-on-surface)', margin: 0 }}>
              Your account is pending approval
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
              You can draft jobs now. After our team approves your account, you can submit them for review and they will go live.
            </p>
          </div>
        </div>
      )}
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('employerOverview')}
        subtitle={t('manageJobPostings')}
        action={
          <div className="wa-hidden md:wa-flex" style={{ gap: '0.75rem' }}>
            <Link href="/employer/jobs/import" className="btn btn-outline">{t('importJobs')}</Link>
            <Link href="/employer/jobs/new" data-tour="tour-post-job" className="btn btn-primary">{t('postAJob')}</Link>
          </div>
        }
      />
      {/* ── Mobile Employer Dashboard (≤640px) ── */}
      <div className="wa-block md:wa-hidden portal-mobile-content">
        {/* Hero */}
        <div style={{ paddingLeft:"1.5rem", paddingRight:"1.5rem", paddingTop:"1.5rem", paddingBottom:"0.5rem" }}>
          <h2 className="wa-text-2xl wa-font-extrabold wa-tracking-tight text-on-surface wa-leading-tight">
            {t('heroHeadline', { count: totalApplications })}
          </h2>
        </div>
        {/* Stats row - horizontal scroll */}
        <div style={{ display:"flex", gap:"0.75rem", overflowX:"auto", scrollbarWidth:"none", paddingLeft:"1.5rem", paddingRight:"1.5rem", paddingBottom:"0.5rem" }}>
          {[
            { label: t('openRoles'), value: activeJobs, color: 'var(--color-on-surface)' },
            { label: t('candidates'), value: totalApplications, color: 'var(--color-on-surface)' },
            { label: t('awaitingGoLive'), value: inReview, color: 'var(--color-on-surface-variant)' },
          ].map((s) => (
            <div
              key={s.label}
              className="portal-kpi-card"
              style={{ minWidth:"130px", flex:1, padding:"1rem", borderRadius:"0.75rem" }}
            >
              <p className="portal-kpi-card__label" style={{ marginBottom:"0.25rem" }}>{s.label}</p>
              <p className="portal-kpi-card__value" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
        {/* Pipeline summary strip */}
        <div className="portal-kpi-card" style={{ marginLeft:"1.5rem", marginRight:"1.5rem", marginTop:"0.75rem", padding:"1rem", borderRadius:"0.75rem", display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"center" }}>
          {[
            { label: t('screened'), value: screenedCount },
            { label: t('interview'), value: interviewCount },
            { label: t('offer'), value: offerStageCount },
            { label: t('hired'), value: hiresFromApplications },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              <div style={{ flex:1, textAlign:"center" }}>
                <p className="wa-text-[13px] wa-font-bold text-on-surface-variant/50 wa-uppercase wa-tracking-tighter">{s.label}</p>
                <p className="wa-text-sm wa-font-bold text-on-surface">{s.value}</p>
              </div>
              {i < arr.length - 1 && <div className="bg-outline-variant/30" style={{ width: '1px', height:"1.25rem" }} />}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: '1.5rem', marginRight: '1.5rem', marginTop: '1rem' }}>
          <VoiceAgentSurface {...employerVoiceSurface}>
            <PortalVoiceSessionLazy
              sessionEndpoint="/api/employer/voice-session"
              title={t('employerVoiceAssistant')}
              description={t('askAboutPostingRoles')}
              {...employerVoiceSessionAccent}
              speakingLabel={t('assistantIsSpeaking')}
              listeningLabel={t('listeningAskYourQuestion')}
            />
          </VoiceAgentSurface>
        </div>
        {/* Quick actions — Review Apps is primary when candidates exist */}
        <div className="employer-quick-actions" style={{ marginLeft:"1.5rem", marginRight:"1.5rem", marginTop:"1rem", display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"0.75rem" }}>
          {totalApplications > 0 ? (
            <Link href="/employer/applications"
              style={{ gridColumn: 'span 2', padding: '1rem 1.25rem', borderRadius: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))', boxShadow: '0 4px 16px color-mix(in srgb, var(--wa-accent) 30%, transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-on-hero)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">grading</span>
                <span style={{ fontWeight: 700, color: 'var(--wa-on-hero)', fontSize: '0.9375rem', letterSpacing: '-0.01em' }}>
                  {t('reviewCandidates', { count: totalApplications })}
                </span>
              </div>
              <span className="material-symbols-outlined" style={{ color: 'color-mix(in srgb, var(--wa-on-hero) 70%, transparent)' }} aria-hidden="true">arrow_forward</span>
            </Link>
          ) : (
            <Link href="/employer/jobs/new"
              style={{ gridColumn: 'span 2', padding: '1rem 1.25rem', borderRadius: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))', boxShadow: '0 4px 16px color-mix(in srgb, var(--wa-accent) 30%, transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-on-hero)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">add_circle</span>
                <span style={{ fontWeight: 700, color: 'var(--wa-on-hero)', fontSize: '0.9375rem', letterSpacing: '-0.01em' }}>{t('postYourFirstRole')}</span>
              </div>
              <span className="material-symbols-outlined" style={{ color: 'color-mix(in srgb, var(--wa-on-hero) 70%, transparent)' }} aria-hidden="true">arrow_forward</span>
            </Link>
          )}
          <Link href="/employer/jobs/new"
            className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none" style={{ padding:"1rem", borderRadius:"0.75rem", display:"flex", flexDirection:"column", gap:"0.5rem", alignItems:"flex-start", textDecoration:"none", minHeight:"44px", background: 'var(--surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)' }} aria-hidden="true">add_circle</span>
            <span className="wa-text-sm wa-font-bold wa-leading-tight">{t('postARole')}</span>
          </Link>
          <Link href="/employer/messages"
            className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none" style={{ padding:"1rem", borderRadius:"0.75rem", display:"flex", flexDirection:"column", gap:"0.5rem", alignItems:"flex-start", textDecoration:"none", minHeight:"44px", background: 'var(--surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-gold)' }} aria-hidden="true">forum</span>
            <span className="wa-text-sm wa-font-bold wa-leading-tight">{t('messages')}</span>
          </Link>
        </div>
        {/* Recent applicants */}
        <div style={{ marginLeft:"1.5rem", marginRight:"1.5rem", marginTop:"1.5rem" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:"1rem" }}>
            <h3 className="wa-text-xl wa-font-bold wa-tracking-tight text-on-surface">{t('recentApplicants')}</h3>
            <Link
              href="/employer/applications"
              className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-widest"
              style={{ textDecoration:"none", color: 'var(--wa-accent-text)' }}
            >
              {t('viewAll')}
            </Link>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            {recentApplications.length === 0 ? (
              <PortalEmptyState
                title={t('noApplicationsYet')}
                description={t('postRoleToStartReceiving')}
                icon={<span className="material-symbols-outlined" aria-hidden="true">inbox</span>}
                primaryAction={{ label: t('postAJob'), href: '/employer/jobs/new' }}
              />
            ) : (
              recentApplications.slice(0, 5).map((app) => (
                <Link key={app.id} href={`/employer/jobs/${app.jobId}`}
                  className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
                  style={{ textDecoration:"none" }}
                >
                  <PortalCard>
                  <div className="bg-surface-container-high" style={{ width:"2.5rem", height:"2.5rem", borderRadius:"9999px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span className="material-symbols-outlined wa-text-[18px] text-on-surface-variant" aria-hidden="true">person</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <h4 className="wa-font-bold text-on-surface wa-text-sm wa-truncate">{app.student.fullName}</h4>
                      <span className="wa-text-[13px] text-on-surface-variant/60 wa-font-medium" style={{ marginLeft:"0.5rem", flexShrink:0 }}>
                        {app.appliedAt ? formatPortalDate(app.appliedAt) : '—'}
                      </span>
                    </div>
                    <p
                      className="wa-text-xs wa-font-semibold wa-uppercase wa-tracking-wider wa-truncate"
                      style={{ marginBottom:"0.25rem", color: 'var(--color-on-surface-variant)' }}
                    >
                      {app.job.title}
                    </p>
                    <StatusBadge
                      label={employerJobPostingApplicationStatusLabel(app.status)}
                      variant={employerJobPostingApplicationStatusBadgeVariant(app.status)}
                    />
                  </div>
                  </PortalCard>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 1.5rem' }} className="md:wa-hidden">
        <EmployerHiringIntentPanel initialIntents={hiringIntents} />
      </div>

      {/* ── Desktop View ── */}
      <div className="wa-hidden md:wa-block">
      <section style={{ marginBottom: '2rem' }}>
        <VoiceAgentSurface {...employerVoiceSurface}>
          <PortalVoiceSessionLazy
            sessionEndpoint="/api/employer/voice-session"
            title={t('employerVoiceAssistant')}
            description={t('askAboutPostingRoles')}
            {...employerVoiceSessionAccent}
            speakingLabel={t('assistantIsSpeaking')}
            listeningLabel={t('listeningAskYourQuestion')}
          />
        </VoiceAgentSurface>
      </section>

      {/* ── Empty State (shown first for cold-start clarity) ── */}
      {totalJobs === 0 && (
        <section className="portal-section--lg">
          <PortalEmptyState
            title={t('welcomeStartWithFirstPosting')}
            description={t('noJobDraftsOrLiveRoles')}
            icon={<span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-on-surface-variant)' }} aria-hidden="true">work</span>}
            primaryAction={{ label: t('postYourFirstJob'), href: '/employer/jobs/new' }}
            secondaryAction={{ label: t('importJobs'), href: '/employer/jobs/import' }}
          />
        </section>
      )}

      {/* ── KPI Metric Strip ── */}
      <section className="portal-metric-strip" style={{ marginBottom: '2rem' }}>
        {[
          { label: t('totalCandidates'), value: totalApplications, hint: applicationsLast30d > 0 ? t('candidateCountLast30dShort', { count: applicationsLast30d }) : t('noRecentActivity'), icon: 'groups', accent: 'accent' as const },
          { label: t('activeRoles'), value: activeJobs, hint: inReview > 0 ? t('awaitingGoLiveCount', { count: inReview }) : t('allLiveOrClosed'), icon: 'work', accent: 'blue' as const },
          { label: t('verifiedHires'), value: hiresTotal, hint: offerStageCount > 0 ? t('offersOutCount', { count: offerStageCount }) : t('noOpenOffers'), icon: 'person_check', accent: 'green' as const },
          { label: t('avgTimeToHire'), value: avgMatchToHireDays === null ? '—' : `${avgMatchToHireDays}d`, hint: avgMatchToHireDays !== null ? t('matchToHire') : t('addHiresToSee'), icon: 'timer', accent: 'gold' as const },
        ].map((card) => (
          <div key={card.label} className="portal-metric-card">
            <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${card.accent}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{card.icon}</span>
            </div>
            <p className="portal-metric-card__value">{card.value}</p>
            <p className="portal-metric-card__label">{card.label}</p>
            <p className="portal-metric-card__hint">{card.hint}</p>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <EmployerHiringIntentPanel initialIntents={hiringIntents} />
      </section>

      {/* ── {t('talentPipeline')} + Sidebar ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Pipeline */}
        <div className="portal-card portal-card--flat portal-card--padded-lg">
          <div className="portal-section-header" style={{ marginBottom: '2rem' }}>
            <h2 className="portal-section-heading" style={{ margin: 0 }}>{t('talentPipeline')}</h2>
            <span className="material-symbols-outlined" style={{ padding: '0.5rem', background: 'var(--surface-container-lowest)', borderRadius: '0.375rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }} aria-hidden="true">filter_list</span>
          </div>

          {/* Placement snapshot — icon mini-cards */}
          <div className="portal-grid-metrics" style={{ marginBottom: '1.75rem' }}>
            {placementCards.map((card) => (
              <div key={card.label} className="portal-metric-card">
                <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{card.icon}</span>
                </div>
                <p className="portal-metric-card__value" style={{ fontSize: '1.5rem' }}>{card.value}</p>
                <p className="portal-metric-card__label" style={{ fontSize: '0.8125rem' }}>{card.label}</p>
              </div>
            ))}
          </div>

          {/* Action links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { label: t('createAPosting'), desc: t('addARoleSetPay'), href: '/employer/jobs/new', icon: 'add_circle' },
              { label: t('managePostings'), desc: t('managePostingsDesc'), href: '/employer/jobs', icon: 'work' },
              { label: t('reviewApplicants'), desc: t('reviewApplicantsDesc'), href: '/employer/applications', icon: 'grading' },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="portal-quick-action-item">
                <div className="portal-quick-action-item__icon">
                  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{item.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="portal-quick-action-item__label">{item.label}</p>
                  <p className="portal-quick-action-item__desc">{item.desc}</p>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.3, flexShrink: 0 }} aria-hidden="true">chevron_right</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Verification + Featured */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="portal-card portal-card--flat portal-card--padded">
            <h3 className="portal-section-title" style={{ marginBottom: '1.5rem' }}>
              {t('pipelineSummary')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { icon: 'verified', label: t('activePostings'), value: activeJobs, iconColor: 'var(--color-green)' },
                { icon: 'history_edu', label: t('inReview'), value: inReview, iconColor: 'var(--color-gold)' },
                { icon: 'gavel', label: t('filledClosed'), value: filledPositions, iconColor: 'var(--color-on-surface-variant)' },
              ].map((item) => (
                <div key={item.label} className="portal-pipeline-item">
                  <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', '--ms-fill': 1 }} aria-hidden="true">{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p className="portal-pipeline-item__label">{item.label}</p>
                    <p className="portal-pipeline-item__meta">{item.value} {item.label.toLowerCase()}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/employer/jobs" className="btn btn-outline" style={{ display: 'block', width: '100%', marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8125rem' }}>
              {t('managePostings')}
            </Link>
          </div>

          <div className="portal-card portal-card--flat" style={{ background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))', padding: '1.5rem', overflow: 'hidden', position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', bottom: '-1rem', right: '-1rem', fontSize: '6rem', opacity: 0.08, color: 'var(--wa-on-hero)' }} aria-hidden="true">school</span>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--wa-on-hero)', marginBottom: '0.5rem' }}>{t('workforceAdvancement')}</h3>
              <p style={{ fontSize: '0.8125rem', color: 'color-mix(in srgb, var(--wa-on-hero) 85%, transparent)', marginBottom: '1rem', lineHeight: 1.5 }}>
                {t('accessCredentialedGraduates')}
              </p>
              <Link href="/employer/jobs/new" style={{ display: 'inline-block', padding: '0.5rem 1rem', background: 'var(--wa-hero-action-bg)', color: 'var(--wa-hero-action-text)', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none' }}>
                {t('postAJob')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── {t('recentApplicants')} ── */}
      <section style={{ marginBottom: '2rem' }}>
        <div className="portal-section-header">
          <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>{t('latestApplicants')}</h2>
          <Link href="/employer/applications" className="portal-section-action">
            {t('viewAll')}
            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
          </Link>
        </div>

        {recentApplications.length === 0 ? (
          <div className="portal-card portal-card--flat portal-card--padded-lg" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--color-on-surface-variant)' }}>
              {t('noApplicationsYetPublish')}
            </p>
            <Link href="/employer/jobs/new" className="btn btn-primary" style={{ display: 'inline-flex' }}>{t('postYourFirstJob')}</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {recentApplications.map((app) => (
              <Link
                key={app.id}
                href={`/employer/jobs/${app.jobId}`}
                className="portal-card portal-card--flat portal-card--padded"
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--color-on-surface)' }}>{app.student.fullName}</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', fontWeight: 500, marginBottom: '0.75rem' }}>
                    {t('appliedTo')} {app.job.title}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
                    {app.appliedAt ? formatPortalDate(app.appliedAt) : '—'}
                  </p>
                  <StatusBadge
                    label={employerJobPostingApplicationStatusLabel(app.status)}
                    variant={employerJobPostingApplicationStatusBadgeVariant(app.status)}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      </div>{/* end desktop */}
    </PortalPageFrame>    </PortalEntryClient>
  );
}
