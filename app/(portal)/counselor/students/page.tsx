import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Flame } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import CounselorRosterEmpty from '@/components/portal/counselor/CounselorRosterEmpty';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import CounselorStudentsRosterClient from '@/components/portal/counselor/CounselorStudentsRosterClient';
import { loadCounselorRosterRiskAndActivity } from '@/lib/counselor/counselorStudentsRoster';
import CounselorRosterStats from '@/components/portal/counselor/CounselorRosterStats';
import { buildAttentionQueue, selectByReason, type AttentionQueue } from '@/lib/attention/evaluate';
import { loadAttentionFacts } from '@/lib/attention/loadFacts';
import { buildCounselorRosterStats, ROSTER_STAT_LOOKBACK_DAYS } from '@/lib/counselor/rosterStats';
import styles from './students.module.css';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';

const HOT_QUEUE_LOOKBACK_DAYS = 7;
const UPCOMING_SESSION_DAYS = 7;

function formatHotQueueTime(date: Date, translate: (key: string, values?: { count: number }) => string): string {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return translate('hotQueueHoursAgo', { count: diffHours });
  const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  return translate('hotQueueDaysAgo', { count: diffDays });
}

type HotQueueTranslate = (key: string, values?: { count: number }) => string;

type HotQueueAction = {
  id: string;
  memberId: string;
  title: string;
  description: string;
  createdAt: Date;
  member: { fullName: string | null };
};

/**
 * "Hot member queue" — fresh completions that need a follow-up call. One kit
 * card per width (the page swaps them with `md:wa-hidden` / `md:wa-block`),
 * declared once as `.wa-kit-tone--warn` so the icon chip, the kicker and each
 * row's edge paint from the tone hook (counselor audit §4.4, deferred by
 * #2403). Names and times stay neutral `--wa-text` / `--wa-muted`; the legacy
 * amber palette (legacy tokens unmapped in dark mode) never enters the tree.
 */
