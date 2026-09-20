import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getWeeklyRecapCohortStats, getWeeklyScoreboardStats } from '@/lib/admin/cohortAnalytics';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import DataTable from '@/components/portal/ui/DataTable';
import { WeeklyRecapKit } from '@/components/portal/kit/pages/admin-subviews/WeeklyRecapKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Weekly recap',
    description: 'Auto-generated weekly summary — enrollments, placements, certs, and at-risk trend.',
    path: '/admin/weekly-recap',
  });
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function formatDelta(delta: number, pct: number | null): string {
  const sign = delta > 0 ? '+' : '';
  if (pct == null) return `${sign}${delta} vs last week`;
  return `${sign}${delta} (${pct > 0 ? '+' : ''}${pct}%) vs last week`;
}

function formatDays(days: number | null): string {
  return days == null ? '—' : `${days} day${days === 1 ? '' : 's'}`;
}

function formatLastActivity(date: Date | null): string {
  return date ? formatDate(date) : 'No tracked activity';
}

const SCOREBOARD_METRICS = [
  { key: 'applicationsReviewed', label: 'Applications reviewed' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'enrollments', label: 'Enrollments' },
  { key: 'messagesSent', label: 'Messages sent' },
] as const;

export default async function AdminWeeklyRecapAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/weekly-recap');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const superAdmin = scope.superAdmin;
  const orgId = superAdmin ? null : scope.orgId;

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // --- LEGACY: the original full scoreboard analytics view ---
  if (requestedUi === 'legacy') {
    const [rows, scoreboard] = await Promise.all([
      getWeeklyRecapCohortStats(orgId),
      getWeeklyScoreboardStats(undefined, orgId),
    ]);

    return (
      <PortalPageFrame maxWidth="88rem">
        <PageHeader
          title="Weekly scoreboard"
          subtitle={`ISO week ${formatDate(scoreboard.weekStart)}–${formatDate(scoreboard.weekEnd)}: counselor activity, funnel velocity, and weekly recap engagement.`}
        />

        <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', marginBottom: '1.5rem' }}>
          {SCOREBOARD_METRICS.map((metric) => (
            <div key={metric.key} className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', fontWeight: 600 }}>{metric.label}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.35rem' }}>
                {scoreboard.comparison[metric.key].toLocaleString()}
              </div>
              <div style={{ marginTop: '0.35rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                {formatDelta(scoreboard.comparison.deltas[metric.key], scoreboard.comparison.pctChanges[metric.key])}
              </div>
              <div style={{ marginTop: '0.25rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
                Last week: {scoreboard.comparison.previous[metric.key].toLocaleString()}
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', marginBottom: '1.5rem' }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h2 className="portal-section-heading" style={{ margin: 0 }}>Counselor activity leaderboard</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                  Sessions are grouped from in-office session events; application reviews are admin status-change audits.
                </p>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <DataTable
                variant="admin"
                tableClassName="admin-table"
                scrollX={false}
                rows={scoreboard.counselors}
                rowKey={(r) => r.counselorId}
                columns={[
                  { key: 'name', header: 'Counselor', cell: (r) => <span title={r.email}>{r.name}</span> },
                  { key: 'sessions', header: 'Sessions held', cell: (r) => r.sessionsHeld },
                  { key: 'reviewed', header: 'Apps reviewed', cell: (r) => r.applicationsReviewed },
                  { key: 'contacted', header: 'Members contacted', cell: (r) => r.membersContacted },
                ]}
              />
            </div>
            {scoreboard.counselors.length === 0 ? (
              <p style={{ margin: 0, padding: '1rem', color: 'var(--color-on-surface-variant)' }}>No active counselor profiles yet.</p>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
              <h2 className="portal-section-heading" style={{ margin: 0 }}>Funnel velocity</h2>
              <p style={{ margin: '0.35rem 0 1rem', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                Average days from application submission to approval.
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '2rem' }}>{formatDays(scoreboard.funnelVelocity.currentAvgDays)}</strong>
                <span style={{ color: 'var(--color-on-surface-variant)' }}>this week</span>
              </div>
              <div style={{ marginTop: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                Trailing 4-week average: <strong>{formatDays(scoreboard.funnelVelocity.trailingFourWeekAvgDays)}</strong>
              </div>
              <div style={{ marginTop: '0.35rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
                {scoreboard.funnelVelocity.currentApprovedCount} approvals this week · {scoreboard.funnelVelocity.trailingApprovedCount} in trailing baseline
              </div>
            </div>

            <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', borderColor: scoreboard.atRisk.count > 0 ? 'rgba(173,44,77,0.35)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div>
                  <h2 className="portal-section-heading" style={{ margin: 0 }}>At-risk flags</h2>
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                    Approved/enrolled members with no tracked activity since {formatDate(scoreboard.atRisk.staleCutoff)}.
                  </p>
                </div>
                <Link href="/admin/members?attention=1&sort=lastActive:asc" className="btn btn-outline btn-sm">
                  View list
                </Link>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.75rem' }}>{scoreboard.atRisk.count.toLocaleString()}</div>
              {scoreboard.atRisk.sample.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.5rem' }}>
                  {scoreboard.atRisk.sample.map((member) => (
                    <li key={member.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600 }}>{member.fullName}</span>
                      <span style={{ color: 'var(--color-on-surface-variant)' }}>{formatLastActivity(member.lastActivityAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>

        <section className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 className="portal-section-heading" style={{ margin: 0 }}>Weekly recap analytics</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant)' }}>
              Generated recaps and engagement by enrolled program cohort.
            </p>
          </div>

          <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
            <DataTable
              variant="admin"
              tableClassName="admin-table"
              scrollX={false}
              rows={rows}
              rowKey={(r) => r.cohortKey}
              columns={[
                { key: 'cohort', header: 'Cohort', cell: (r) => r.cohortLabel },
                { key: 'members', header: 'Members', cell: (r) => r.memberCount },
                { key: 'withRecaps', header: 'With recaps', cell: (r) => r.membersWithRecap },
                { key: 'total', header: 'Total recaps', cell: (r) => r.totalRecaps },
                { key: '7d', header: 'Recaps (7d)', cell: (r) => r.recapsLast7Days },
                {
                  key: 'readiness',
                  header: 'Avg readiness',
                  cell: (r) => (r.avgReadinessScore != null ? `${r.avgReadinessScore}%` : '—'),
                },
              ]}
            />
          </div>

          <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
            {rows.map((r) => (
              <div key={r.cohortKey} style={{ background: 'var(--surface-container)', borderRadius: 'var(--radius-lg)', padding: '0.875rem 1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{r.cohortLabel}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span>Members: <strong style={{ color: 'var(--color-on-surface)' }}>{r.memberCount}</strong></span>
                  <span>With recaps: <strong style={{ color: 'var(--color-on-surface)' }}>{r.membersWithRecap}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span>Total: <strong style={{ color: 'var(--color-on-surface)' }}>{r.totalRecaps}</strong></span>
                  <span>7d: <strong style={{ color: 'var(--color-on-surface)' }}>{r.recapsLast7Days}</strong></span>
                </div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  Avg readiness: <strong style={{ color: 'var(--color-on-surface)' }}>{r.avgReadinessScore != null ? `${r.avgReadinessScore}%` : '—'}</strong>
                </div>
              </div>
            ))}
            {rows.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
                No weekly recap data yet.
              </div>
            ) : null}
          </div>
        </section>
      </PortalPageFrame>
    );
  }

  // --- DEFAULT: design-kit recap with real week-over-week deltas ---

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // last 7 days
  const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // prior 7 days
  // At-risk staleness windows: a member is "stale" with no tracked activity in
  // 14 days. "Newly stale" crossed that line this week (last activity 14–21d ago);
  // "re-engaged" had activity this week after a stale prior week.
  const staleCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const deepStaleCutoff = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const orgFilter = orgId ? { organizationId: orgId } : {};
  const orgUserFilter = orgId ? { user: { organizationId: orgId } } : {};

  // Six lean count queries (no $transaction, no per-row HTTP).
  const [
    newStudents,
    newStudentsPrev,
    placements,
    placementsPrev,
    certsEarned,
    certsEarnedPrev,
    newlyStale,
    reEngaged,
  ] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, ...orgFilter, enrolledAt: { gte: weekStart, lt: now } },
    }),
    prisma.user.count({
      where: { deletedAt: null, ...orgFilter, enrolledAt: { gte: prevStart, lt: weekStart } },
    }),
    prisma.placementRecord.count({
      where: { placedAt: { gte: weekStart, lt: now }, ...orgUserFilter },
    }),
    prisma.placementRecord.count({
      where: { placedAt: { gte: prevStart, lt: weekStart }, ...orgUserFilter },
    }),
    prisma.userCertification.count({
      where: { status: 'approved', earnedAt: { gte: weekStart, lt: now }, ...orgUserFilter },
    }),
    prisma.userCertification.count({
      where: { status: 'approved', earnedAt: { gte: prevStart, lt: weekStart }, ...orgUserFilter },
    }),
    // Newly stale: enrolled members whose most recent tracked activity fell in
    // the 14–21d window (crossed the 14d staleness line during this week).
    prisma.user.count({
      where: {
        deletedAt: null,
        ...orgFilter,
        enrolledAt: { not: null },
        memberEvents: { none: { createdAt: { gte: staleCutoff } } },
        AND: [{ memberEvents: { some: { createdAt: { gte: deepStaleCutoff, lt: staleCutoff } } } }],
      },
    }),
    // Re-engaged: members active this week whose only prior activity was already
    // stale (no activity in the 14d→7d window before this week).
    prisma.user.count({
      where: {
        deletedAt: null,
        ...orgFilter,
        enrolledAt: { not: null },
        memberEvents: { some: { createdAt: { gte: weekStart } } },
        AND: [{ memberEvents: { none: { createdAt: { gte: deepStaleCutoff, lt: weekStart } } } }],
      },
    }),
  ]);

  // Net at-risk change: newly stale grows the pool, re-engaged shrinks it.
  const atRiskDelta = newlyStale - reEngaged;

  const weekLabel = `${formatDate(weekStart)} – ${formatDate(now)}`;

  return (
    <WeeklyRecapKit
      newStudents={newStudents}
      newStudentsPrev={newStudentsPrev}
      placements={placements}
      placementsPrev={placementsPrev}
      certsEarned={certsEarned}
      certsEarnedPrev={certsEarnedPrev}
      atRiskDelta={atRiskDelta}
      weekLabel={weekLabel}
    />
  );
}
