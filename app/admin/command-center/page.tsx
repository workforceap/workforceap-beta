import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bell, TriangleAlert, UserPlus, Briefcase, Award } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getAdminCommandCenter, type AdminCommandCenter } from '@/lib/admin/commandCenter';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { normalizeAdminQueueRequest, adminQueueHref } from '@/lib/admin/commandCenterHelpers';
import type { ChartDatum } from '@/components/portal/kit';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import AdminCommandCenterClient from '@/components/admin/AdminCommandCenterClient';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import {
  CommandCenterKit,
  type CommandCenterQueueItem,
  type ProgramHealthDatum,
} from '@/components/portal/kit/pages/admin/CommandCenterKit';
import type { KpiItem } from '@/components/portal/kit';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Command Center',
    description: 'Today’s counselor queue for replies, risk follow-up, interviews, and pending applications.',
    path: '/admin/command-center',
  });
}

export default async function AdminCommandCenterPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string; queue?: string; page?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/command-center');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;
  const request = normalizeAdminQueueRequest(params?.queue, params?.page);

  // Single source of truth for both the kit (default) and the legacy view:
  // the real command-center loader. Re-establishes the auth GUC context (RSC
  // renders outside the root layout's gucContextStorage.run() scope, so without
  // this the queries would run with anonymous RLS credentials).
  let commandCenterLoadFailed = false;
  const data: AdminCommandCenter = await withAuthGuc(() =>
    getAdminCommandCenter(user.id, { perSectionLimit: 8, ...request }),
  ).catch((err) => {
    console.error('[admin/command-center] failed to load command center:', err);
    commandCenterLoadFailed = true;
    return {
      needsReply: [],
      atRisk: [],
      interviewing: [],
      applicationsPending: [],
      programHealth: [],
      totals: {
        needsReplyCount: 0,
        atRiskCount: 0,
        interviewingCount: 0,
        applicationsPendingCount: 0,
        certificationsPendingCount: 0,
        oldestPendingApplicationDays: null,
      },
    };
  });

  if (commandCenterLoadFailed) {
    return (
      <AdminDataLoadError
        title="Command center unavailable"
        message="We could not load the current member queues. Try again shortly."
      />
    );
  }

  if (data.pagination) {
    const counts = { 'needs-reply': data.totals.needsReplyCount, 'at-risk': data.totals.atRiskCount,
      interviewing: data.totals.interviewingCount, applications: data.totals.applicationsPendingCount };
    const lastPage = Math.max(1, Math.ceil(counts[data.pagination.queue] / data.pagination.pageSize));
    if (data.pagination.page > lastPage) redirect(adminQueueHref(data.pagination.queue, lastPage));
  }

  // v2 KIT is now the DEFAULT Command Center; legacy view via ?ui=legacy.
  // Runs AFTER the auth/role guard above (access control preserved) and is fed
  // by the real loader's totals/buckets — no fabricated counts.
  if (requestedUi !== 'legacy' && !request.queue) {
    const { totals } = data;
    let headlineLoadFailed = false;

    // Headline KPIs match the mockup ("Active Students / Placements YTD /
    // Completion Rate / At Risk"). Sourced from cheap, org-scoped real queries
    // — never fabricated. All wrapped in withAuthGuc so RLS sees the actor.
    // Population is member-role accounts only (`MEMBER_ONLY_WHERE`), the same
    // roster the Program health rows below and /admin count, so the 37 vs 35
    // disagreement on one screen cannot recur (number audit 2026-09-20, F1/F2).
    const yearStart = new Date(new Date().getUTCFullYear(), 0, 1);
    const headline = await withAuthGuc(async () => {
      const orgId = await getActorOrganizationId(user.id);
      const memberUser = { organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE };
      const [activeStudents, placementsYtd, placementRows] = await Promise.all([
        prisma.user
          .count({ where: { ...memberUser, enrolledProgram: { not: null } } })
          .catch((error) => {
            headlineLoadFailed = true;
            console.error('[admin/command-center] active student headline failed', error);
            return 0;
          }),
        prisma.placementRecord
          .count({ where: { user: memberUser, placedAt: { gte: yearStart } } })
          .catch((error) => {
            headlineLoadFailed = true;
            console.error('[admin/command-center] placement count headline failed', error);
            return 0;
          }),
        prisma.placementRecord
          .findMany({
            where: { user: memberUser, placedAt: { gte: yearStart } },
            select: { placedAt: true },
          })
          .catch((error) => {
            headlineLoadFailed = true;
            console.error('[admin/command-center] placement trend headline failed', error);
            return [] as Array<{ placedAt: Date }>;
          }),
      ]);
      return { activeStudents, placementsYtd, placementRows };
    }).catch((error) => {
      headlineLoadFailed = true;
      console.error('[admin/command-center] scoped headline load failed', error);
      return { activeStudents: 0, placementsYtd: 0, placementRows: [] as Array<{ placedAt: Date }> };
    });

    if (headlineLoadFailed) return <AdminDataLoadError title="Command center unavailable" message="Current dashboard figures could not be loaded. Please reload this page." />;

    // Share of enrolled, non-deleted members currently in the interviewing
    // placement bucket. Falls back to "—" when there are none.


    // Placements by month (Jan→current month, YTD) for the BarChartMini.
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const thisMonth = new Date().getUTCMonth();
    const monthBuckets = new Array(thisMonth + 1).fill(0);
    for (const row of headline.placementRows) {
      const m = row.placedAt.getUTCMonth();
      if (m >= 0 && m <= thisMonth) monthBuckets[m] += 1;
    }
    const placementsByMonth: ChartDatum[] = monthBuckets.map((value, i) => ({
      label: monthLabels[i],
      value,
    }));

    const kpis: KpiItem[] = [
      {
        label: 'Active Students',
        value: headline.activeStudents,
      },
      {
        label: 'Placements YTD',
        value: headline.placementsYtd,
      },
      { label: 'Interview prep', value: totals.interviewingCount },
      { label: 'At Risk', value: totals.atRiskCount, tone: totals.atRiskCount > 0 ? 'alert' : undefined },
    ];

    const countLabel = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
    const queueItems: CommandCenterQueueItem[] = [
      {
        id: 'at-risk',
        icon: <TriangleAlert size={14} aria-hidden />,
        iconColor: 'var(--wa-accent)',
        title: `${totals.atRiskCount} ${totals.atRiskCount === 1 ? 'student' : 'students'} need a check-in`,
        detail: 'Approved training has gone quiet or course activity is flagged',
        actionLabel: countLabel(totals.atRiskCount),
        urgent: totals.atRiskCount > 0,
        href: '/admin/command-center?queue=at-risk',
      },
      {
        id: 'needs-reply',
        icon: <Bell size={14} aria-hidden />,
        iconColor: 'var(--wa-info)',
        title: `${totals.needsReplyCount} ${totals.needsReplyCount === 1 ? 'conversation needs' : 'conversations need'} a reply`,
        detail: 'Members are waiting on a response',
        actionLabel: countLabel(totals.needsReplyCount),
        href: '/admin/command-center?queue=needs-reply',
      },
      {
        id: 'applications',
        icon: <UserPlus size={14} aria-hidden />,
        iconColor: 'var(--wa-gold)',
        title: `${totals.applicationsPendingCount} ${totals.applicationsPendingCount === 1 ? 'application needs' : 'applications need'} review`,
        detail: 'Eligibility + program-fit review pending',
        actionLabel: countLabel(totals.applicationsPendingCount),
        href: '/admin/command-center?queue=applications',
      },
      {
        id: 'certifications',
        icon: <Award size={14} aria-hidden />,
        iconColor: 'var(--wa-gold)',
        title: `${totals.certificationsPendingCount} ${totals.certificationsPendingCount === 1 ? 'certification' : 'certifications'} awaiting review`,
        detail: 'Verify proof to count toward outcomes',
        actionLabel: countLabel(totals.certificationsPendingCount),
        urgent: totals.certificationsPendingCount > 0,
        href: '/admin/certifications',
      },
      {
        id: 'interviewing',
        icon: <Briefcase size={14} aria-hidden />,
        iconColor: 'var(--wa-success)',
        title: `${totals.interviewingCount} ${totals.interviewingCount === 1 ? 'opportunity needs' : 'opportunities need'} interview prep`,
        detail: 'Phone screens, interviews, and offers to prep',
        actionLabel: countLabel(totals.interviewingCount),
        href: '/admin/command-center?queue=interviewing',
      },
    ];

    // Program Health — real per-program enrollment, scoped to this org.
    // The printed value is the enrolled count only; `pct` (share of enrolled
    // students) drives the bar width but is never printed beside the count,
    // where "10 · 100%" read as a health or completion score (number audit
    // 2026-09-20, S21).
    const programHealth: ProgramHealthDatum[] = data.programHealth.map((row) => ({
      label: row.label,
      value: `${row.count} enrolled`,
      pct: row.pct,
      color: 'success',
    }));

    const dateLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());

    return (
      <>
        {headlineLoadFailed ? (
          <span hidden data-portal-error-state="admin-command-center-headline-load" />
        ) : null}
        <CommandCenterKit
          dateLabel={dateLabel}
          kpis={kpis}
          queueItems={queueItems}
          programHealth={programHealth}
          placementsByMonth={placementsByMonth}
          placementsSubtitle={`${new Date().getUTCFullYear()} YTD · ${headline.placementsYtd} total`}
          addStudentHref="/admin/members/new"
        />
      </>
    );
  }

  return (
    <PortalPageFrame maxWidth="88rem">
      <PageHeader
        title="Command Center"
        subtitle="The exact queue to run a walk-in session: reply, check in, prep interviews, review applications."
      />
      <AdminCommandCenterClient key={`${request.queue ?? "all"}:${request.page}`} data={data} />
    </PortalPageFrame>
  );
}
