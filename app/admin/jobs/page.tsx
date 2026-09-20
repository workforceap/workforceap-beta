import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import {
  resolveAdminPageTenant,
  withAdminPageScope,
  type AdminPageTenant,
} from '@/lib/tenant/adminPageScope';
import type { JobStatusEnum } from '@prisma/client';
import AdminJobsFilterTabs from '@/components/admin/AdminJobsFilterTabs';
import JobsTableClient from '@/components/admin/JobsTableClient';
import PageHeader from '@/components/portal/PageHeader';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { captureApiError } from '@/lib/observability/captureApiError';
import { statusColor } from '@/lib/ui/statusColors';
import { DesignSurface } from '@/components/portal/kit';
import {
  JobsBoardKit,
  type JobRow,
  type JobDisplayStatus,
} from '@/components/portal/kit/pages/admin-subviews/JobsBoardKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin - Jobs',
  description: 'Manage employer job postings.',
  path: '/admin/jobs',
});
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  live: 'Live',
  filled: 'Filled',
  closed: 'Closed',
};

/** Human label for the ?filter= queue value shown on the mobile job cards. */
const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  pending: 'Pending',
  live: 'Live',
  draft: 'Draft',
  filled: 'Filled / Closed',
  approved: 'Approved',
};

function getJobStatusPillClass(status: string): string {
  if (status === 'live') return 'admin-job-status-pill admin-job-status-pill--live';
  if (status === 'pending') return 'admin-job-status-pill admin-job-status-pill--pending';
  if (status === 'draft') return 'admin-job-status-pill admin-job-status-pill--draft';
  if (status === 'approved') return 'admin-job-status-pill admin-job-status-pill--approved';
  if (status === 'filled') return 'admin-job-status-pill admin-job-status-pill--filled';
  if (status === 'closed') return 'admin-job-status-pill admin-job-status-pill--closed';
  return 'admin-job-status-pill';
}

/** Whole days between `date` and now — used for the pending-review SLA badge. */
function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Green < 3 days, amber 3-7, red 7+ — matches the dormant-employer thresholds
 * elsewhere in admin. Sourced from lib/ui/statusColors (the single source of
 * truth for semantic status colors) rather than a one-off rgba palette.
 */
function pendingAgeBadgeStyle(days: number): { background: string; color: string } {
  const tone = days < 3 ? statusColor('success') : days <= 7 ? statusColor('warning') : statusColor('danger');
  return { background: tone.bg, color: tone.fg };
}

/** Cap the lean board so first paint stays cheap. */
const BOARD_LIMIT = 50;

/** Map the JobStatusEnum onto the kit's display status (mockup: live → "Open"). */
const DISPLAY_STATUS: Record<string, JobDisplayStatus> = {
  live: 'Open',
  approved: 'Open',
  pending: 'Pending',
  draft: 'Draft',
  filled: 'Filled',
  closed: 'Closed',
};

/** "$72–88k" / "$72k" / "—" from salary min/max (thousands, en-dash range). */
function formatWage(min: number | null, max: number | null): string {
  const k = (n: number) => (n % 1000 === 0 ? `${n / 1000}k` : `${Math.round(n / 1000)}k`);
  if (min != null && max != null) {
    return min === max ? `$${k(min)}` : `$${k(min)}–${k(max)}`;
  }
  if (min != null) return `$${k(min)}+`;
  if (max != null) return `Up to $${k(max)}`;
  return '—';
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; ui?: string; page?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/jobs');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { filter, ui, page } = await searchParams;
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  // --- DEFAULT: design-kit jobs board wired into real (lean) job data ---
  if (ui !== 'legacy') {
    return renderKit({ actorUserId: user.id, scope, readOnlyAudit });
  }

  // --- LEGACY (?ui=legacy): the proven review-queue workspace, unchanged ---
  return renderLegacy({ filter, page, actorUserId: user.id, scope, readOnlyAudit });
}

