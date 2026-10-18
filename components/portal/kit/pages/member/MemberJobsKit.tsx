import { Compass } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DesignSurface, KpiStrip, DataTable, StatusTag, PageOpener, JobListingRow, KitEmptyState, ProgressBar, type Column, type KitTone } from '@/components/portal/kit';
import type { AssignedCounselor } from '@/lib/member/counselorContext';
import { JOBS_BOARD_EMPTY } from '@/lib/member/jobPipelineDisplay';

/**
 * Member Portal — JOB PIPELINE view.
 * Faithful port of `data-view-panel="jobs"` in
 * docs/mockups/workforceap-member-suite.html.
 * Recommended matches use JobListingRow so pipeline, board, and listing share one row.
 *
 * The live open-roles list renders here too (`#open-roles`, JobListingRow →
 * `/dashboard/jobs/<id>`), so the page is never a dead end: "Browse openings"
 * and "Browse jobs" jump to that list instead of round-tripping through
 * `?ui=legacy` (member audit 7b). An empty list is the honest
 * `empty.openings` unavailable state (copy in messages/*.json, hrefs in
 * `JOBS_BOARD_EMPTY`), not a hidden section.
 *
 * Defaults are empty. Proofs and the live route pass real rows — never invent
 * a Deloitte/Accenture pipeline when the caller omits data.
 *
 * Target route: app/(portal)/dashboard/jobs
 * Surface: warm (member-facing).
 */

/** In-page anchor for the live open-roles list; the default `browseHref`. */
export const JOBS_OPEN_ROLES_ANCHOR = '#open-roles';

interface ApplicationRow {
  id: string;
  role: string;
  company: string;
  location: string;
  applied: string;
  stage: string;
  tone: KitTone;
}

interface RecommendedJob {
  id: string;
  logo: string;
  match: string;
  title: string;
  meta: string;
  skills?: readonly string[];
}

/** One live opening on the board (`Job.status = 'live'`, not expired). */
export interface OpenRoleRow {
  id: string;
  title: string;
  /** Company · location · salary (already joined). */
  meta: string;
  /** Employer initials for the row tile; falls back to the briefcase icon. */
  logo?: string;
  /** The member already applied to this role (non-SAVED application on file). */
  applied?: boolean;
}

export interface MemberJobsKitProps {
  saved?: number;
  applied?: number;
  interviewing?: number;
  offers?: number;
  syncedLabel?: string;
  /** Where "Browse openings" / "Browse jobs" go. Defaults to the in-page open-roles list. */
  browseHref?: string;
  profileHref?: string;
  /** Match-row destination. Proofs pass a hash so they stay on /dev/member. */
  jobHref?: (jobId: string) => string;
  applications?: ApplicationRow[];
  recommended?: RecommendedJob[];
  /** Live openings to list under the pipeline; each links through `jobHref`. */
  openRoles?: OpenRoleRow[];
  /** Total live openings when more exist than are listed. */
  openRolesTotal?: number;
  /** Present in the current kit's all-openings view; overview callers omit it. */
  openRolesPagination?: { page: number; pageSize: number; totalPages: number };
  /**
   * A load failed (WAP-261): the section shows "couldn't load", never 0 or
   * its empty state, because an unknown count is not an empty one.
   * `retryHref` is where "Try again" goes (the page itself).
   */
  pipelineLoadFailed?: boolean;
  openRolesLoadFailed?: boolean;
  recommendationsLoadFailed?: boolean;
  retryHref?: string;
  programTitle?: string;
  advisor?: AssignedCounselor | null;
  scorerHref?: string;
  profileMatchPct?: number;
}

