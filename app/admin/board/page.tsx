import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileDown } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import {
  getBoardOutcomes,
  getBoardSnapshot,
  type BoardOutcomesPeriod,
} from '@/lib/admin/boardOutcomes';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PageHeader from '@/components/portal/PageHeader';
import BoardOutcomesView from '@/components/admin/BoardOutcomesView';
import { BoardOutcomesKit } from '@/components/portal/kit/pages/admin-subviews/BoardOutcomesKit';
import type { KpiItem, ChartDatum, RankDatum } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Board outcomes',
    description:
      'Outcomes view for workforce boards and grant funders. Real-time WIOA-aligned metrics.',
    path: '/admin/board',
    robots: { index: false, follow: false },
  });
}

const VALID_PERIODS: BoardOutcomesPeriod[] = ['all-time', 'ytd', 'q-current', 'q-prev'];

export default async function BoardOutcomesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; org?: string; ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/board');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const sp = await searchParams;
  const period: BoardOutcomesPeriod = (VALID_PERIODS as string[]).includes(sp.period ?? '')
    ? (sp.period as BoardOutcomesPeriod)
    : 'all-time';

  const orgId = await getActorOrganizationId(user.id);
  const superUser = await isSuperAdmin(user.id);
  const scopedOrgId = superUser ? undefined : (orgId ?? undefined);

  const requestedUi = typeof sp.ui === 'string' ? sp.ui : null;

  // ── DEFAULT (design-kit) PATH — runs AFTER the auth/role guard, so access
  // control is preserved. Reuses the same getBoardSnapshot() loader the
  // /admin/outcomes view uses (lean, Promise.allSettled internally; no
  // $transaction). The legacy raw-bars view is available via ?ui=legacy. ──
  if (requestedUi !== 'legacy') {
    const snapshot = await getBoardSnapshot(period, scopedOrgId);
    const totals = snapshot.outcomes.totals;
    const retentionRate = snapshot.kpis.retentionRate;

    // KPI tiles mapped to the board mockup (Placement Rate / Avg Wage /
    // Credentials / 90-Day Retention). The wage figure is the median annual
    // salary the outcomes module computes (the only wage statistic available);
    // it is the board's headline "wage" number. Empty data renders 0 / "—".
    const kpis: KpiItem[] = [
      { label: 'Placement Rate', value: `${totals.placementRate}%` },
      {
        label: 'Avg Wage',
        value:
          totals.medianAnnualSalary != null
            ? `$${totals.medianAnnualSalary.toLocaleString('en-US')}`
            : '—',
      },
      { label: 'Credentials', value: snapshot.certifications.totalEarned },
      {
        label: '90-Day Retention',
        value: retentionRate != null ? `${retentionRate}%` : '—',
      },
    ];

    // Placements by month from the real monthly cohort series. Each cohort's
    // label is the short month (e.g. "Jan 2026"); empty cohorts → empty chart.
    const placementsByMonth: ChartDatum[] = snapshot.cohorts.map((c) => ({
      label: c.monthLabel,
      value: c.placed,
    }));
    const placementsTotal = snapshot.cohorts.reduce((sum, c) => sum + c.placed, 0);

    // Per-program placements, ranked, with friendly program titles. `pct` is
    // each program's count relative to the leader so bars scale to the top.
    const programMaxPlaced = Math.max(1, ...snapshot.outcomes.programs.map((p) => p.placed));
    const byProgram: RankDatum[] = snapshot.outcomes.programs
      .filter((p) => p.placed > 0)
      .sort((a, b) => b.placed - a.placed)
      .map((p) => ({
        label: programDisplayTitle(p.programSlug),
        value: p.placed,
        pct: Math.round((p.placed / programMaxPlaced) * 100),
        color: 'info',
      }));

    return (
      <BoardOutcomesKit
        title="Board outcomes"
        kicker="Quarterly · board-ready"
        goal="Quarterly · board-ready"
        headerAction={
          <Link href="/admin/board/print" className="btn btn-primary btn-small">
            <FileDown size={14} style={{ marginRight: 6 }} />
            Generate Board Report
          </Link>
        }
        kpis={kpis}
        placementsByMonth={placementsByMonth.length > 0 ? placementsByMonth : undefined}
        placementsTotal={placementsTotal}
        periodLabel={snapshot.outcomes.period.label}
        byProgram={byProgram.length > 0 ? byProgram : undefined}
        showExports={false}
      />
    );
  }

  // ── LEGACY PATH (?ui=legacy) — preserves the original PageHeader + period
  // switcher + raw BoardOutcomesView exactly as before. ──
  const outcomes = await getBoardOutcomes(period, scopedOrgId);

  // Resolve program slugs to display titles for the programs breakdown.
  const programsWithTitles = outcomes.programs.map((p) => ({
    ...p,
    title: programDisplayTitle(p.programSlug),
  }));

  // White-label slug from URL (e.g. /admin/board?org=workforce-solutions-austin).
  // For T-5 day demo, no per-board scoping yet — just display name override.
  const boardName = sp.org ? prettifyOrgSlug(sp.org) : 'Workforce Advancement Project';

  return (
    <>
      <PageHeader
        title="Board outcomes"
        subtitle={`Live WIOA-aligned outcomes ready to show a workforce board or funder. Switch the timeframe to compare quarter over quarter.`}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Board outcomes' },
        ]}
        action={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <PeriodLink period="all-time" current={period} label="All time" />
            <PeriodLink period="ytd" current={period} label="YTD" />
            <PeriodLink period="q-current" current={period} label="This quarter" />
            <PeriodLink period="q-prev" current={period} label="Last quarter" />
            <Link href="/admin/board/print" className="btn btn-primary btn-small">
              Generate funder report
            </Link>
          </div>
        }
      />
      <BoardOutcomesView
        outcomes={outcomes}
        programs={programsWithTitles}
        boardName={boardName}
      />
    </>
  );
}

function PeriodLink({
  period,
  current,
  label,
}: {
  period: BoardOutcomesPeriod;
  current: BoardOutcomesPeriod;
  label: string;
}) {
  const active = period === current;
  return (
    <Link
      href={`/admin/board?ui=legacy&period=${period}`}
      className={active ? 'btn btn-primary btn-small' : 'btn btn-muted btn-small'}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

function prettifyOrgSlug(slug: string): string {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
