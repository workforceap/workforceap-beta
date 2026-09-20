import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import type { LucideIcon } from 'lucide-react';
import {
  Download,
  Workflow,
  Users,
  ListChecks,
  Activity,
  GraduationCap,
  Award,
  Mail,
  Handshake,
  RefreshCw,
  Table2,
  FileText,
  Clock,
  Building2,
  ArrowUpRight,
} from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { loadTrainingDashboardData } from '@/lib/admin/trainingDashboard';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { getTriageDigest, type TriageDigest } from '@/lib/admin/triageDigest';
import { countThreadsWithSlaBreach } from '@/lib/messages/superAdminMessageQueries';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import TriageDigestSection from '@/components/admin/TriageDigestSection';
import GtmSetupCheck from '@/components/admin/GtmSetupCheck';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import {
  DesignSurface,
  CardHead,
  StatSparkTile,
  Avatar,
  DataTable,
  colorVar,
  type KitColor,
} from '@/components/portal/kit';
import { pluralCount } from '@/lib/i18n/pluralCount';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin overview',
  description: 'Admin dashboard.',
  path: '/admin/overview',
});
}

type RecentSignupRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    fullName: true;
    email: true;
    enrolledProgram: true;
    enrolledAt: true;
    assessmentScorePct: true;
    assessmentCompleted: true;
    createdAt: true;
  };
}>;

type PlacementWithUser = Prisma.PlacementRecordGetPayload<{
  select: {
    id: true;
    employerName: true;
    jobTitle: true;
    startDate: true;
    salaryOffered: true;
    placedAt: true;
    user: {
      select: { id: true; fullName: true; email: true; enrolledProgram: true; enrolledAt: true };
    };
  };
}>;

type PendingPlacementWithUser = Prisma.PlacementRecordGetPayload<{
  select: {
    id: true;
    employerName: true;
    jobTitle: true;
    placedAt: true;
    user: {
      select: { id: true; fullName: true; email: true; enrolledProgram: true };
    };
  };
}>;

const placementRecordBaseSelect = {
  id: true,
  employerName: true,
  jobTitle: true,
  startDate: true,
  salaryOffered: true,
  placedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      enrolledAt: true,
    },
  },
} satisfies Prisma.PlacementRecordSelect;