function HotMemberQueue({
  variant,
  heading,
  actions,
  openLabel,
  translate,
}: {
  variant: 'mobile' | 'desktop';
  heading: string;
  actions: HotQueueAction[];
  openLabel?: string;
  translate: HotQueueTranslate;
}) {
  const headingId = `counselor-hot-queue-${variant}-heading`;
  return (
    <section
      className={`wa-kit-card wa-kit-tone--warn ${styles.hotQueue}`}
      data-hot-queue={variant}
      aria-labelledby={headingId}
    >
      <div className={styles.hotQueueHeader}>
        <span className="wa-kit-tone-icon" aria-hidden>
          <Flame size={18} />
        </span>
        <div className={styles.hotQueueHeading}>
          <p className={`wa-kit-tone-text ${styles.hotQueueKicker}`}>{translate('hotMemberQueue')}</p>
          <h2 id={headingId} className={styles.hotQueueTitle}>{heading}</h2>
        </div>
      </div>
      <div className={styles.hotQueueList}>
        {actions.map((action) => (
          <Link
            key={action.id}
            href={`/counselor/students/${action.memberId}`}
            className={`wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-tone-edge wa-kit-focus ${styles.hotQueueCard}`}
            data-hot-queue-card
          >
            <div className={styles.hotQueueCardBody}>
              <p className={styles.hotQueueName}>{action.member.fullName ?? translate('member')}</p>
              <p className="wa-kit-tone-text">{action.title}</p>
              <p className="wa-kit-meta">{action.description}</p>
            </div>
            <div className={styles.hotQueueCardAside}>
              <span className="wa-kit-meta">{formatHotQueueTime(action.createdAt, translate)}</span>
              {openLabel ? <span className="btn btn-primary btn-sm">{openLabel}</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function CounselorStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/students');

  if (!(await isCounselor(user.id)) && !(await isAdmin(user.id))) redirect('/dashboard');

  const counselor = await prisma.counselor.findFirst({
    where: { userId: user.id, active: true },
  });
  if (!counselor && !(await isAdmin(user.id))) redirect('/dashboard');

  const t = await getTranslations('counselor');
  const { filter } = await searchParams;

  const assignments = counselor
    ? await prisma.counselorAssignment.findMany({
      take: 500,
        where: { counselor: { userId: user.id, active: true }, active: true },
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              enrolledProgram: true,
              courseEnrollments: {
                orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
                select: { programSlug: true, curriculumVersion: true, isPrimary: true },
              },
              programInterest: true,
              assessmentScorePct: true,
              wioaReviewStatus: true,
              createdAt: true,
              memberProgramProgress: {
                select: { programSlug: true, averagePercent: true, coursesCompleted: true },
              },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      })
    : [];

  const memberIds = assignments.map((a) => a.memberId);

  const activityRiskByMember = await loadCounselorRosterRiskAndActivity(memberIds);

  /**
   * Oldest platform activity first — prioritize follow-up for dormant members.
   * Members with no recorded activity sort last: an unknown recency is not
   * evidence that they have gone quiet.
   */
  const activitySortKey = (memberId: string): number =>
    activityRiskByMember.get(memberId)?.lastActivityAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rosterAssignments = [...assignments].sort(
    (a, b) => activitySortKey(a.memberId) - activitySortKey(b.memberId),
  );

  const rosterRows = rosterAssignments.map((a) => {
    const meta = activityRiskByMember.get(a.memberId);
    const assignment = resolveTrainingProgressAssignment(
      a.member.enrolledProgram,
      a.member.courseEnrollments,
    );
    return {
      assignmentId: a.id,
      memberId: a.member.id,
      fullName: a.member.fullName,
      email: a.member.email,
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      programInterest: a.member.programInterest,
      assessmentScorePct: a.member.assessmentScorePct,
      wioaReviewStatus: a.member.wioaReviewStatus,
      memberProgramProgress: a.member.memberProgramProgress,
      riskScore: meta?.riskScore ?? null,
      riskLevel: meta?.riskLevel ?? 'LOW',
      lastActivityAt: meta?.lastActivityAt?.toISOString() ?? null,
    };
  });
  const hotQueueCutoff = new Date(Date.now() - HOT_QUEUE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const hotQueue = memberIds.length
    ? await prisma.memberNextBestAction.findMany({
      take: 500,
        where: {
          memberId: { in: memberIds },
          status: 'PENDING',
          icon: 'auto_awesome',
          createdAt: { gte: hotQueueCutoff },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          memberId: true,
          title: true,
          description: true,
          ctaLabel: true,
          ctaHref: true,
          createdAt: true,
          member: {
            select: {
              id: true,
              fullName: true,
              enrolledProgram: true,
              programInterest: true,
            },
          },
        },
      })
    : [];

  // ── Filter metadata: upcoming sessions & pending applications ──
  const now = new Date();
  const upcomingSessionCutoff = new Date(now.getTime() + UPCOMING_SESSION_DAYS * 24 * 60 * 60 * 1000);

  const [upcomingSessions, pendingApplications] = await Promise.all([
    memberIds.length
      ? prisma.mentorSession.findMany({
          take: 500,
          where: {
            memberId: { in: memberIds },
            scheduledAt: { gte: now, lte: upcomingSessionCutoff },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: { memberId: true },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.application.findMany({
          take: 500,
          where: {
            userId: { in: memberIds },
            status: 'PENDING',
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);

  const membersWithUpcomingSession = new Set(upcomingSessions.map((s) => s.memberId));
  const membersWithPendingApplication = new Set(pendingApplications.map((a) => a.userId));

  // ── Attention facts ─────────────────────────────────────
  // The same loader + evaluator every counselor surface uses (lib/attention),
  // run over exactly the members in this roster, so the tiles above the table
  // and the "At risk" chip agree with Inbox zero, Triage and the Work queue.
  let attention: AttentionQueue | null = null;
  try {
    attention = buildAttentionQueue(await loadAttentionFacts(memberIds, now), now);
  } catch (err) {
    console.error('[counselor:students] attention queue failed:', err);
  }
  const riskAlertMemberIds = attention
    ? new Set(selectByReason(attention, 'risk_alert').map((row) => row.memberId))
    : null;

  const filterMeta = rosterRows.map((r) => ({
    memberId: r.memberId,
    atRisk: riskAlertMemberIds
      ? riskAlertMemberIds.has(r.memberId)
      : r.riskScore != null && r.riskLevel !== 'LOW',
    upcomingSession: membersWithUpcomingSession.has(r.memberId),
    pendingApplication: membersWithPendingApplication.has(r.memberId),
  }));

  // ── 30-day completions (member_events) and placements (placement_records) ──
  // Placements come from the staff placement record (C05), not the
  // `placement_recorded` event: some writers never emit it and the admin
  // placed-outcome route emits another one on every edit. One row per member
  // (`userId @unique`), so the read is bounded by the roster size.
  const lookbackStart = new Date(now.getTime() - ROSTER_STAT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [recentCompletions, recentPlacementRows] = memberIds.length
    ? await Promise.all([
        prisma.memberEvent.count({
          where: {
            userId: { in: memberIds },
            eventName: 'course_completed',
            createdAt: { gte: lookbackStart },
          },
        }),
        prisma.placementRecord.findMany({
          where: {
            userId: { in: memberIds },
            placedAt: { gte: lookbackStart },
          },
          select: { startDateVerified: true },
        }),
      ])
    : [0, [] as Array<{ startDateVerified: boolean }>];
  const recentPlacements = recentPlacementRows.length;
  const recentPlacementsUnverified = recentPlacementRows.filter((row) => !row.startDateVerified).length;

  // Four tiles, each captioned with the rule it counts (counselor audit §6 item 4).
  // When the attention facts failed to load the tiles are withheld rather than
  // printing zeros the roster below would contradict.
  const rosterStats = attention
    ? buildCounselorRosterStats({ queue: attention, recentCompletions, recentPlacements, recentPlacementsUnverified })
    : null;

  return (
    <PortalPageFrame>
      <PageHeader title={t('myMembersTitle')} subtitle={t('membersAssignedForCoaching')} />
      {rosterStats ? (
        <CounselorRosterStats stats={rosterStats} className={styles.statsRow} />
      ) : (
        <span hidden data-portal-error-state="counselor-roster-attention-load" />
      )}
      {/* ── Mobile ─────────────────────────────────────────── */}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>

        {hotQueue.length > 0 ? (
          <div style={{ padding: '1rem 1rem 0' }}>
            <HotMemberQueue
              variant="mobile"
              heading={t('freshCompletionsNeedFollowup')}
              actions={hotQueue}
              translate={t}
            />
          </div>
        ) : null}

        {assignments.length === 0 ? (
          <div style={{ padding: '0 1rem' }}>
            <CounselorRosterEmpty variant={counselor ? 'unassigned' : 'noCounselorRecord'} headingAs="h2" />
          </div>
        ) : (
          <CounselorStudentsRosterClient rows={rosterRows} filterMeta={filterMeta} initialFilter={filter} />
        )}
      </div>

      {/* ── Desktop ─────────────────────────────────────────── */}
      <div className="wa-hidden md:wa-block">
        {hotQueue.length > 0 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <HotMemberQueue
              variant="desktop"
              heading={t('membersWhoJustBecameActionable')}
              actions={hotQueue}
              openLabel={t('openMember')}
              translate={t}
            />
          </div>
        ) : null}

        {assignments.length === 0 ? (
          <CounselorRosterEmpty variant={counselor ? 'unassigned' : 'noCounselorRecord'} headingAs="h2" />
        ) : (
          <CounselorStudentsRosterClient rows={rosterRows} filterMeta={filterMeta} initialFilter={filter} />
        )}
      </div>

    </PortalPageFrame>
  );
}
