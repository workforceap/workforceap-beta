import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getBoardOutcomes, type BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { reportingRedirectHref, wantsLegacyView } from '@/lib/admin/reportingHub';
import PageHeader from '@/components/portal/PageHeader';
import BoardOutcomesView from '@/components/admin/BoardOutcomesView';

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

/**
 * Board outcomes is the Outcomes tab of the reporting hub now (admin audit
 * 2026-09-19, §6.1): one projection of `getBoardSnapshot()` for board and
 * placement readers, with the period carried across. The legacy raw-bars
 * view stays reachable behind `?ui=legacy` only.
 */
export default async function BoardOutcomesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; org?: string; ui?: string }>;
}) {
  const sp = await searchParams;
  if (!wantsLegacyView(sp)) redirect(reportingRedirectHref('/admin/board', sp));

  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/board');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const period: BoardOutcomesPeriod = (VALID_PERIODS as string[]).includes(sp.period ?? '')
    ? (sp.period as BoardOutcomesPeriod)
    : 'all-time';

  const orgId = await getActorOrganizationId(user.id);
  const superUser = await isSuperAdmin(user.id);
  const scopedOrgId = superUser ? undefined : (orgId ?? undefined);

  // Legacy view: the original PageHeader + period switcher + raw BoardOutcomesView.
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
