import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { Activity, Bell, TriangleAlert, UserPlus, Briefcase, Award } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getTriageDigest, type TriageDigest } from '@/lib/admin/triageDigest';
import { getAdminCommandCenter, type AdminCommandCenter } from '@/lib/admin/commandCenter';
import { loadAdminApprovalQueue } from '@/lib/admin/loadAdminApprovalQueue';
import {
  adminApplicationsQueueCopy,
  emptyAdminApprovalQueue,
  type AdminApprovalQueue,
} from '@/lib/admin/adminApprovalQueue';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { getAdminAttention } from '@/lib/attention/admin';
import { buildAdminAttentionTiles, buildCommandCenterAttentionRows } from '@/lib/attention/adminViews';
import { emptyAttentionQueue, type AttentionQueue } from '@/lib/attention/evaluate';
import { countThreadsWithSlaBreach } from '@/lib/messages/superAdminMessageQueries';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import TriageDigestSection from '@/components/admin/TriageDigestSection';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import {
  CommandCenterKit,
  type CommandCenterQueueItem,
  type CommandCenterKpiItem,
  type CommandCenterSystemHealthRow,
  type ProgramHealthDatum,
} from '@/components/portal/kit/pages/admin/CommandCenterKit';
import type { ChartDatum } from '@/components/portal/kit';
import { CounselorApprovalQueue } from '@/components/portal/kit/pages/counselor/CounselorApprovalQueue';
import { pluralCount } from '@/lib/i18n/pluralCount';
import { buildCommandCenterSystemHealth, COMMAND_CENTER_CRON_ROWS, type CronRunSnapshot } from '@/lib/admin/commandCenterHealth';
import { PROGRAM_HEALTH_CAPTION } from '@/lib/admin/commandCenterHelpers';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Today',
    description: 'Who needs you today, plus the day-to-day actions you reach for most.',
    path: '/admin',
  });
}

/**
 * Today screen — the admin home for a non-technical workforce-development
 * operator.
 *
 * Default (kit) view, top to bottom (WAP-190): the org-wide "Waiting on your
 * decision" list (every PENDING application and every WIOA intake waiting on
 * staff, oldest first, each row opening the screen where it is decided),
 * then "What needs you today" (applications split into waiting on your
 * decision / waiting on the applicant, certificates, new applicants with no
 * counselor, replies owed, risk, quiet, interview prep), and only then the
 * KPI strip, placements trend and program / system context.
 *
 * `?ui=legacy` keeps the older Today (triage digest, today's in-office
 * session count, three primary actions).
 */