function JobsCta({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const ghost = variant === 'secondary';
  return (
    <NextLink
      href={href}
      className={`wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none${ghost ? ' wa-kit-cta--ghost' : ''}`}
    >
      {children}
    </NextLink>
  );
}

export function MemberJobsKit({
  saved: _saved = 0,
  applied = 0,
  interviewing = 0,
  syncedLabel,
  browseHref = JOBS_OPEN_ROLES_ANCHOR,
  profileHref = '/dashboard/profile',
  jobHref = (id: string) => `/dashboard/jobs/${id}`,
  applications = [],
  recommended = [],
  openRoles = [],
  openRolesTotal,
  openRolesPagination,
  pipelineLoadFailed = false,
  openRolesLoadFailed = false,
  recommendationsLoadFailed = false,
  retryHref = '/dashboard/jobs',
  programTitle,
  advisor = null,
  scorerHref = '/dashboard/ai-tools/job-match-scorer',
  profileMatchPct,
}: MemberJobsKitProps) {
  const t = useTranslations('empty');
  const tj = useTranslations('dashboard.jobsC');
  const openRolesCount = Math.max(openRolesTotal ?? recommended.length, openRoles.length, recommended.length);
  const columns: Column<ApplicationRow>[] = [
    { key: 'role', header: 'Role', render: (r) => <span style={{ fontWeight: 700 }}>{r.role}</span> },
    { key: 'company', header: 'Company', render: (r) => <span className="wa-kit-meta">{r.company}</span> },
    { key: 'location', header: 'Location', render: (r) => <span className="wa-kit-meta">{r.location}</span> },
    { key: 'applied', header: 'Applied', render: (r) => <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.applied}</span> },
    { key: 'stage', header: 'Stage', align: 'right', render: (r) => <StatusTag tone={r.tone}>{r.stage}</StatusTag> },
  ];
  const applicationCard = (row: ApplicationRow) => (
    <div className="wa-kit-card wa-kit-card--sm">
      {/* Phones: stack the stage tag under the role. Side by side, the nowrap
          tag took ~104px of the 226px row and squeezed the role column to
          110px, wrapping every title onto 2-3 lines and breaking the applied
          date across lines ("Jun" / "12"). Row layout returns at >=768px. */}
      <div className="wa-flex wa-flex-col wa-items-start wa-gap-2 md:wa-flex-row md:wa-flex-wrap md:wa-justify-between md:wa-gap-3">
        <div style={{ minWidth: 0, flex: '1 1 12rem' }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
          <div className="wa-kit-meta" style={{ marginTop: 2 }}>{row.company}</div>
          <div className="wa-kit-meta" style={{ marginTop: 2 }}>
            {row.location} · <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.applied}</span>
          </div>
        </div>
        <StatusTag tone={row.tone}>{row.stage}</StatusTag>
      </div>
    </div>
  );

  const recommendedIds = new Set(recommended.map((job) => job.id));
  const uniqueOpenRoles = openRoles.filter((job) => !recommendedIds.has(job.id));
  const highMatches = recommended.filter((job) => Number.parseInt(job.match, 10) >= 85).length;
  const best = recommended[0];
  const remaining = Math.max(0, openRolesCount - recommended.length - uniqueOpenRoles.length);
  const employerCount = new Set(
    recommended
      .map((job) => job.meta.split('·')[0]?.trim())
      .filter((name): name is string => Boolean(name)),
  ).size;
  const interviewingCount = applications.filter((row) => row.tone === 'warn').length;
  const screeningCount = applications.filter((row) => row.tone === 'info').length;
  const appliedCount = applications.filter((row) => row.tone === 'muted' || row.tone === 'ok').length;

  return (
    <DesignSurface surface="warm">
      <div className="wa-dense-page wa-space-y-5">
        <PageOpener
          kicker={tj('kicker')}
          title={programTitle ? tj('claim', { program: programTitle, count: openRolesCount }) : tj('claimGeneric', { count: openRolesCount })}
          lede={tj('lede')}
          icon={<Compass size={13} aria-hidden="true" />}
        />
        <div className="wa-kit-card">
          <KpiStrip
            responsive="member"
            items={
              pipelineLoadFailed
                ? (
                    [
                      [tj('kpiQualified'), '—'],
                      [tj('kpiHighMatches'), '—'],
                      [tj('kpiActiveApps'), '—'],
                      [tj('kpiInterview'), '—'],
                    ] as const
                  ).map(([label, value]) => ({ label, value, delta: t('applicationsUnavailable.kpiCaption'), deltaTone: 'warn' as const }))
                : [
                    {
                      label: tj('kpiQualified'),
                      value: openRolesCount,
                      delta: employerCount > 0 ? tj('kpiQualifiedDelta', { count: employerCount }) : undefined,
                      deltaTone: 'muted' as const,
                    },
                    {
                      label: tj('kpiHighMatches'),
                      value: recommendationsLoadFailed || recommended.length === 0 ? '—' : highMatches,
                    },
                    { label: tj('kpiActiveApps'), value: applied + interviewing, delta: syncedLabel, deltaTone: 'muted' as const },
                    { label: tj('kpiInterview'), value: interviewing },
                  ]
            }
          />
        </div>
        <div className="wa-kit-card wa-flex wa-items-center wa-flex-wrap wa-gap-3">
          <label className="wa-kit-meta" style={{ flex: '1 1 16rem' }}>
            <span className="sr-only">{tj('search')}</span>
            <input type="search" placeholder={tj('search')} className="wa-kit-focus" style={{ width: '100%', minHeight: 44, border: '1px solid var(--wa-control-border)', borderRadius: 999, padding: '0 1rem', background: 'var(--wa-surface)' }} disabled />
          </label>
          <StatusTag tone="muted">{tj('location')}</StatusTag>
          <StatusTag tone="muted">{tj('jobType')}</StatusTag>
          <StatusTag tone="muted">{tj('program')}</StatusTag>
          <span className="wa-kit-meta">{tj('clearFilters')}</span>
          <span className="wa-kit-meta">{tj('sort')}</span>
        </div>

        <div className="wa-dense-grid wa-dense-grid--2-wide-left">
          <div className="wa-space-y-5">
            {best ? (
              <section className="wa-kit-card" aria-labelledby="jobs-best-match-heading">
                <div className="wa-flex wa-items-center wa-justify-between wa-gap-3 wa-flex-wrap">
                  <div className="wa-flex wa-items-center wa-gap-2">
                    <h2 id="jobs-best-match-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tj('bestMatch')}</h2>
                    <StatusTag tone="ok">{tj('topRecommendation')}</StatusTag>
                  </div>
                  <StatusTag tone="muted">{best.match}</StatusTag>
                </div>
                <h3 style={{ margin: '12px 0 4px', fontWeight: 800, fontSize: 'clamp(1.15rem, 2vw, 1.4rem)' }}>{best.title}</h3>
                <p className="wa-kit-lede" style={{ margin: 0 }}>{best.meta}</p>
                <p className="wa-kit-meta" style={{ margin: '10px 0 0', fontWeight: 700 }}>{tj('skillsMatched')}</p>
                {best.skills && best.skills.length > 0 ? (
                  <div className="wa-flex wa-items-center wa-gap-2 wa-flex-wrap" style={{ marginTop: 8 }}>
                    {best.skills.map((skill) => (
                      <StatusTag key={skill} tone="muted">{skill}</StatusTag>
                    ))}
                  </div>
                ) : null}
                <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 16 }}>
                  <JobsCta href={jobHref(best.id)} variant="secondary">{tj('saveRole')}</JobsCta>
                  <JobsCta href={jobHref(best.id)}>{tj('applyNow')}</JobsCta>
                </div>
              </section>
            ) : null}

            <div className="wa-kit-card">
              <div className="wa-flex wa-flex-col md:wa-flex-row md:wa-items-center wa-justify-between wa-gap-3" style={{ marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>{tj('applications')}</h2>
                  {syncedLabel && !pipelineLoadFailed ? <p className="wa-kit-meta">{syncedLabel}</p> : null}
                </div>
                {applications.length > 0 ? <JobsCta href={browseHref}>Browse openings</JobsCta> : null}
              </div>
              {/* The empty state is the card's own branch: the table below only mounts with rows, so it carries no `empty` prop. */}
              {pipelineLoadFailed ? (
                <KitEmptyState
                  kind="unavailable"
                  title={t('applicationsUnavailable.title')}
                  description={t('applicationsUnavailable.body')}
                  primaryAction={{ label: t('applicationsUnavailable.action'), href: retryHref }}
                  data-testid="member-jobs-applications-load-failed"
                />
              ) : applications.length === 0 ? (
                <KitEmptyState
                  kind="first"
                  title={t('applications.title')}
                  description={t('applications.body')}
                  primaryAction={{ label: t('applications.action'), href: browseHref }}
                />
              ) : (
                <DataTable<ApplicationRow>
                  columns={columns}
                  rows={applications}
                  rowKey={(r) => r.id}
                  mobile="cards"
                  cardRender={applicationCard}
                  minWidth={560}
                />
              )}
            </div>

            <section id="open-roles" aria-labelledby="open-roles-heading" style={{ scrollMarginTop: 96 }}>
              <div className="wa-flex wa-items-end wa-justify-between wa-gap-3 wa-flex-wrap" style={{ marginBottom: 16 }}>
                <h2 id="open-roles-heading" style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>
                  {tj('openRoles')}
                </h2>
                {openRolesCount > 0 && !openRolesLoadFailed ? (
                  <p className="wa-kit-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {openRolesCount} live opening{openRolesCount === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>
              {openRolesLoadFailed ? (
                <div className="wa-kit-card">
                  <KitEmptyState
                    kind="unavailable"
                    title={t('openingsUnavailable.title')}
                    description={t('openingsUnavailable.body')}
                    primaryAction={{ label: t('openingsUnavailable.action'), href: retryHref }}
                    data-testid="member-jobs-openings-load-failed"
                  />
                </div>
              ) : openRoles.length === 0 ? (
                <div className="wa-kit-card">
                  <KitEmptyState
                    kind={JOBS_BOARD_EMPTY.kind}
                    title={t('openings.title')}
                    description={t('openings.body')}
                    primaryAction={{ label: t('openings.action'), href: JOBS_BOARD_EMPTY.primaryHref }}
                    secondaryAction={{ label: t('openings.secondary'), href: JOBS_BOARD_EMPTY.secondaryHref }}
                  />
                </div>
              ) : uniqueOpenRoles.length === 0 ? null : (
                <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }} data-testid="open-roles-list">
                  {uniqueOpenRoles.map((job, i) => (
                    <JobListingRow
                      key={job.id}
                      href={jobHref(job.id)}
                      title={job.title}
                      meta={job.meta}
                      applied={job.applied}
                      first={i === 0}
                      icon={
                        job.logo ? (
                          <span className="wa-kit-meta" style={{ fontWeight: 800, letterSpacing: '0.04em', color: 'var(--wa-text)' }}>{job.logo}</span>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
              {!openRolesLoadFailed && openRolesCount > 20 && !openRolesPagination ? (
                <div className="wa-flex wa-justify-end" style={{ marginTop: 'var(--wa-pad-sm)' }}>
                  <JobsCta href={`/dashboard/jobs?view=all${JOBS_OPEN_ROLES_ANCHOR}`} variant="secondary">
                    See all {openRolesCount} openings
                  </JobsCta>
                </div>
              ) : null}
              {!openRolesLoadFailed && openRolesPagination ? (
                <nav aria-label="Open role pages" className="wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-3" style={{ marginTop: 'var(--wa-pad-sm)' }}>
                  <p className="wa-kit-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    Showing {openRoles.length ? (openRolesPagination.page - 1) * openRolesPagination.pageSize + 1 : 0}–{openRoles.length ? (openRolesPagination.page - 1) * openRolesPagination.pageSize + openRoles.length : 0} of {openRolesCount} openings
                  </p>
                  <div className="wa-flex wa-items-center wa-flex-wrap wa-gap-3">
                    {openRolesPagination.page > 1 ? (
                      <JobsCta href={`/dashboard/jobs?view=all&page=${openRolesPagination.page - 1}${JOBS_OPEN_ROLES_ANCHOR}`} variant="secondary">Previous page</JobsCta>
                    ) : null}
                    {openRolesPagination.page < openRolesPagination.totalPages ? (
                      <JobsCta href={`/dashboard/jobs?view=all&page=${openRolesPagination.page + 1}${JOBS_OPEN_ROLES_ANCHOR}`} variant="secondary">Next page</JobsCta>
                    ) : null}
                    <JobsCta href={`/dashboard/jobs${JOBS_OPEN_ROLES_ANCHOR}`} variant="secondary">Back to overview</JobsCta>
                  </div>
                </nav>
              ) : null}
            </section>

            <div>
              <div className="wa-flex wa-items-end wa-justify-between wa-gap-3 wa-flex-wrap" style={{ marginBottom: 16 }}>
                <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>{tj('topMatched')}</h2>
                {recommended.length > 0 ? <span className="wa-kit-meta">{tj('positionsCount', { count: recommended.length })}</span> : null}
              </div>
              {recommendationsLoadFailed ? (
                <div className="wa-kit-card">
                  <KitEmptyState
                    kind="unavailable"
                    title={t('matchesUnavailable.title')}
                    description={t('matchesUnavailable.body')}
                    primaryAction={{ label: t('matchesUnavailable.action'), href: retryHref }}
                    secondaryAction={{ label: t('matchesUnavailable.secondary'), href: browseHref }}
                    data-testid="member-jobs-matches-load-failed"
                  />
                </div>
              ) : recommended.length === 0 ? (
                <div className="wa-kit-card">
                  <KitEmptyState
                    kind="first"
                    title={t('matches.title')}
                    description={t('matches.body')}
                    primaryAction={{ label: t('matches.profile'), href: profileHref }}
                    secondaryAction={applications.length === 0 ? { label: t('matches.browse'), href: browseHref } : undefined}
                  />
                </div>
              ) : (
                <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {recommended.map((job, i) => (
                    <JobListingRow
                      key={job.id}
                      href={jobHref(best && i === 0 ? job.id : job.id)}
                      title={job.title}
                      meta={job.meta}
                      match={job.match}
                      first={i === 0}
                      icon={
                        job.logo ? (
                          <span className="wa-kit-meta" style={{ fontWeight: 800, letterSpacing: '0.04em', color: 'var(--wa-text)' }}>{job.logo}</span>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
              {remaining > 0 && !recommendationsLoadFailed ? (
                <div className="wa-flex wa-justify-end" style={{ marginTop: 'var(--wa-pad-sm)' }}>
                  <JobsCta href={browseHref} variant="secondary">{tj('viewRemaining', { count: remaining })}</JobsCta>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="wa-space-y-5">
            <section className="wa-kit-card" aria-labelledby="jobs-scorer-heading">
              <h2 id="jobs-scorer-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tj('scorerTitle')}</h2>
              <p className="wa-kit-lede" style={{ margin: '8px 0 0' }}>{tj('scorerBody')}</p>
              {typeof profileMatchPct === 'number' ? (
                <div style={{ marginTop: 14 }}>
                  <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{tj('profileMatch')}</p>
                  <ProgressBar pct={profileMatchPct} aria-label={tj('profileMatch')} />
                </div>
              ) : null}
              <div style={{ marginTop: 16 }}>
                <JobsCta href={scorerHref}>{tj('runScorer')}</JobsCta>
              </div>
            </section>
            <section className="wa-kit-card" aria-labelledby="jobs-stages-heading">
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
                <h2 id="jobs-stages-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tj('stagesTitle')}</h2>
                <span className="wa-kit-meta">{tj('trackedRoles', { count: applications.length })}</span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                <li className="wa-flex wa-items-center wa-justify-between">
                  <StatusTag tone="warn">{tj('stageInterviewing')}</StatusTag>
                  <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{pipelineLoadFailed ? '—' : interviewingCount}</span>
                </li>
                <li className="wa-flex wa-items-center wa-justify-between">
                  <StatusTag tone="info">{tj('stageScreening')}</StatusTag>
                  <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{pipelineLoadFailed ? '—' : screeningCount}</span>
                </li>
                <li className="wa-flex wa-items-center wa-justify-between">
                  <StatusTag tone="muted">{tj('stageApplied')}</StatusTag>
                  <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{pipelineLoadFailed ? '—' : appliedCount}</span>
                </li>
              </ul>
            </section>
            {advisor ? (
              <section className="wa-kit-card" aria-labelledby="jobs-advisor-heading">
                <h2 id="jobs-advisor-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tj('advisorReview')}</h2>
                <p className="wa-kit-meta" style={{ margin: '4px 0 0' }}>{tj('withAdvisor', { name: advisor.name })}</p>
                <p className="wa-kit-lede" style={{ margin: '8px 0 0' }}>{tj('advisorReviewBody', { name: advisor.firstName })}</p>
                <div style={{ marginTop: 14 }}>
                  <JobsCta href={advisor.messagingHref} variant="secondary">{tj('messageAdvisor', { name: advisor.firstName })}</JobsCta>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </DesignSurface>
  );
}
