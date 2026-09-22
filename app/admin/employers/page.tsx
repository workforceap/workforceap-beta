import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import {
  inheritJobOrg,
  resolveAdminPageTenant,
  withAdminPageScope,
} from '@/lib/tenant/adminPageScope';
import CreateEmployerAccountClient from './CreateEmployerAccountClient';
import OpenEmployerPortalButton from './OpenEmployerPortalButton';
import ClearEmployerPortalContext from './ClearEmployerPortalContext';
import EmployerStatusButton from './EmployerStatusButton';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import EmployersTableClient from '@/components/admin/EmployersTableClient';
import AdminEmployerTierSelect from './AdminEmployerTierSelect';
import { statusColor } from '@/lib/ui/statusColors';
import { DesignSurface } from '@/components/portal/kit';
import {
  EmployersDirectoryKit,
  type EmployerCard,
} from '@/components/portal/kit/pages/admin-subviews/EmployersDirectoryKit';

function getPartnershipTier(placementAgreementSigned: boolean, hiringPipelineActive: boolean): {
  label: string;
  color: string;
  bg: string;
} {
  if (placementAgreementSigned && hiringPipelineActive) {
    return { label: 'Strategic Hiring Partner', color: 'var(--wa-accent-text)', bg: 'var(--wa-accent-soft)' };
  }
  if (placementAgreementSigned) {
    return { label: 'Hiring Partner', color: '#a47f38', bg: 'rgba(164,127,56,0.14)' };
  }
  if (hiringPipelineActive) {
    return { label: 'Active Pipeline', color: 'var(--wa-success-dark)', bg: 'var(--wa-success-soft)' };
  }
  return { label: 'Standard', color: 'var(--color-on-surface-variant)', bg: 'var(--surface-container)' };
}