/** Design-kit default: dense roster of open roles → <JobsBoardKit/>. */
async function renderKit({
  actorUserId,
  scope,
  readOnlyAudit,
}: {
  actorUserId: string;
  scope: Extract<AdminPageTenant, { ok: true }>;
  readOnlyAudit: boolean;
}) {
  // Open roles = live + approved (publicly visible/active postings). Lean board
  // page + count + distinct-employer count, all in parallel; aggregate failures
  // degrade gracefully (the table must still render).
  const openWhere = { status: { in: ['live', 'approved'] as JobStatusEnum[] } };

  const [jobsResult, openCountResult, employerGroupResult] = await withAdminPageScope(scope, (db) =>
    Promise.allSettled([
      db.job.findMany({
        where: openWhere,
        take: BOARD_LIMIT,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          location: true,
          salaryMin: true,
          salaryMax: true,
          status: true,
          employer: { select: { companyName: true } },
          _count: { select: { applications: true } },
        },
      }),
      db.job.count({ where: openWhere }),
      db.job.groupBy({ by: ['employerId'], where: openWhere }),
    ]),
  );

  // If the core query fails, fall back to the proven legacy workspace rather
  // than rendering a fabricated/empty kit.
  if (jobsResult.status === 'rejected') {
    captureApiError(jobsResult.reason, { route: 'admin/jobs', extra: { view: 'kit' } });
    redirect('/admin/jobs?ui=legacy');
  }

  const jobRows: JobRow[] = jobsResult.value.map((j) => ({
    id: j.id,
    role: j.title,
    employer: j.employer?.companyName ?? 'Unknown employer',
    location: j.location?.trim() || '—',
    wage: formatWage(j.salaryMin, j.salaryMax),
    applicants: j._count?.applications ?? 0,
    status: DISPLAY_STATUS[j.status] ?? 'Open',
  }));

  const openRoles =
    openCountResult.status === 'fulfilled' ? openCountResult.value : jobRows.length;
  const employers =
    employerGroupResult.status === 'fulfilled'
      ? employerGroupResult.value.length
      : new Set(jobsResult.value.map((j) => j.employer?.companyName)).size;

  if (!readOnlyAudit) {
    void recordWorkflowDiagnostic({
      workflow: 'admin_review_queue',
      status: 'inspection',
      actorUserId,
      summary: `Admin opened jobs board (kit)`,
      method: 'page_load',
      metadata: { view: 'kit', openRoles, employers, shown: jobRows.length },
    }).catch(() => {});
  }

  return (
    <DesignSurface surface="dense">
      <JobsBoardKit jobs={jobRows} openRoles={openRoles} employers={employers} />
    </DesignSurface>
  );
}

