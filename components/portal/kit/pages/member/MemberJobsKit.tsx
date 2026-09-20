import { Compass } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { DesignSurface, KpiStrip, DataTable, StatusTag, PageOpener, JobListingRow, KitEmptyState, type Column, type KitTone } from '@/components/portal/kit';
import { JOBS_BOARD_EMPTY, JOBS_EMPTY_RECOMMENDATIONS } from '@/lib/member/jobPipelineDisplay';

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
 * `JOBS_BOARD_EMPTY` state, not a hidden section.
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
  saved = 0,
  applied = 0,
  interviewing = 0,
  offers = 0,
  syncedLabel,
  browseHref = JOBS_OPEN_ROLES_ANCHOR,
  profileHref = '/dashboard/profile',
  jobHref = (id: string) => `/dashboard/jobs/${id}`,
  applications = [],
  recommended = [],
  openRoles = [],
  openRolesTotal,
}: MemberJobsKitProps) {
  const openRolesCount = Math.max(openRolesTotal ?? 0, openRoles.length);
  const columns: Column<ApplicationRow>[] = [
    { key: 'role', header: 'Role', render: (r) => <span style={{ fontWeight: 700 }}>{r.role}</span> },
    { key: 'company', header: 'Company', render: (r) => <span className="wa-kit-meta">{r.company}</span> },
    { key: 'location', header: 'Location', render: (r) => <span className="wa-kit-meta">{r.location}</span> },
    { key: 'applied', header: 'Applied', render: (r) => <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.applied}</span> },
    { key: 'stage', header: 'Stage', align: 'right', render: (r) => <StatusTag tone={r.tone}>{r.stage}</StatusTag> },
  ];
  const applicationCard = (row: ApplicationRow) => (
    <div className="wa-kit-card wa-kit-card--sm">
      <div className="wa-flex wa-items-start wa-justify-between wa-gap-3">
        <div>
          <div style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{row.role}</div>
          <div className="wa-kit-meta" style={{ marginTop: 2 }}>{row.company}</div>
          <div className="wa-kit-meta" style={{ marginTop: 2 }}>
            {row.location} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.applied}</span>
          </div>
        </div>
        <StatusTag tone={row.tone}>{row.stage}</StatusTag>
      </div>
    </div>
  );

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Job search"
          title="Job board"
          lede="Applications, matches, next interviews."
          icon={<Compass size={13} aria-hidden="true" />}
        />
        <KpiStrip
          items={[
            { label: 'Saved', value: saved },
            { label: 'Applied', value: applied },
            { label: 'Interviewing', value: interviewing },
            { label: 'Offers', value: offers },
          ]}
        />

        <div className="wa-kit-card">
          <div className="wa-flex wa-flex-col md:wa-flex-row md:wa-items-center wa-justify-between wa-gap-3" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>Applications</h2>
              {syncedLabel ? <p className="wa-kit-meta">{syncedLabel}</p> : null}
            </div>
            {applications.length > 0 ? <JobsCta href={browseHref}>Browse openings</JobsCta> : null}
          </div>
          {applications.length === 0 ? (
            <KitEmptyState
              title="No applications yet"
              description="Track jobs you apply to. They appear here."
              action={<JobsCta href={browseHref}>Browse openings</JobsCta>}
            />
          ) : (
            <DataTable<ApplicationRow>
              columns={columns}
              rows={applications}
              rowKey={(r) => r.id}
              mobile="cards"
              cardRender={applicationCard}
              minWidth={560}
              emptyTitle="No applications yet"
              emptyDescription="Track jobs you apply to. They appear here."
            />
          )}
        </div>

        <section id="open-roles" aria-labelledby="open-roles-heading" style={{ scrollMarginTop: 96 }}>
          <div className="wa-flex wa-items-end wa-justify-between wa-gap-3 wa-flex-wrap" style={{ marginBottom: 16 }}>
            <h2 id="open-roles-heading" style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>
              Open roles
            </h2>
            {openRolesCount > 0 ? (
              <p className="wa-kit-meta" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {openRolesCount} live opening{openRolesCount === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
          {openRoles.length === 0 ? (
            <div className="wa-kit-card">
              <KitEmptyState
                title={JOBS_BOARD_EMPTY.title}
                description={JOBS_BOARD_EMPTY.description}
                action={
                  <div className="wa-flex wa-flex-wrap wa-gap-2">
                    <JobsCta href={JOBS_BOARD_EMPTY.primaryHref}>{JOBS_BOARD_EMPTY.primaryCta}</JobsCta>
                    <JobsCta href={JOBS_BOARD_EMPTY.secondaryHref} variant="secondary">
                      {JOBS_BOARD_EMPTY.secondaryCta}
                    </JobsCta>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }} data-testid="open-roles-list">
              {openRoles.map((job, i) => (
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
        </section>

        <div>
          <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 16 }}>Recommended</h2>
          {recommended.length === 0 ? (
            <div className="wa-kit-card">
              <KitEmptyState
                title={JOBS_EMPTY_RECOMMENDATIONS.title}
                description={JOBS_EMPTY_RECOMMENDATIONS.description}
                action={
                  <div className="wa-flex wa-flex-wrap wa-gap-2">
                    <JobsCta href={profileHref}>{JOBS_EMPTY_RECOMMENDATIONS.primaryCta}</JobsCta>
                    {applications.length === 0 ? (
                      <JobsCta href={browseHref} variant="secondary">
                        {JOBS_EMPTY_RECOMMENDATIONS.secondaryCta}
                      </JobsCta>
                    ) : null}
                  </div>
                }
              />
            </div>
          ) : (
            <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
              {recommended.map((job, i) => (
                <JobListingRow
                  key={job.id}
                  href={jobHref(job.id)}
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
        </div>
      </div>
    </DesignSurface>
  );
}
