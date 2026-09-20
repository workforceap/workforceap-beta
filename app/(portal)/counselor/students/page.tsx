import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getTranslations } from 'next-intl/server';
import CounselorStudentsRosterClient from '@/components/portal/counselor/CounselorStudentsRosterClient';
import { loadCounselorRosterRiskAndActivity } from '@/lib/counselor/counselorStudentsRoster';
import CounselorRosterStats from '@/components/portal/counselor/CounselorRosterStats';
import { buildAttentionQueue, selectByReason, type AttentionQueue } from '@/lib/attention';
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

  // ── 30-day completion / placement counts from member_events ──
  const lookbackStart = new Date(now.getTime() - ROSTER_STAT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [recentCompletions, recentPlacements] = memberIds.length
    ? await Promise.all([
        prisma.memberEvent.count({
          where: {
            userId: { in: memberIds },
            eventName: 'course_completed',
            createdAt: { gte: lookbackStart },
          },
        }),
        prisma.memberEvent.count({
          where: {
            userId: { in: memberIds },
            eventName: 'placement_recorded',
            createdAt: { gte: lookbackStart },
          },
        }),
      ])
    : [0, 0];

  // Four tiles, each captioned with the rule it counts (counselor audit §6 item 4).
  // When the attention facts failed to load the tiles are withheld rather than
  // printing zeros the roster below would contradict.
  const rosterStats = attention
    ? buildCounselorRosterStats({ queue: attention, recentCompletions, recentPlacements })
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
            <div
              style={{
                background: 'var(--color-amber-light)',
                border: '1px solid color-mix(in srgb, var(--color-amber) 40%, transparent)',
                borderRadius: '1rem',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-amber)' }}>
                    {t('hotMemberQueue')}
                  </p>
                  <h2 style={{ margin: '0.2rem 0 0', fontSize: '1rem', fontWeight: 800, color: 'var(--color-amber)' }}>
                    {t('freshCompletionsNeedFollowup')}
                  </h2>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-amber)', fontSize: 24 }} aria-hidden="true">local_fire_department</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {hotQueue.map((action) => (
                  <Link
                    key={action.id}
                    href={`/counselor/students/${action.memberId}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      className={styles.hotQueueCardMobile}
                      style={{
                        borderRadius: '0.875rem',
                        border: '1px solid color-mix(in srgb, var(--color-amber) 15%, transparent)',
                        padding: '0.875rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                          {action.member.fullName ?? t('member')}
                        </p>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-amber)', whiteSpace: 'nowrap' }}>
                          {formatHotQueueTime(action.createdAt, t)}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-amber)' }}>{action.title}</p>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{action.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {assignments.length === 0 ? (
          <div style={{ padding: '0 1rem' }}>
            <PortalEmptyState
              title={t('noMembersAssignedYet')}
              description={t('membersAppearOnceAssigned')}
              icon={<span className="material-symbols-outlined" aria-hidden="true">person_search</span>}
              primaryAction={{ label: t('openMessages'), href: '/counselor/messages' }}
              secondaryAction={{ label: t('counselorGuide'), href: '/counselor/guide' }}
            />
          </div>
        ) : (
          <CounselorStudentsRosterClient rows={rosterRows} filterMeta={filterMeta} initialFilter={filter} />
        )}
      </div>

      {/* ── Desktop ─────────────────────────────────────────── */}
      <div className="wa-hidden md:wa-block">
        {hotQueue.length > 0 ? (
          <section style={{ marginBottom: '1.5rem' }}>
            <div
              className="portal-card portal-card--flat"
              style={{
                padding: '1.25rem',
                border: '1px solid color-mix(in srgb, var(--color-amber) 40%, transparent)',
                background: 'linear-gradient(180deg, var(--color-amber-light) 0%, var(--surface-container-lowest) 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.875rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-amber)' }}>
                    {t('hotMemberQueue')}
                  </p>
                  <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-amber)' }}>
                    {t('membersWhoJustBecameActionable')}
                  </h2>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-amber)', fontSize: 28 }} aria-hidden="true">local_fire_department</span>
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {hotQueue.map((action) => (
                  <Link
                    key={action.id}
                    href={`/counselor/students/${action.memberId}`}
                    className={styles.hotQueueCardDesktop}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: '1rem',
                      alignItems: 'center',
                      textDecoration: 'none',
                      border: '1px solid color-mix(in srgb, var(--color-amber) 15%, transparent)',
                      borderRadius: '0.9rem',
                      padding: '0.9rem 1rem',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-on-surface)' }}>
                        {action.member.fullName ?? t('member')}
                      </p>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-warning-on-surface)' }}>{action.title}</p>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>{action.description}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-warning-on-surface)' }}>
                        {formatHotQueueTime(action.createdAt, t)}
                      </p>
                      <span className="btn btn-primary btn-sm">{t('openMember')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {assignments.length === 0 ? (
          <PortalEmptyState
            title={t('noMembersAssignedYet')}
            description={t('membersAppearOnceAssigned')}
            icon={<span className="material-symbols-outlined" aria-hidden="true">person_search</span>}
            primaryAction={{ label: t('openMessages'), href: '/counselor/messages' }}
            secondaryAction={{ label: t('counselorGuide'), href: '/counselor/guide' }}
          />
        ) : (
          <CounselorStudentsRosterClient rows={rosterRows} filterMeta={filterMeta} initialFilter={filter} />
        )}
      </div>

    </PortalPageFrame>
  );
}