export default async function AdminOverviewPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const superAdmin = scope.superAdmin;

  let totalMembers: number;
  let assessmentsCompleted: number;
  let recentUsers: RecentSignupRow[];
  let recentPlacements: PlacementWithUser[];
  let pendingApplications: number;
  let activeInTraining: number;
  let programsEnrolled: number;
  let programsCompleted: number;
  let pendingPlacements: PendingPlacementWithUser[];
  let adminOverviewLoadFailed = false;

  function logPrismaReason(label: string, reason: unknown) {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const code = reason instanceof Prisma.PrismaClientKnownRequestError ? reason.code : undefined;
    console.error(`[admin/page] ${label} failed`, code ?? '(no code)', msg);
  }

  try {
    // Match /admin/members: do not fail the whole dashboard when optional slices fail
    // (e.g. RLS/role differences on applications or placement_records vs users).
    const userOrg = inheritUserOrg(scope);
    const [
      totalMembersResult,
      assessmentsCompletedResult,
      recentUsersResult,
      recentPlacementsResult,
      pendingApplicationsResult,
      pendingPlacementsResult,
    ] = await withAdminPageScope(scope, (db) => Promise.allSettled([
      // Members only: staff and dogfood admin accounts never count as members
      // on the overview (admin audit 2026-09-20, 4.1) — same roster the
      // attention model and the Command Center use.
      db.user.count({ where: { deletedAt: null, ...MEMBER_ONLY_WHERE } }),
      db.user.count({
        where: { assessmentCompleted: true, deletedAt: null, ...MEMBER_ONLY_WHERE },
      }),
      // Recent signups are members only; staff/dogfood accounts are not
      // "pending enrollment" (admin audit 2026-09-20, 4.1).
      db.user.findMany({
        where: { deletedAt: null, ...MEMBER_ONLY_WHERE },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          fullName: true,
          email: true,
          enrolledProgram: true,
          enrolledAt: true,
          assessmentScorePct: true,
          assessmentCompleted: true,
          createdAt: true,
        },
      }),
      db.placementRecord.findMany({
        where: { ...userOrg },
        orderBy: { placedAt: 'desc' },
        take: 10,
        select: placementRecordBaseSelect,
      }),
      db.application.count({ where: { status: 'PENDING', ...userOrg } }),
      db.placementRecord.findMany({
        where: { startDateVerified: false, ...userOrg },
        orderBy: { placedAt: 'asc' },
        take: 10,
        select: {
          id: true,
          employerName: true,
          jobTitle: true,
          placedAt: true,
          user: {
            select: { id: true, fullName: true, email: true, enrolledProgram: true },
          },
        },
      }),
    ]));

    if (totalMembersResult.status === 'rejected') {
      logPrismaReason('totalMembers', totalMembersResult.reason);
      throw totalMembersResult.reason;
    }
    if (assessmentsCompletedResult.status === 'rejected') {
      logPrismaReason('assessmentsCompleted', assessmentsCompletedResult.reason);
      throw assessmentsCompletedResult.reason;
    }
    if (recentUsersResult.status === 'rejected') {
      logPrismaReason('recentUsers', recentUsersResult.reason);
      throw recentUsersResult.reason;
    }

    totalMembers = totalMembersResult.value;
    assessmentsCompleted = assessmentsCompletedResult.value;
    recentUsers = recentUsersResult.value;

    if (recentPlacementsResult.status === 'rejected') {
      adminOverviewLoadFailed = true;
      logPrismaReason('placementRecord.findMany', recentPlacementsResult.reason);
      recentPlacements = [];
    } else {
      recentPlacements = recentPlacementsResult.value;
    }

    if (pendingApplicationsResult.status === 'rejected') {
      adminOverviewLoadFailed = true;
      logPrismaReason('application.count', pendingApplicationsResult.reason);
      pendingApplications = 0;
    } else {
      pendingApplications = pendingApplicationsResult.value;
    }

    if (pendingPlacementsResult.status === 'rejected') {
      adminOverviewLoadFailed = true;
      logPrismaReason('placementRecord.pendingReview', pendingPlacementsResult.reason);
      pendingPlacements = [];
    } else {
      pendingPlacements = pendingPlacementsResult.value;
    }

    const [trainingDashboardResult] = await Promise.allSettled([loadTrainingDashboardData(scope)]);

    if (trainingDashboardResult.status === 'rejected') {
      adminOverviewLoadFailed = true;
      logPrismaReason('trainingDashboardMetrics', trainingDashboardResult.reason);
      activeInTraining = 0;
      programsEnrolled = 0;
      programsCompleted = 0;
    } else {
      const training = trainingDashboardResult.value;
      activeInTraining = training.metrics.activeInTraining;
      programsEnrolled = new Set(training.rows.map((row) => row.enrolledProgram)).size;
      programsCompleted = new Set(
        training.rows
          .filter((row) => row.totalCourses > 0 && row.completedCount === row.totalCourses)
          .map((row) => row.enrolledProgram)
      ).size;
    }
  } catch (e) {
    logPrismaReason('critical block', e);
    return (
      <PortalPageFrame>
        <AdminDataLoadError title="Admin overview unavailable" />
      </PortalPageFrame>
    );
  }

  const metricCards: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    href: string;
  }> = [
    { icon: Users, label: 'Total Members', value: totalMembers.toLocaleString(), href: '/admin/members' },
    { icon: ListChecks, label: 'Assessments Completed', value: assessmentsCompleted.toLocaleString(), href: '/admin/assessments' },
    { icon: Activity, label: 'Active in Training', value: activeInTraining.toLocaleString(), href: '/admin/training-progress' },
    { icon: GraduationCap, label: 'Programs Enrolled', value: programsEnrolled.toLocaleString(), href: '/admin/programs' },
    { icon: Award, label: 'Programs Completed', value: programsCompleted.toLocaleString(), href: '/admin/programs' },
  ];

  function timeAgo(date: Date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }

  const [slaBreaches48h, recentCronErrors, triageDigest] = await Promise.all([
    countThreadsWithSlaBreach(48).catch((error) => {
      adminOverviewLoadFailed = true;
      logPrismaReason('message SLA count', error);
      return 0;
    }),
    prisma.workflowDiagnostic.count({
      where: {
        status: { in: ['error', 'errored'] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }).catch((error) => {
      adminOverviewLoadFailed = true;
      logPrismaReason('workflow diagnostic count', error);
      return 0;
    }),
    getTriageDigest(scope).catch((reason): TriageDigest => {
      adminOverviewLoadFailed = true;
      logPrismaReason('triageDigest', reason);
      return { buckets: [], allClear: true };
    }),
  ]);

  return (
    <PortalPageFrame>
      {adminOverviewLoadFailed ? <span hidden data-portal-error-state="admin-overview-load" /> : null}
      <PageHeader
        title="Admin overview"
        subtitle="See who's signing up, how training is going, and where members are getting placed."
        action={
          <div className="employer-dash-header-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a href="/api/admin/funder-program-summary" className="btn btn-outline">
              <Download size={14} aria-hidden />
              Export funder CSV
            </a>
            <Link href="/admin/pipeline" className="btn btn-outline">
              <Workflow size={14} aria-hidden />
              Pipeline
            </Link>
            <Link href="/admin/members" className="btn btn-primary">
              <Users size={14} aria-hidden />
              All Members
            </Link>
          </div>
        }
      />

      <DesignSurface surface="dense">
        {superAdmin && (
          <section className="wa-kit-card" style={{ margin: '0 1.5rem 1.25rem' }}>
            <div className="wa-flex wa-items-center wa-justify-between wa-flex-wrap" style={{ gap: 12 }}>
              <div>
                <p className="wa-kit-stat-label" style={{ margin: 0 }}>Super Admin Portal Views</p>
                <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
                  View real employer and partner portals with live data. Select an org below.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Link href="/admin/employers" className="btn btn-outline btn-sm">
                  View employer portal
                </Link>
                <Link href="/counselor" className="btn btn-outline btn-sm">
                  Counselor preview
                </Link>
                <Link href="/admin/partners" className="btn btn-outline btn-sm">
                  View partner portal
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Split into one alert per signal so each has its own action.
            Closes audit #85: previously both lived in a single alert label
            and the two CTAs read as equal-weight against a combined headline. */}
        {slaBreaches48h > 0 && (
          <div className="portal-alert" style={{ margin: '0 1.5rem 0.75rem', borderColor: 'color-mix(in srgb, var(--wa-accent) 35%, transparent)' }}>
            <span className="portal-alert__label">
              {`${slaBreaches48h} member thread${slaBreaches48h === 1 ? '' : 's'} over 48h without reply`}
            </span>
            <Link href="/admin/messages" className="portal-alert__action">
              Review messages &rarr;
            </Link>
          </div>
        )}
        {recentCronErrors > 0 && (
          <div className="portal-alert" style={{ margin: '0 1.5rem 1.25rem', borderColor: 'color-mix(in srgb, var(--wa-accent) 35%, transparent)' }}>
            <span className="portal-alert__label">
              {`${recentCronErrors} cron error${recentCronErrors === 1 ? '' : 's'} in the last 7 days`}
            </span>
            <Link href="/admin/email-crons" className="portal-alert__action">
              Check cron health &rarr;
            </Link>
          </div>
        )}

        {/* ── GTM Setup Check ── */}
        <GtmSetupCheck />

        {/* ── Pending Applications Alert ── */}
        {pendingApplications > 0 && (
          <>
            <div className="md:wa-hidden">
              <div className="portal-alert portal-alert--accent" style={{ margin: '0 1.5rem 1rem' }}>
                <span className="portal-alert__label">
                  {pendingApplications} pending
                </span>
                <Link href="/admin/members" className="portal-alert__action">
                  Review &rarr;
                </Link>
              </div>
            </div>
            <div className="wa-hidden md:wa-block" style={{ marginBottom: '1.5rem' }}>
              <div className="portal-alert portal-alert--accent" style={{ margin: 0 }}>
                <span className="portal-alert__label">
                  {pendingApplications} pending application{pendingApplications === 1 ? '' : 's'} awaiting review
                </span>
                <Link href="/admin/members" className="portal-alert__action">
                  Review &rarr;
                </Link>
              </div>
            </div>
          </>
        )}
        {pendingPlacements.length > 0 && (
          <div className="wa-hidden md:wa-block portal-alert" style={{ marginBottom: '1.5rem', borderColor: 'color-mix(in srgb, var(--wa-success) 35%, transparent)' }}>
            <span className="portal-alert__label">
              {pluralCount(pendingPlacements.length, 'placement')} waiting for counselor review
            </span>
            <Link href="/admin/members" className="portal-alert__action">
              Finalize &rarr;
            </Link>
          </div>
        )}


        {/* ── "Who needs you today" triage ── */}
        <TriageDigestSection digest={triageDigest} />

      {/* ── KPI row (single treatment — desktop + mobile) ── */}
      <section style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-5 wa-gap-3">
          {metricCards.map((card) => (
            <Link key={card.label} href={card.href} className="wa-kit-focus" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div style={{ position: 'relative' }}>
                <StatSparkTile icon={<card.icon size={16} />} label={card.label} value={card.value} />
                <ArrowUpRight
                  size={14}
                  aria-hidden
                  style={{ position: 'absolute', top: 'var(--wa-pad-sm)', right: 'var(--wa-pad-sm)', color: 'var(--wa-muted)', opacity: 0.6 }}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wa-kit-card" style={{ margin: '0 1.5rem 1.5rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--wa-pad)', paddingBottom: 'var(--wa-pad-sm)' }}>
          <CardHead title="Recent Signups" linkLabel="View all" linkHref="/admin/members" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {recentUsers.slice(0, 6).map((u, index) => {
            const initials = (u.fullName ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
            const track = u.enrolledProgram
              ? (programDisplayTitle(u.enrolledProgram))
              : 'Pending enrollment';

            return (
              <Link
                key={u.id}
                href={`/admin/members/${u.id}`}
                className="wa-kit-focus"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  borderTop: index === 0 ? 'none' : '1px solid var(--wa-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '1rem var(--wa-pad)' }}>
                  <Avatar initials={initials} size={36} gradient={false} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>
                      {u.fullName ?? 'Unknown'}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>
                      {u.email}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--wa-text)', margin: '7px 0 0' }}>
                      {track}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--wa-muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                    {timeAgo(u.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Main Dashboard Layout ── */}
      <div className="wa-hidden md:wa-block portal-grid-2col" style={{ gap: '2rem' }}>
        {/* ── Left Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Recent Placements */}
          {recentPlacements.length > 0 && (
            <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 'var(--wa-pad)', paddingBottom: 'var(--wa-pad-sm)' }}>
                <CardHead title="Recent Placements" />
              </div>
              <DataTable
                rows={recentPlacements}
                rowKey={(p) => p.id}
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    render: (p) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar
                          initials={(p.user.fullName ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          size={28}
                          gradient={false}
                        />
                        <Link
                          href={`/admin/members/${p.user.id}`}
                          style={{ fontWeight: 700, color: 'var(--wa-text)', textDecoration: 'none' }}
                        >
                          {p.user.fullName}
                        </Link>
                      </div>
                    ),
                  },
                  { key: 'employer', header: 'Employer', render: (p) => p.employerName },
                  { key: 'role', header: 'Role', render: (p) => p.jobTitle },
                  {
                    key: 'program',
                    header: 'Program',
                    render: (p) =>
                      p.user.enrolledProgram
                        ? programDisplayTitle(p.user.enrolledProgram)
                        : '—',
                  },
                  {
                    key: 'days',
                    header: 'Days',
                    render: (p) => {
                      const daysToPlacement = p.user.enrolledAt
                        ? Math.floor((p.placedAt.getTime() - p.user.enrolledAt.getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      return daysToPlacement != null ? `${daysToPlacement}d` : '—';
                    },
                  },
                  {
                    key: 'salary',
                    header: 'Salary',
                    align: 'right',
                    render: (p) => (
                      <span style={{ color: 'var(--wa-success)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {p.salaryOffered ? `$${p.salaryOffered.toLocaleString()}` : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'date',
                    header: 'Date',
                    render: (p) => p.placedAt.toLocaleDateString(),
                  },
                ]}
              />
            </div>
          )}

          {pendingPlacements.length > 0 && (
            <div className="wa-kit-card">
              <CardHead title="Pending Placements" />
              <p style={{ margin: '-8px 0 14px', color: 'var(--wa-muted)', fontSize: 13 }}>
                Member-confirmed placements waiting for counselor verification.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingPlacements.map((placement) => (
                  <div
                    key={placement.id}
                    className="wa-kit-card wa-kit-card--sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                  >
                    <div>
                      <Link href={`/admin/members/${placement.user.id}`} style={{ fontWeight: 700, color: 'var(--wa-text)', textDecoration: 'none' }}>
                        {placement.user.fullName}
                      </Link>
                      <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 3 }}>
                        {placement.employerName} · {placement.jobTitle}
                        {placement.user.enrolledProgram ? ` · ${programDisplayTitle(placement.user.enrolledProgram)}` : ''}
                      </div>
                    </div>
                    <Link href={`/admin/members/${placement.user.id}`} className="btn btn-outline">
                      Review record
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="wa-kit-card">
            <CardHead title="Quick Links" />
            <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-3">
              {(
                [
                  { icon: Mail, label: 'Messages', desc: 'Portal threads and staff replies', href: '/admin/messages' },
                  { icon: Handshake, label: 'Partners', desc: 'Community organizations', href: '/admin/partners' },
                  { icon: ListChecks, label: 'Assessments', desc: 'Skills assessments and scores', href: '/admin/assessments' },
                  { icon: GraduationCap, label: 'Programs', desc: 'Training tracks and courses', href: '/admin/programs' },
                  { icon: RefreshCw, label: 'Coursera', desc: 'Identity mapping and xAPI review', href: '/admin/coursera' },
                  { icon: Table2, label: 'Training progress', desc: 'Per-learner curriculum + raw Coursera, sortable', href: '/admin/training-progress' },
                  { icon: FileText, label: 'Email Templates', desc: 'Preview and manage transactional emails', href: '/admin/email-templates' },
                ] as Array<{ icon: LucideIcon; label: string; desc: string; href: string }>
              ).map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 'var(--wa-radius-sm)',
                      background: 'var(--wa-accent-soft)',
                      color: 'var(--wa-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <item.icon size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)' }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>{item.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* At a Glance */}
          <div className="wa-kit-card">
            <CardHead title="At a Glance" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(
                [
                  { icon: Users, label: 'Total Members', value: totalMembers, color: 'accent' as KitColor, href: '/admin/members' },
                  { icon: Activity, label: 'Active in Training', value: activeInTraining, color: 'success' as KitColor, href: '/admin/pipeline' },
                  { icon: ListChecks, label: 'Assessments Done', value: assessmentsCompleted, color: 'info' as KitColor, href: '/admin/assessments' },
                  ...(pendingApplications > 0
                    ? [{ icon: Clock, label: 'Pending Review', value: pendingApplications, color: 'gold' as KitColor, href: '/admin/members' }]
                    : []),
                ]
              ).map((row) => (
                <Link
                  key={row.label}
                  href={row.href}
                  className="wa-kit-focus"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--wa-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <row.icon size={15} aria-hidden style={{ color: colorVar(row.color) }} />
                    {row.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: colorVar(row.color), fontVariantNumeric: 'tabular-nums' }}>
                    {row.value}
                  </span>
                </Link>
              ))}
              <div style={{ borderTop: '1px solid var(--wa-border)', paddingTop: 14, marginTop: 2 }}>
                <Link href="/admin/members" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
                  View all members →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Quick Actions ── */}
      <section className="md:wa-hidden" style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
        <h3 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-[0.1em]" style={{ marginBottom: '0.75rem', color: 'var(--wa-muted)' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <a
            href="/api/admin/funder-program-summary"
            className="active:scale-[0.97] wa-transition-transform wa-kit-card wa-kit-card--sm"
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <Download size={18} aria-hidden style={{ color: 'var(--wa-accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', letterSpacing: '-0.01em' }}>Export funder CSV</span>
          </a>
          {(
            [
              { icon: Users, label: 'All Members', href: '/admin/members' },
              { icon: Building2, label: 'Employers', href: '/admin/employers' },
              { icon: Handshake, label: 'Partners', href: '/admin/partners' },
              { icon: RefreshCw, label: 'Coursera', href: '/admin/coursera' },
            ] as Array<{ icon: LucideIcon; label: string; href: string }>
          ).map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="active:scale-[0.97] wa-transition-transform wa-kit-card wa-kit-card--sm"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              <action.icon size={18} aria-hidden style={{ marginBottom: 8, color: 'var(--wa-accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)', letterSpacing: '-0.01em' }}>{action.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </DesignSurface>
    </PortalPageFrame>
  );
}