/** Legacy review-queue workspace (preserved behind ?ui=legacy). */
async function renderLegacy({
  filter,
  page,
  actorUserId,
  scope,
  readOnlyAudit,
}: {
  filter?: string;
  page?: string;
  actorUserId: string;
  scope: Extract<AdminPageTenant, { ok: true }>;
  readOnlyAudit: boolean;
}) {
  const currentFilter = filter && ['all', 'pending', 'live', 'draft', 'filled', 'approved'].includes(filter)
    ? filter
    : 'pending';

  const pageParam = page ? parseInt(page, 10) : 1;
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = 50;

  const where: { status?: object } = {};
  if (currentFilter === 'pending') where.status = { in: ['pending'] };
  else if (currentFilter === 'live') where.status = { in: ['live'] };
  else if (currentFilter === 'filled') where.status = { in: ['filled', 'closed'] };
  else if (currentFilter === 'draft') where.status = { in: ['draft'] };
  else if (currentFilter === 'approved') where.status = { in: ['approved'] };

  let jobs: any[] = [];
  let totalCount = 0;
  let totalJobsInDb = 0;
  const countByStatus: Record<string, number> = {};
  let tabs: any[] = [];

  // Pending jobs are a review-SLA queue: oldest submission first so nothing
  // silently ages past the others. Every other filter keeps the existing
  // most-recently-touched-first order. updatedAt is the closest proxy for
  // "submitted" — the employer PATCH that flips draft/closed → pending is
  // what bumps it, and pending jobs are rarely edited again before review.
  const jobsOrderBy = currentFilter === 'pending' ? { updatedAt: 'asc' as const } : { updatedAt: 'desc' as const };

  try {
    [jobs, totalCount] = await withAdminPageScope(scope, (db) =>
      Promise.all([
        db.job.findMany({
          where,
          orderBy: jobsOrderBy,
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
          include: {
            employer: { select: { companyName: true, contactEmail: true } },
            _count: { select: { applications: true } },
          },
        }),
        db.job.count({ where }),
      ]),
    );

    const allCounts = await withAdminPageScope(scope, (db) =>
      db.job.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    );

    for (const r of allCounts) {
      if (r.status == null) continue;
      if (r.status === 'filled' || r.status === 'closed') {
        countByStatus['filled'] = (countByStatus['filled'] ?? 0) + r._count.id;
      } else {
        countByStatus[r.status] = r._count.id;
      }
    }

    totalJobsInDb = Object.values(countByStatus).reduce((a, b) => a + b, 0);

    tabs = [
      { value: 'pending', label: 'Pending', count: countByStatus['pending'] ?? 0 },
      { value: 'all', label: 'All', count: totalJobsInDb },
      { value: 'live', label: 'Live', count: countByStatus['live'] ?? 0 },
      { value: 'draft', label: 'Draft', count: countByStatus['draft'] ?? 0 },
      { value: 'filled', label: 'Filled / Closed', count: countByStatus['filled'] ?? 0 },
    ];

    if (!readOnlyAudit) {
      await recordWorkflowDiagnostic({
        workflow: 'admin_review_queue',
        status: 'inspection',
        actorUserId,
        summary: `Admin opened jobs review queue (${currentFilter})`,
        method: 'page_load',
        metadata: { filter: currentFilter, queueCount: jobs.length },
      });
    }
  } catch (error) {
    captureApiError(error, { route: 'admin/jobs' });
    return (
      <div>
        <PageHeader title="Jobs" subtitle="Employer submits → Admin reviews → Approve/Reject → Live. Manage job postings." />
        <div
          data-portal-error-state="admin-jobs-load"
          role="alert"
          style={{
            margin: '1.5rem',
            padding: '1.25rem 1.5rem',
            borderRadius: '0.75rem',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid #b91c1c',
            color: '#b91c1c',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Error loading jobs</h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
            The query failed and the list above is empty as a result. Sentry has been notified.
            Refresh the page or check server logs if this persists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Jobs" subtitle="Employer submits → Admin reviews → Approve or reject, then publish roles live." />

      <AdminJobsFilterTabs currentFilter={currentFilter} tabs={tabs} />

      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.75rem' }}>
        {jobs.map((job) => (
          <div
            key={job.id}
            className="portal-card portal-card--flat"
            style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <Link href={`/admin/jobs/${job.id}`} style={{ fontWeight: 700, color: 'var(--color-accent)', textDecoration: 'none' }}>
                  {job.title}
                </Link>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                  {job.employer?.companyName ?? 'Unknown company'}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                <span className={getJobStatusPillClass(job.status)}>
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                {job.status === 'pending' && (
                  <span
                    style={{
                      ...pendingAgeBadgeStyle(daysSince(job.updatedAt)),
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {daysSince(job.updatedAt)}d pending
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Applications
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1rem', fontWeight: 700 }}>{job._count?.applications ?? 0}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Queue
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem', color: 'var(--color-on-surface)' }}>
                  {FILTER_LABELS[currentFilter] ?? currentFilter}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link href={`/admin/jobs/${job.id}`} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                Review job
              </Link>
              <Link href={`/admin/jobs/${job.id}#matches`} className="btn btn-outline" style={{ justifyContent: 'center' }}>
                View AI matches
              </Link>
            </div>
          </div>
        ))}
      </div>

      <JobsTableClient jobs={jobs} totalCount={totalCount} currentPage={currentPage} pageSize={pageSize} />

      {jobs.length === 0 && (
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '1rem' }}>
          {totalJobsInDb === 0 ? (
            'No jobs yet.'
          ) : (
            <>
              No jobs in this view ({currentFilter}).{' '}
              <Link href="/admin/jobs?filter=all" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                Show all ({totalJobsInDb})
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
