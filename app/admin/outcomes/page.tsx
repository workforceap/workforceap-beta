import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { redirect } from 'next/navigation';
import { getBoardSnapshot, BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import OutcomesSnapshot from '@/components/admin/OutcomesSnapshot';
import { BoardOutcomesKit } from '@/components/portal/kit/pages/admin-subviews/BoardOutcomesKit';
import type { KpiItem, ChartDatum, RankDatum } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('outcomes.title') || 'Outcomes Dashboard',
    description: t('outcomes.description') || 'Placement rates, salary data, and program effectiveness',
    path: '/admin/outcomes',
  });
}

export default async function OutcomesPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; ui?: string }>;
}) {
  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/admin/outcomes');
  }

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  // Load the real board snapshot once — it powers both the redesigned kit
  // (default) and the legacy OutcomesSnapshot view below. This is the same
  // loader the page has always used; no new queries are added.
  const orgId = await getActorOrganizationId(user.id);
  const period = (params?.period ?? 'all-time') as BoardOutcomesPeriod;
  const snapshot = await getBoardSnapshot(period, orgId ?? undefined);

  // ?ui=kit / DEFAULT KIT PATH — runs AFTER the auth/role guard (access
  // control is preserved). The redesigned Board Outcomes kit is now the
  // DEFAULT; the legacy OutcomesSnapshot view is available via ?ui=legacy.
  // Maps real snapshot numbers onto the kit's read-only props.
  if (requestedUi !== 'legacy') {
    const t = snapshot.outcomes.totals;

    // KPI tiles from real totals. Median (not average) wage is what the
    // outcomes module computes, so the tile is labelled accordingly.
    // 90-day retention is now the real rate from snapshot.kpis.retentionRate
    // (retained / decided placements, scoped to this org/period). It is null
    // when no placement has a decided retention outcome yet — show "—" then.
    const retentionRate = snapshot.kpis.retentionRate;
    const kpis: KpiItem[] = [
      { label: 'Placement Rate', value: `${t.placementRate}%` },
      {
        label: 'Median Wage',
        value: t.medianAnnualSalary != null ? `$${t.medianAnnualSalary.toLocaleString('en-US')}` : '—',
      },
      { label: 'Credentials Earned', value: snapshot.certifications.totalEarned },
      {
        label: '90-Day Retention',
        value: retentionRate != null ? `${retentionRate}%` : '—',
      },
    ];

    // Placements by month from placement_recorded member events. This keeps the
    // chart aligned with the operational activity feed staff actually create.
    const placementsByMonth: ChartDatum[] = (snapshot.placementActivity.length > 0
      ? snapshot.placementActivity
      : snapshot.cohorts.map((c) => ({
          month: c.month,
          monthLabel: c.monthLabel,
          placementsRecorded: c.placed,
        }))
    ).map((c) => ({
      label: c.monthLabel,
      value: c.placementsRecorded,
    }));
    const placementsTotal = placementsByMonth.reduce((sum, c) => sum + c.value, 0);

    // Per-program placements, ranked. `pct` is each program's placement count
    // relative to the top program so the bars scale to the leader.
    const programMaxPlaced = Math.max(1, ...snapshot.outcomes.programs.map((p) => p.placed));
    const byProgram: RankDatum[] = snapshot.outcomes.programs
      .filter((p) => p.placed > 0)
      .sort((a, b) => b.placed - a.placed)
      .map((p) => ({
        label: p.programSlug,
        value: p.placed,
        pct: Math.round((p.placed / programMaxPlaced) * 100),
        tone: 'info',
      }));

    // The period's CSV / PDF / Markdown snapshots are listed on /admin/exports
    // (one exports list, one verb per row); the kit links there.
    return (
      <BoardOutcomesKit
        kpis={kpis}
        placementsByMonth={placementsByMonth.length > 0 ? placementsByMonth : undefined}
        placementsTotal={placementsTotal}
        periodLabel={snapshot.outcomes.period.label}
        byProgram={byProgram.length > 0 ? byProgram : undefined}
      />
    );
  }

  return <OutcomesSnapshot initialSnapshot={snapshot} initialPeriod={period} />;
}