export default async function AdminTodayPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  // ?ui=kit DEFAULT PATH — the admin HOME renders the Command Center kit in
  // its queues-first layout: the org-wide decision list, then the "What needs
  // you today" work queue, then the KPI strip, Program Health and Placements by
  // month (WAP-190). Fed by the real loaders plus a few cheap org-scoped counts
  // — no fabricated numbers. Runs AFTER the auth/role guard (access control
  // preserved). Legacy "Today" view via ?ui=legacy.
  if (requestedUi !== 'legacy') {
    const yearStart = new Date(new Date().getUTCFullYear(), 0, 1);
    let adminHomeLoadFailed = false;
    let workflowHealthLoadFailed = false;

    const { data, headline } = await withAuthGuc(async () => {
      const orgId = await getActorOrganizationId(user.id);
      const [center, attention, placementRows, recentCronErrors, slaBreaches48h, cronRuns, approvals] = await Promise.all([
        getAdminCommandCenter(user.id, { perSectionLimit: 8 }).catch((error): AdminCommandCenter => {
          adminHomeLoadFailed = true;
          console.error('[admin/page] command center load failed', error);
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
        }),
        // "Who needs attention" + the active-student count come from the shared
        // attention model — the same numbers /admin/overview prints, over the
        // member-only roster (staff accounts never count as members here).
        getAdminAttention(scope).catch((error): AttentionQueue => {
          adminHomeLoadFailed = true;
          console.error('[admin/page] attention model load failed', error);
          return emptyAttentionQueue();
        }),
        // Placements YTD over member-role accounts only, the same roster the
        // attention model and Active Students use (number audit 2026-09-20, F1).
        prisma.placementRecord
          .findMany({
            where: { user: { organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE }, placedAt: { gte: yearStart } },
            select: { placedAt: true },
          })
          .catch((error) => {
            adminHomeLoadFailed = true;
            console.error('[admin/page] placement headline load failed', error);
            return [] as Array<{ placedAt: Date }>;
          }),
        // "System health" signals — same cheap patterns app/admin/overview/page.tsx
        // already runs after its own auth guard (one count + one existing helper,
        // no new expensive queries).
        scope.superAdmin ? prisma.workflowDiagnostic
          .count({
            where: {
              status: { in: ['error', 'errored'] },
              createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          })
          .catch((error) => {
            workflowHealthLoadFailed = true;
            console.error('[admin/page] workflow diagnostic count failed', error);
            return 0;
          }) : Promise.resolve(null),
        countThreadsWithSlaBreach(48, orgId).catch((error) => {
          adminHomeLoadFailed = true;
          console.error('[admin/page] message SLA count failed', error);
          return 0;
        }),
        // Cron freshness for the "System health" rows: one indexed
        // findFirst per job on CronExecution (the table /admin/crons reads).
        // Platform-wide, so loaded for platform admins only — tenant admins
        // get an honest "Not checked here" pointer instead.
        scope.superAdmin
          ? Promise.all(COMMAND_CENTER_CRON_ROWS.map((def) => prisma.cronExecution.findFirst({
              where: { jobName: def.jobName },
              orderBy: { startedAt: 'desc' },
              select: { jobName: true, status: true, startedAt: true, completedAt: true },
            }))).then((rows): CronRunSnapshot[] => rows.filter((row): row is CronRunSnapshot => row != null))
            .catch((error): CronRunSnapshot[] | null => {
              console.error('[admin/page] cron freshness load failed', error);
              return null;
            })
          : Promise.resolve<CronRunSnapshot[] | null>(null),
        // "Waiting on your decision": every decision waiting in the org, not
        // the enrolled-only admin caseload (lib/admin/adminApprovalQueue.ts).
        // A core loader like the others: a failure shows the error state
        // rather than a list that reads as "nothing is waiting".
        loadAdminApprovalQueue(scope).catch((error): AdminApprovalQueue => {
          adminHomeLoadFailed = true;
          console.error('[admin/page] approval queue load failed', error);
          return emptyAdminApprovalQueue();
        }),
      ]);
      return { data: center, headline: { attention, placementRows, recentCronErrors, slaBreaches48h, cronRuns, approvals } };
    }).catch((error) => {
      adminHomeLoadFailed = true;
      console.error('[admin/page] scoped command center load failed', error);
      return {
        data: {
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
        } as AdminCommandCenter,
        headline: {
          attention: emptyAttentionQueue(),
          placementRows: [] as Array<{ placedAt: Date }>,
          recentCronErrors: 0,
          slaBreaches48h: 0,
          cronRuns: null as CronRunSnapshot[] | null,
          approvals: emptyAdminApprovalQueue(),
        },
      };
    });

    if (adminHomeLoadFailed) return <AdminDataLoadError title="Command center unavailable" message="Current queues and dashboard figures could not be loaded. Please reload this page." />;

    const { totals } = data;
    const attentionTiles = buildAdminAttentionTiles(headline.attention);
    const attentionRows = buildCommandCenterAttentionRows(headline.attention);
    const attentionIcon = { risk_alert: TriangleAlert, no_activity_30d: Activity, new_no_counselor: UserPlus } as const;

    // Placements by month (Jan→current month, YTD).
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const thisMonth = new Date().getUTCMonth();
    const monthBuckets = new Array(thisMonth + 1).fill(0);
    for (const row of headline.placementRows) {
      const m = row.placedAt.getUTCMonth();
      if (m >= 0 && m <= thisMonth) monthBuckets[m] += 1;
    }
    const placementsByMonth: ChartDatum[] = monthBuckets.map((value, i) => ({ label: monthLabels[i], value }));
    const placementsYtd = headline.placementRows.length;



    // Cheap trend series for the "Placements YTD" sparkline — reuses the
    // month buckets already computed for the placements-trend chart above
    // (no extra query).
    const placementsSpark = monthBuckets.length > 1 ? monthBuckets : undefined;

    // Attention tiles carry their definition in the caption so this page and
    // /admin/overview can never disagree silently ("risk alert" is a saved
    // alert; "quiet 30+ days" is an activity heuristic).
    const kpis: CommandCenterKpiItem[] = [
      {
        label: 'Active Students',
        value: headline.attention.totals.enrolled,
        delta: 'Members with an enrolled program',
        deltaTone: 'muted',
      },
      {
        label: 'Placements YTD',
        value: placementsYtd,
        spark: placementsSpark ? { series: placementsSpark } : undefined,
      },
      { label: 'Interview prep', value: totals.interviewingCount },
      ...attentionTiles
        .filter((tile) => tile.key !== 'new_no_counselor')
        .map((tile): CommandCenterKpiItem => ({
          label: tile.label,
          value: tile.value,
          tone: tile.value > 0 ? 'alert' : undefined,
          delta: tile.definition,
          deltaTone: 'muted',
        })),
    ];

    const attentionItems = attentionRows.map((row): CommandCenterQueueItem => {
      const Icon = attentionIcon[row.id];
      return {
        id: row.id,
        icon: <Icon size={14} aria-hidden />,
        iconColor: 'var(--wa-accent)',
        title: row.title,
        detail: row.detail,
        actionLabel: row.actionLabel,
        urgent: row.urgent,
        href: row.href,
        count: row.count,
        links: row.members
          ? {
              label: row.members.label,
              items: row.members.items.map((member) => ({ label: member.name, href: member.href })),
              more: row.members.more,
            }
          : undefined,
      };
    });
    const attentionItem = (id: (typeof attentionRows)[number]['id']) => attentionItems.filter((item) => item.id === id);

    // Applications from the same loader as the list above it, so the row and
    // the list count the same applications: waiting on your decision
    // (PENDING) and waiting on the applicant (NEEDS_INFO) are two numbers.
    const approvals = headline.approvals;
    const applicationsWaiting = approvals.applications.waiting;
    const applicationsCopy = adminApplicationsQueueCopy(approvals);

    // Decisions first, then people who need a person, then prep.
    const queueItems: CommandCenterQueueItem[] = [
      {
        id: 'applications',
        icon: <UserPlus size={14} aria-hidden />,
        iconColor: 'var(--wa-gold)',
        title: applicationsCopy.title,
        detail: applicationsCopy.detail,
        actionLabel: pluralCount(applicationsWaiting, 'item'),
        urgent: applicationsCopy.urgent,
        href: '/admin/command-center?queue=applications',
        count: applicationsWaiting,
      },
      {
        id: 'certifications',
        icon: <Award size={14} aria-hidden />,
        iconColor: 'var(--wa-gold)',
        title: `${totals.certificationsPendingCount} ${totals.certificationsPendingCount === 1 ? 'certification' : 'certifications'} awaiting review`,
        detail: 'Verify proof to count toward outcomes',
        actionLabel: pluralCount(totals.certificationsPendingCount, 'item'),
        urgent: totals.certificationsPendingCount > 0,
        href: '/admin/certifications',
        count: totals.certificationsPendingCount,
      },
      ...attentionItem('new_no_counselor'),
      {
        id: 'needs-reply',
        icon: <Bell size={14} aria-hidden />,
        iconColor: 'var(--wa-info)',
        title: `${totals.needsReplyCount} ${totals.needsReplyCount === 1 ? 'conversation needs' : 'conversations need'} a reply`,
        detail: 'Members are waiting on a response',
        actionLabel: pluralCount(totals.needsReplyCount, 'item'),
        href: '/admin/command-center?queue=needs-reply',
        count: totals.needsReplyCount,
      },
      ...attentionItem('risk_alert'),
      ...attentionItem('no_activity_30d'),
      {
        id: 'interviewing',
        icon: <Briefcase size={14} aria-hidden />,
        iconColor: 'var(--wa-success)',
        title: `${totals.interviewingCount} ${totals.interviewingCount === 1 ? 'opportunity needs' : 'opportunities need'} interview prep`,
        detail: 'Phone screens, interviews, and offers to prep',
        actionLabel: pluralCount(totals.interviewingCount, 'item'),
        href: '/admin/command-center?queue=interviewing',
        count: totals.interviewingCount,
      },
    ];

    // Every row is a real state from data loaded above, or an honest
    // "Not checked here" that links to where the check lives. Global workflow
    // diagnostics (cron freshness, platform errors) are computed for platform
    // admins only, never ordinary tenant admins (lib/admin/commandCenterHealth).
    const systemHealth: CommandCenterSystemHealthRow[] = buildCommandCenterSystemHealth({
      superAdmin: scope.superAdmin,
      now: new Date(),
      slaBreaches48h: headline.slaBreaches48h,
      recentCronErrors: headline.recentCronErrors,
      workflowHealthLoadFailed,
      cronRuns: headline.cronRuns,
    });

    // Count only; `pct` is the share of enrolled students and only sizes the
    // bar (number audit 2026-09-20, S21). A share is not a state, so the bars
    // carry no tone and paint the kit's neutral accent — the dropped
    // `color: 'success'` made every program read as healthy.
    const programHealth: ProgramHealthDatum[] = data.programHealth.map((row) => ({
      label: row.label,
      value: `${row.count} enrolled`,
      pct: row.pct,
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
        {adminHomeLoadFailed ? <span hidden data-portal-error-state="admin-command-center-load" /> : null}
        <CommandCenterKit
          title="Today"
          dateLabel={dateLabel}
          queuesFirst
          lead={
            <CounselorApprovalQueue
              queue={approvals.queue}
              total={approvals.total}
              rowHrefs={approvals.rowHrefs}
              retryHref="/admin"
              description="Every application and intake check in your organization that is waiting on a staff decision, oldest first. Each row opens the screen where you decide it."
              emptyDescription="No application or intake check in your organization is waiting on a staff decision."
              moreLinks={[
                { label: 'Applications', href: '/admin/command-center?queue=applications' },
                { label: 'Funding eligibility', href: '/admin/wioa-screening' },
              ]}
            />
          }
          kpis={kpis}
          queueItems={queueItems}
          programHealth={programHealth}
          programHealthCaption={PROGRAM_HEALTH_CAPTION}
          placementsByMonth={placementsByMonth}
          placementsSubtitle={`${new Date().getUTCFullYear()} YTD · ${placementsYtd} total`}
          addStudentHref="/admin/members/new"
          systemHealth={systemHealth}
        />
      </>
    );
  }

  // "Today" is the operator's local day. Server runs in UTC; using UTC day
  // start is good enough for a count at-a-glance and avoids a tz dependency.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  // Server components render outside the root layout's gucContextStorage.run()
  // scope (RSC renders the returned JSX lazily), so re-establish the auth GUC
  // context here — otherwise these queries run with anonymous RLS credentials.
  const [triageDigest, sessionsTodayRows] = await withAuthGuc(() => Promise.all([
    getTriageDigest(scope).catch((reason): TriageDigest => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error('[admin/page] triageDigest failed', msg);
      return { buckets: [], allClear: true };
    }),
    withAdminPageScope(scope, (db) => db.memberEvent
      .findMany({
        where: {
          eventName: 'ai_tool_run_completed',
          sessionId: { not: null },
          createdAt: { gte: startOfToday },
          ...inheritUserOrg(scope),
        },
        select: { sessionId: true },
      })
      .catch((reason) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        console.error('[admin/page] sessionsToday failed', msg);
        return [] as Array<{ sessionId: string | null }>;
      })),
  ]));

  const sessionsToday = new Set(
    sessionsTodayRows.map((row) => row.sessionId).filter((id): id is string => Boolean(id))
  ).size;

  const primaryActions: Array<{ label: string; href: string; icon: string }> = [
    { label: 'Open command center', href: '/admin/command-center', icon: 'assignment_ind' },
    { label: 'Review applications', href: '/admin/command-center', icon: 'fact_check' },
    { label: 'Message a student', href: '/admin/messages', icon: 'mark_email_unread' },
  ];

  return (
    <PortalPageFrame>
      <PageHeader
        title="Today"
        subtitle="The people who need you, plus the things you do every day."
        action={
          <Link
            href="/admin/overview"
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--color-on-surface-variant)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            See full overview &rarr;
          </Link>
        }
      />

      {/* "Who needs you today" — the only surface dad needs at the top. */}
      <TriageDigestSection digest={triageDigest} />

      {/* Today's in-office session count — one line, links to history. */}
      <section style={{ padding: '0 1.5rem', marginBottom: '1.5rem' }}>
        <Link
          href="/admin/sessions"
          className="portal-card portal-card--flat"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.95rem',
              color: 'var(--color-on-surface)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--wa-accent-text)' }}
              aria-hidden
            >
              event_available
            </span>
            <span>
              <strong>{sessionsToday}</strong>{' '}
              {sessionsToday === 1 ? 'in-office session' : 'in-office sessions'} today
            </span>
          </span>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--wa-accent-text)',
            }}
          >
            View sessions &rarr;
          </span>
        </Link>
      </section>

      {/* Three big primary actions. Dad-sized targets. */}
      <section style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          {primaryActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="btn btn-primary"
              style={{
                justifyContent: 'center',
                gap: '0.6rem',
                padding: '1.1rem 1.25rem',
                fontSize: '1rem',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1.2rem' }}
                aria-hidden
              >
                {action.icon}
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </PortalPageFrame>
  );
}
