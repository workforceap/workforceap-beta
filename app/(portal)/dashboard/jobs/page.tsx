import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { isExcludedPublicEmployerName, isExcludedPublicJobTitle } from '@/lib/jobs/publicJobFilters';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { getAgeGroup } from '@/lib/util/ageCalculation';
import { Briefcase } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import LogExternalApplicationButton from '@/components/portal/jobs/LogExternalApplicationButton';
import JobsListingClient from './JobsListingClient';
import JobsBoardSkeleton from './JobsBoardSkeleton';
import {
  JOBS_OPEN_ROLES_ANCHOR,
  MemberJobsKit,
  type OpenRoleRow,
} from '@/components/portal/kit/pages/member/MemberJobsKit';
import { displayJobLocation, isActiveApplicationStatus } from '@/lib/member/jobPipelineDisplay';
import { buildExternalJobBoards, buildExternalJobSearchQuery } from '@/lib/member/externalJobSearchQuery';
import type { CareerMatchResult } from '@/lib/onet/types';
import { formatJobSalaryRange } from '@/lib/jobs/formatSalary';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
  title: t('jobBoard'),
  description: t('jobBoardDescription'),
  path: '/dashboard/jobs',
});
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  const t = await getTranslations('dashboard');

  let ageGroup: 'under14' | 'youth14to17' | 'adult18plus' = 'adult18plus';
  let profileCity: string | null = null;
  let profileState: string | null = null;
  // External job-board links search for the member's target role (career-quiz
  // top occupation), else their program title, else the generic literal.
  let externalSearch = buildExternalJobSearchQuery({});
  // SSR: fetch applied job IDs so job cards can show "Applied" badge.
  let appliedJobIds: string[] = [];
  // Pull the member's tracked applications (all statuses) — SAVED rows feed
  // the "Saved" KPI; the rest drive the KPIs + pipeline table below. Only
  // needed for the default (non-legacy) member kit view.
  let pipelineRows: Array<{
    id: string;
    role: string;
    company: string;
    location: string | null;
    appliedAt: Date | null;
    createdAt: Date;
    status: 'SAVED' | 'APPLIED' | 'PHONE_SCREEN' | 'INTERVIEWING' | 'OFFER' | 'ACCEPTED' | 'REJECTED';
  }> = [];
  let pipelineLoadFailed = false;
  const needsPipeline = requestedUi !== 'legacy' && !!user;

  if (user) {
    // Only the job-board query below depends on the profile (ageGroup); the
    // applied-IDs and pipeline reads are independent of it and of each
    // other, so run all three together instead of one round trip at a time.
    const [profileResult, appliedResult, pipelineResult] = await Promise.allSettled([
      prisma.profile.findUnique({
        where: { userId: user.id },
        select: {
          dob: true,
          isMinor: true,
          city: true,
          state: true,
          user: {
            select: {
              careerRecommendationJson: true,
              enrolledProgram: true,
              courseEnrollments: { where: { isPrimary: true }, take: 1, select: { programSlug: true } },
            },
          },
        },
      }),
      prisma.jobApplication.findMany({
        take: 500,
        where: { userId: user.id, status: { not: 'SAVED' }, curatedJobId: { not: null } },
        select: { curatedJobId: true },
      }),
      needsPipeline
        ? prisma.jobApplication.findMany({
            take: 200,
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              role: true,
              company: true,
              status: true,
              appliedAt: true,
              createdAt: true,
              curatedJob: { select: { location: true } },
            },
          }).then((rows) =>
            rows.map((r) => ({
              id: r.id,
              role: r.role,
              company: r.company,
              location: r.curatedJob?.location ?? null,
              appliedAt: r.appliedAt,
              createdAt: r.createdAt,
              status: r.status,
            })),
          )
        : Promise.resolve(pipelineRows),
    ]);

    if (profileResult.status === 'fulfilled') {
      const profile = profileResult.value;
      if (profile?.dob) {
        ageGroup = getAgeGroup(profile.dob);
      }
      profileCity = profile?.city?.trim() || null;
      profileState = profile?.state?.trim() || null;
      externalSearch = buildExternalJobSearchQuery({
        careerRecommendation: (profile?.user?.careerRecommendationJson ?? null) as CareerMatchResult | null,
        programSlug: profile?.user?.courseEnrollments[0]?.programSlug ?? profile?.user?.enrolledProgram ?? null,
      });
    } else {
      ageGroup = 'adult18plus';
    }

    if (appliedResult.status === 'fulfilled') {
      appliedJobIds = appliedResult.value
        .map((a) => a.curatedJobId)
        .filter((id): id is string => id !== null);
    } /* non-critical — badge just will not show */

    pipelineLoadFailed = needsPipeline && pipelineResult.status === 'rejected';
    pipelineRows = pipelineResult.status === 'fulfilled' ? pipelineResult.value : [];
  }

  const primaryLocation = [profileCity, profileState].filter(Boolean).join(', ') || 'Austin, TX';
  const quickLocations = [
    primaryLocation,
    'Austin, TX',
    'Round Rock, TX',
    'Cedar Park, TX',
    'Pflugerville, TX',
  ].filter((location, index, arr) => arr.indexOf(location) === index);
  const externalBoards = buildExternalJobBoards({ query: externalSearch.query, location: primaryLocation });

  // SSR: Prefetch first 20 jobs for SEO and faster initial load
  let initialJobs: Array<{
    id: string;
    title: string;
    location: string | null;
    locationType: string;
    jobType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    employer: { companyName: string; logoUrl: string | null };
  }> = [];
  let initialTotal = 0;

  try {
    const jobs = await prisma.job.findMany({
      where: {
        status: 'live',
        AND: [
          ACTIVE_EMPLOYER_JOB_WHERE,
          ...(ageGroup === 'under14' ? [{ id: 'impossible-match' }] : []),
          ...(ageGroup === 'youth14to17' ? [{
            youthAppropriate: true,
            OR: [
              { minimumAge: null },
              { minimumAge: { lte: 17 } },
            ],
          }] : []),
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        employer: { select: { companyName: true, logoUrl: true } },
      },
    });
    const visible = jobs
      .filter(
        (j) => !isExcludedPublicEmployerName(j.employer.companyName) && !isExcludedPublicJobTitle(j.title),
      )
      .map((job) => ({
        ...job,
        employer: {
          ...job.employer,
          logoUrl: resolveSupabasePublicAssetUrl('employer-logos', job.employer.logoUrl),
        },
      }));
    initialJobs = visible;
    initialTotal = visible.length;
  } catch {
    // Fallback to empty state if query fails
    initialJobs = [];
    initialTotal = 0;
  }

  // ── v2 KIT is the DEFAULT member job-pipeline view (real data); legacy
  // public board stays reachable via ?ui=legacy. This board is public, so the
  // pipeline kit only renders for a signed-in member — anonymous visitors fall
  // through to the legacy public board below (preserving the current default).
  if (needsPipeline) {
    // `pipelineRows` was already fetched above (in parallel with the
    // profile + applied-IDs reads) since `needsPipeline` is known purely
    // from `requestedUi`/`user`, before any DB round trip.
    const savedCount = pipelineRows.filter((r) => r.status === 'SAVED').length;
    const appliedCount = pipelineRows.filter((r) =>
      r.status === 'APPLIED' || r.status === 'PHONE_SCREEN',
    ).length;
    const interviewingCount = pipelineRows.filter((r) => r.status === 'INTERVIEWING').length;
    const offersCount = pipelineRows.filter((r) =>
      r.status === 'OFFER' || r.status === 'ACCEPTED',
    ).length;

    // Map the JobApplicationStatus enum to the kit's stage label + tone.
    const STAGE_META: Record<
      typeof pipelineRows[number]['status'],
      { label: string; tone: 'ok' | 'warn' | 'alert' | 'info' | 'muted' }
    > = {
      SAVED: { label: 'Saved', tone: 'muted' },
      APPLIED: { label: 'Applied', tone: 'muted' },
      PHONE_SCREEN: { label: 'Screening', tone: 'info' },
      INTERVIEWING: { label: 'Interviewing', tone: 'warn' },
      OFFER: { label: 'Offer', tone: 'ok' },
      ACCEPTED: { label: 'Accepted', tone: 'ok' },
      REJECTED: { label: 'Closed', tone: 'alert' },
    };
    const fmtDay = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // "N active applications" is the same definition the home tile uses
    // (ACTIVE_APPLICATION_STATUSES) and is counted on every row, never on the
    // 20-row table below.
    const activeApplicationCount = pipelineRows.filter((r) => isActiveApplicationStatus(r.status)).length;
    // Pipeline table excludes pure "saved" rows (those feed the Saved KPI only).
    const applications = pipelineRows
      .filter((r) => r.status !== 'SAVED')
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        role: r.role,
        company: r.company,
        location: displayJobLocation(r.location),
        applied: fmtDay(r.appliedAt ?? r.createdAt),
        stage: STAGE_META[r.status].label,
        tone: STAGE_META[r.status].tone,
      }));

    // "Recommended for you" — prefer the member's real computed AIJobMatch
    // scores (already run by the admin/employer match pipeline) over the
    // generic "newest live jobs" fallback, so the % badge reflects an actual
    // score instead of a fabricated "New" label.
    let recommendationLoadFailed = false;
    const aiMatches = await prisma.aIJobMatch.findMany({
      where: {
        studentId: user!.id,
        job: {
          status: 'live',
          AND: [ACTIVE_EMPLOYER_JOB_WHERE],
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
      },
      orderBy: { matchScore: 'desc' },
      take: 3,
      select: {
        matchScore: true,
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            salaryMin: true,
            salaryMax: true,
            employer: { select: { companyName: true } },
          },
        },
      },
    }).catch((err: unknown) => {
      recommendationLoadFailed = true;
      console.error('[dashboard/jobs] recommendations unavailable', err);
      return [];
    });

    const formatSalary = (min: number | null, max: number | null) =>
      min && max ? `$${Math.round(min / 1000)}k–${Math.round(max / 1000)}k` : null;

    const recommended = aiMatches.map((m) => ({
      id: m.job.id,
      logo: (m.job.employer.companyName || '?').slice(0, 2).toUpperCase(),
      match: `${m.matchScore}% match`,
      title: m.job.title,
      meta: [m.job.employer.companyName, m.job.location, formatSalary(m.job.salaryMin, m.job.salaryMax)]
        .filter(Boolean)
        .join(' · '),
    }));

    // Live openings (already fetched above for the public board) listed under
    // the pipeline so the member can reach a job from the job board (audit 7b).
    const appliedSet = new Set(appliedJobIds);
    const LOCATION_TYPE_LABEL: Record<string, string> = {
      remote: 'Remote',
      hybrid: 'Hybrid',
      onsite: 'On-site',
    };
    const openRoles: OpenRoleRow[] = initialJobs.map((job) => ({
      id: job.id,
      title: job.title,
      logo: (job.employer.companyName || '?').slice(0, 2).toUpperCase(),
      applied: appliedSet.has(job.id),
      meta: [
        job.employer.companyName,
        job.location?.trim() ? displayJobLocation(job.location) : LOCATION_TYPE_LABEL[job.locationType] ?? null,
        formatJobSalaryRange(job.salaryMin, job.salaryMax),
      ]
        .filter(Boolean)
        .join(' · '),
    }));

    return (
      <div
        data-portal-error-state={
          pipelineLoadFailed
            ? 'member-jobs-pipeline-load'
            : recommendationLoadFailed
              ? 'member-jobs-recommendations-load'
              : undefined
        }
      >
        <MemberJobsKit
        saved={savedCount}
        applied={appliedCount}
        interviewing={interviewingCount}
        offers={offersCount}
        syncedLabel={`${activeApplicationCount} active application${activeApplicationCount === 1 ? '' : 's'}`}
        browseHref={JOBS_OPEN_ROLES_ANCHOR}
        profileHref="/dashboard/profile"
        // Pass the member's REAL rows (DataTable renders its own empty state).
        applications={applications}
        recommended={recommended}
        openRoles={openRoles}
        openRolesTotal={initialTotal}
        />
      </div>
    );
  }

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Job search"
          title={t('jobBoard')}
          lede={t('jobBoardSubtitle')}
          icon={<Briefcase size={13} aria-hidden="true" />}
        />
        {user ? (
          <div
            className="wa-kit-card"
            style={{
              background: 'var(--wa-accent-soft)',
              borderLeft: '3px solid var(--wa-accent)',
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--wa-accent)',
                margin: '0 0 6px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              {t('certificatesThatOpenDoors')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {t('certificatesDescription')}
            </p>
            <div className="wa-flex wa-flex-wrap wa-items-center" style={{ gap: 8 }}>
              {[
                'Google IT Support',
                'CompTIA A+',
                'AWS Cloud Practitioner',
                'Google Project Management',
                'IBM Data Analyst',
              ].map((cert) => (
                <a
                  key={cert}
                  href="/dashboard/certifications"
                  className="wa-kit-focus"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 32,
                    padding: '4px 12px',
                    background: 'var(--wa-surface)',
                    border: '1px solid var(--wa-border)',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--wa-accent)',
                    textDecoration: 'none',
                  }}
                >
                  {cert}
                </a>
              ))}
              <a
                href="/dashboard/certifications"
                className="wa-kit-focus"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--wa-muted)',
                  textDecoration: 'none',
                }}
              >
                {t('viewAllCerts')} →
              </a>
            </div>
          </div>
        ) : null}

        {user ? (
          <div
            className="wa-kit-card wa-flex wa-flex-col sm:wa-flex-row sm:wa-items-center"
            style={{ gap: 16 }}
          >
            <div style={{ flex: 1, minWidth: '14rem' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--wa-text)', margin: '0 0 4px' }}>
                {t('alreadyAppliedQuestion')}
              </p>
              <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0, lineHeight: 1.45 }}>
                {t('logApplicationHere')}
              </p>
            </div>
            <LogExternalApplicationButton variant="primary" />
          </div>
        ) : null}

        <div className="wa-kit-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 4px' }}>
            {t('searchBeyondBoard')}
          </p>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>
            {user && profileCity
              ? `Using your profile location: ${primaryLocation}.`
              : 'If no city is saved yet, start with Austin metro and nearby suburbs.'}
          </p>
          {externalSearch.source !== 'default' ? (
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }} data-external-search-source={externalSearch.source}>
              {`Links below search for "${externalSearch.query}" from your ${externalSearch.source === 'occupation' ? 'career match' : 'program'}.`}
            </p>
          ) : null}
          {user ? (
            <p style={{ fontSize: 13, margin: '6px 0 0' }}>
              <a
                href="/dashboard/profile"
                className="wa-kit-focus"
                style={{ color: 'var(--wa-accent)', fontWeight: 600, textDecoration: 'none' }}
              >
                {t('updateProfileLocation')} →
              </a>
            </p>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {externalBoards.map((engine) => (
              <a
                key={engine.label}
                href={engine.href}
                target="_blank"
                rel="noopener noreferrer"
                className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 4px' }}>
                  {engine.label} ↗
                </p>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--wa-accent)',
                    margin: '0 0 4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Best for: {engine.bestFor}
                </p>
                <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0, lineHeight: 1.45 }}>
                  {engine.note}
                </p>
              </a>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--wa-border)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 8px' }}>
              {t('quickAustinPresets')}
            </p>
            <div className="wa-flex wa-flex-wrap" style={{ gap: 8, marginBottom: 14 }}>
              {quickLocations.map((location) => (
                <a
                  key={location}
                  href={`https://www.indeed.com/jobs?${new URLSearchParams({ q: 'jobs', l: location }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-kit-focus"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 36,
                    padding: '6px 12px',
                    border: '1px solid var(--wa-border)',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--wa-accent)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    background: 'var(--wa-surface)',
                  }}
                >
                  {location.replace(', TX', '')} ↗
                </a>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 6px' }}>
              {t('bestRoutineForMembers')}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--wa-muted)', lineHeight: 1.45 }}>
              {t('bestRoutineDescription')}
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--wa-muted)', fontSize: 13, lineHeight: 1.5 }}>
              <li>{t('checkIndeedLinkedIn')}</li>
              <li>{t('useWorkInTexas')}</li>
              <li>{t('logEveryApplication')}</li>
            </ul>
          </div>
        </div>

        {!user ? (
          <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--wa-text)', margin: 0 }}>
            <strong>{t('applyingIsForMembers')}</strong>{' '}
            <a
              href="/login?redirectTo=/dashboard/jobs"
              className="wa-kit-focus"
              style={{ color: 'var(--wa-accent)', fontWeight: 600 }}
            >
              {t('logIn')}
            </a>{' '}
            {t('or')}{' '}
            <a href="/apply" className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
              {t('startApplication')}
            </a>{' '}
            {t('toSubmitProfile')}
          </p>
        ) : null}
        {ageGroup === 'under14' ? (
          <div className="wa-kit-card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
              {t('careerExplorationYoung')}
            </h3>
            <p style={{ color: 'var(--wa-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
              {t('careerExplorationYoungDesc')}
            </p>
            <a
              href="/programs"
              className="wa-kit-focus"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                padding: '10px 16px',
                background: 'var(--wa-accent)',
                color: 'var(--wa-on-accent-control)',
                fontWeight: 600,
                fontSize: 14,
                borderRadius: 999,
                textDecoration: 'none',
              }}
            >
              {t('exploreTrainingPrograms')}
            </a>
          </div>
        ) : ageGroup === 'youth14to17' ? (
          <>
            <div className="wa-kit-card">
              <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: 'var(--wa-text)' }}>
                <strong>{t('youthJobBoard')}</strong> {t('youthJobBoardDesc')}
              </p>
            </div>
            <Suspense fallback={<JobsBoardSkeleton />}>
              <JobsListingClient
                isAuthenticated={!!user}
                ageGroup={ageGroup}
                initialJobs={initialJobs}
                initialTotal={initialTotal}
                appliedJobIds={appliedJobIds}
              />
            </Suspense>
          </>
        ) : (
          <Suspense fallback={<JobsBoardSkeleton />}>
            <JobsListingClient
              isAuthenticated={!!user}
              ageGroup={ageGroup}
              initialJobs={initialJobs}
              initialTotal={initialTotal}
              appliedJobIds={appliedJobIds}
            />
          </Suspense>
        )}
      </div>
    </DesignSurface>
  );
}