function statusBadgeStyle(status: string) {
  if (status === 'active') {
    return { background: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)' };
  }
  if (status === 'pending_approval') {
    return { background: 'var(--wa-gold-soft)', color: 'var(--wa-gold-dark)' };
  }
  return { background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' };
}

function statusLabel(status: string) {
  if (status === 'active') return 'Active';
  if (status === 'pending_approval') return 'Pending';
  return 'Inactive';
}

/** Whole days since a login timestamp, or null if the employer has never logged in. */
function daysSinceLogin(lastLoginAt: Date | null): number | null {
  if (!lastLoginAt) return null;
  return Math.max(0, Math.floor((Date.now() - lastLoginAt.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Dormant-employer visibility: green < 30d, amber 30-90d, red 90d+ or never
 * logged in. Sourced from lib/ui/statusColors (the single source of truth
 * for semantic status colors) instead of a one-off rgba palette.
 */
function lastActiveBadgeStyle(days: number | null) {
  const tone =
    days === null ? statusColor('danger') : days < 30 ? statusColor('success') : days <= 90 ? statusColor('warning') : statusColor('danger');
  return { background: tone.bg, color: tone.fg };
}

function lastActiveLabel(days: number | null): string {
  if (days === null) return 'Never active';
  return `Active ${days}d ago`;
}

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin - Employers',
    description: 'Manage employers.',
    path: '/admin/employers',
  });
}

/** Job statuses that count as an "open role" (live + approved, ready to hire). */
const OPEN_JOB_STATUSES = ['live', 'approved'] as const;
/** Cap the lean directory page so first paint stays cheap. */
const DIRECTORY_LIMIT = 60;

export default async function AdminEmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ui?: string; page?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/employers');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { status: statusFilter, ui: requestedUi, page } = await searchParams;

  // --- DEFAULT: real (lean) employer directory wired into EmployersDirectoryKit ---
  if (requestedUi !== 'legacy') {
    const jobOrg = inheritJobOrg(scope);
    const [
      directoryResult,
      partnerCountResult,
      activeCountResult,
      openRolesGroupResult,
      openRolesTotalResult,
      hiresGroupResult,
      hiresTotalResult,
    ] = await withAdminPageScope(scope, (db) =>
      Promise.allSettled([
        db.employer.findMany({
          take: DIRECTORY_LIMIT,
          orderBy: { companyName: 'asc' },
          select: {
            id: true,
            companyName: true,
            industry: true,
            status: true,
            user: { select: { lastLoginAt: true } },
          },
        }),
        db.employer.count(),
        db.employer.count({ where: { status: 'active' } }),
        // Open roles grouped by employer (for per-card counts on the loaded page).
        db.job.groupBy({
          by: ['employerId'],
          where: { status: { in: [...OPEN_JOB_STATUSES] } },
          _count: { _all: true },
        }),
        // Open roles across ALL employers (real subtitle aggregate).
        db.job.count({ where: { status: { in: [...OPEN_JOB_STATUSES] } } }),
        // Hires grouped by employer (job → employer) for per-card counts.
        db.jobPostingApplication.groupBy({
          by: ['jobId'],
          where: { status: 'hired', ...jobOrg },
          _count: { _all: true },
        }),
        // Total hires across all employers.
        db.jobPostingApplication.count({ where: { status: 'hired', ...jobOrg } }),
      ]),
    );

    // Core directory must load; otherwise fall back to the legacy management view.
    if (directoryResult.status === 'rejected') {
      console.error('[admin/employers] directory load failed', directoryResult.reason);
      redirect('/admin/employers?ui=legacy');
    }

    const directory = directoryResult.value;
    let employerAggregateLoadFailed = [
      partnerCountResult,
      activeCountResult,
      openRolesGroupResult,
      openRolesTotalResult,
      hiresGroupResult,
      hiresTotalResult,
    ].some((result) => result.status === 'rejected');

    const openRolesByEmployer = new Map<string, number>();
    if (openRolesGroupResult.status === 'fulfilled') {
      for (const row of openRolesGroupResult.value) {
        openRolesByEmployer.set(row.employerId, row._count._all);
      }
    }

    // Hires are grouped by jobId; resolve each job's employer over the loaded
    // page only (lean). A failure here just leaves per-card hires at 0.
    const hiresByEmployer = new Map<string, number>();
    if (hiresGroupResult.status === 'fulfilled' && hiresGroupResult.value.length > 0) {
      const jobIds = hiresGroupResult.value.map((r) => r.jobId);
      const jobOwners = await withAdminPageScope(scope, (db) =>
        db.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, employerId: true } }),
      ).catch((reason: unknown) => {
        employerAggregateLoadFailed = true;
        console.error('[admin/employers] hire job-owner lookup failed', reason);
        return [] as { id: string; employerId: string }[];
      });
      const ownerByJob = new Map(jobOwners.map((j) => [j.id, j.employerId]));
      for (const row of hiresGroupResult.value) {
        const employerId = ownerByJob.get(row.jobId);
        if (!employerId) continue;
        hiresByEmployer.set(employerId, (hiresByEmployer.get(employerId) ?? 0) + row._count._all);
      }
    }

    const employers: EmployerCard[] = directory.map((e) => ({
      id: e.id,
      name: e.companyName,
      industry: e.industry?.trim() || 'Uncategorized',
      openRoles: openRolesByEmployer.get(e.id) ?? 0,
      hires: hiresByEmployer.get(e.id) ?? 0,
      status: (e.status as EmployerCard['status']) ?? 'inactive',
      lastLoginAt: e.user.lastLoginAt ? e.user.lastLoginAt.toISOString() : null,
    }));

    const totalPartners =
      partnerCountResult.status === 'fulfilled' ? partnerCountResult.value : employers.length;
    const activePartners =
      activeCountResult.status === 'fulfilled'
        ? activeCountResult.value
        : employers.filter((e) => e.status === 'active').length;
    const totalOpenRoles =
      openRolesTotalResult.status === 'fulfilled'
        ? openRolesTotalResult.value
        : employers.reduce((sum, e) => sum + e.openRoles, 0);
    const totalHires =
      hiresTotalResult.status === 'fulfilled'
        ? hiresTotalResult.value
        : employers.reduce((sum, e) => sum + e.hires, 0);

    return (
      <DesignSurface surface="dense">
        {employerAggregateLoadFailed ? <span hidden data-portal-error-state="admin-employers-aggregate-load" /> : null}
        <EmployersDirectoryKit
          employers={employers}
          totalPartners={totalPartners}
          totalOpenRoles={totalOpenRoles}
          totalHires={totalHires}
          activePartners={activePartners}
        />
      </DesignSurface>
    );
  }

  // --- LEGACY (?ui=legacy): the existing employer management workspace ---
  const activeTab = statusFilter || 'all';

  const where = activeTab !== 'all' ? { status: activeTab } : {};

  // Pagination — same pattern as the jobs legacy table (50/page, page-scoped
  // sort/filter): avoids loading the whole employer table (was take: 5000).
  const pageParam = page ? parseInt(page, 10) : 1;
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = 50;

  const [superAdmin, employers, totalCount, pendingCount] = await Promise.all([
    isSuperAdmin(user.id),
    withAdminPageScope(scope, (db) =>
      db.employer.findMany({
        where,
        orderBy: { companyName: 'asc' },
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { email: true, fullName: true, lastLoginAt: true } },
          _count: { select: { jobs: true } },
        },
      }),
    ),
    withAdminPageScope(scope, (db) => db.employer.count({ where })),
    withAdminPageScope(scope, (db) => db.employer.count({ where: { status: 'pending_approval' } })),
  ]);

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'pending_approval', label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
  ];

  return (
    <PortalPageFrame>
      <PageHeader
        title="Employers"
        subtitle="Manage employer accounts. Only active employers can be opened in the employer portal preview; inactive rows stay here until reactivated."
        action={
          // /admin/employers is a Server Component — inline onClick handlers
          // are not allowed (passing an event handler from server to client
          // fails the route at render time). Use a plain anchor with
          // target="_blank" instead; functionally identical from the user's
          // perspective and survives SSR.
          <a
            href="/api/admin/employers/export"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
            title="Export employers to CSV"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Download size={14} /> Export CSV
          </a>
        }
      />

      {superAdmin && (
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <ClearEmployerPortalContext />
          <span style={{ color: 'var(--color-on-surface-variant)' }}>
            Stops pinning the employer portal to a specific company (falls back to default).
          </span>
        </p>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--wa-border)', paddingBottom: '0.25rem' }}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/employers?ui=legacy${tab.key === 'all' ? '' : `&status=${tab.key}`}`}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem 0.5rem 0 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              background: activeTab === tab.key ? 'var(--surface-container)' : 'transparent',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {employers.length > 0 && (
        <>
          {/* Mobile cards — rendered before the desktop table (like the jobs
              legacy page) so the shared pagination control, which lives
              inside EmployersTableClient below, ends up after both views. */}
          <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
            {employers.map((e) => {
              const initials = (e.companyName ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
              const sStyle = statusBadgeStyle(e.status);
              return (
                <div key={e.id} className="portal-activity-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, var(--wa-hero-crimson-dark), var(--wa-hero-crimson))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--wa-on-hero)', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{e.companyName}</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.contactName} · {e.contactEmail}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <span
                        className="admin-portal-card__badge"
                        style={{ background: sStyle.background, color: sStyle.color }}
                      >
                        {statusLabel(e.status)}
                      </span>
                      <span className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue" style={{ width: '1.75rem', height: '1.75rem', borderRadius: '0.375rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', fontVariationSettings: "'FILL' 1" }}>work</span>
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{e._count.jobs}</span>
                    </div>
                  </div>
                  {/* Partnership tier + last-active row */}
                  {(() => {
                    const pt = getPartnershipTier(e.placementAgreementSigned, e.hiringPipelineActive);
                    const days = daysSinceLogin(e.user.lastLoginAt);
                    const laStyle = lastActiveBadgeStyle(days);
                    return (
                      <div style={{ paddingTop: '0.375rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', fontSize: '0.8125rem', background: pt.bg, color: pt.color, fontWeight: 600 }}>
                          {pt.label}
                        </span>
                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', fontSize: '0.8125rem', background: laStyle.background, color: laStyle.color, fontWeight: 600 }}>
                          {lastActiveLabel(days)}
                        </span>
                      </div>
                    );
                  })()}
                  {/* Meta + actions row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.user.fullName} · {e.user.email}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                      <AdminEmployerTierSelect employerId={e.id} initialTier={e.tier} />
                      <EmployerStatusButton employerId={e.id} status={e.status as 'active' | 'inactive' | 'pending_approval'} />
                      {superAdmin && (
                        <OpenEmployerPortalButton
                          employerId={e.id}
                          canOpenPortal={e.status === 'active'}
                          disabledReason="Inactive employers cannot be opened in portal preview. Reactivate the employer first."
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table (includes pagination controls, shown on both breakpoints) */}
          <EmployersTableClient
            employers={employers}
            superAdmin={superAdmin}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
          />
        </>
      )}

      {employers.length === 0 && (
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '1rem' }}>
          {activeTab === 'pending_approval'
            ? 'No pending employers. Great!'
            : activeTab === 'active'
            ? 'No active employers yet.'
            : activeTab === 'inactive'
            ? 'No inactive employers.'
            : 'No employers yet. Create the first account using the form below.'}
        </p>
      )}

      <CreateEmployerAccountClient />
    </PortalPageFrame>
  );
}
