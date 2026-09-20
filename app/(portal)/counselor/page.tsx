import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { COUNSELOR_ROSTER_CAP } from '@/lib/db/queryCaps';
import Link from 'next/link';
import { counselorAffiliationLabel } from '@/lib/counselor/counselorLabels';
import { getCounselorCommandCenter } from '@/lib/counselor/commandCenter';
import CounselorCommandCenter from '@/components/portal/counselor/CounselorCommandCenter';
import CounselorPriorityQueue from '@/components/portal/counselor/CounselorPriorityQueue';
import AtRiskSummaryWidget from '@/components/portal/counselor/AtRiskSummaryWidget';
import { getCounselorPriorityQueue } from '@/lib/counselor/priorityQueue';
import CounselorPortalVoiceBlock from '@/components/portal/CounselorPortalVoiceBlock';
import { counselorStudentStatusBadge, counselorStudentStatusBadgeVariant } from '@/lib/counselor/memberStatus';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import StatusBadge from '@/components/portal/StatusBadge';
import { getGoodTimeOfDayPhrase } from '@/lib/time/greeting';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  computeTrainingProgress,
  resolveTrainingProgressAssignment,
} from '@/lib/member/trainingProgress';
import PortalCard from '@/components/portal/ui/PortalCard';
import {
  CounselorHomeKit,
  type CounselorQueueRow,
  type CounselorSessionRow,
} from '@/components/portal/kit/pages/counselor/CounselorHomeKit';

// Quick Links accents: each link declares which severity it wants to signal
// (accent/green/blue/gold/error) so At-Risk and Inactive Members read as
// urgent instead of blending into the default brand-accent color.
const QUICK_LINK_ACCENT_COLORS: Record<string, string> = {
  accent: 'var(--color-accent)',
  green: 'var(--color-green)',
  blue: 'var(--color-blue)',
  gold: 'var(--color-gold)',
  error: 'var(--wa-danger, #dc2626)',
};

export default async function CounselorPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor');

  const allowed = (await isCounselor(user.id)) || (await isAdmin(user.id));
  if (!allowed) redirect('/dashboard');

  const requestedUi = (await searchParams)?.ui ?? null;

  // ── ?ui=kit LEAN PATH ──────────────────────────────────────────────────
  // Runs AFTER the auth/role guard (access control preserved) but BEFORE the
  // heavy data pipeline (counselorAssignment.findMany + the message
  // reply-scan), which stalls on the demo DB. Renders the redesigned counselor
  // overview kit from a handful of cheap queries only: a single count for the
  // assigned-members KPI, plus the already-try/catch-wrapped command center +
  // priority queue helpers (which return safe empty shapes on failure). No
  // $transaction, no external calls, no unbounded scans.
  // v2 kit is the DEFAULT counselor overview; legacy via ?ui=legacy.
  if (requestedUi !== 'legacy') {
    const kitLoadErrors: string[] = [];
    const kitIsAdmin = await isAdmin(user.id);
    const kitCounselor = await prisma.counselor.findFirst({
      where: { userId: user.id, active: true },
      select: { id: true },
    });

    const assignedCount = kitCounselor
      ? await prisma.counselorAssignment.count({
          where: { counselor: { userId: user.id, active: true }, active: true },
        })
      : 0;

    let kitCenter;
    try {
      kitCenter = await getCounselorCommandCenter(user.id, {
        isAdmin: kitIsAdmin && !kitCounselor,
        perSectionLimit: 5,
      });
    } catch {
      kitLoadErrors.push('counselor-command-center-load-failed');
      kitCenter = {
        needsReply: [],
        atRisk: [],
        interviewing: [],
        totals: { needsReplyCount: 0, atRiskCount: 0, interviewingCount: 0, slaBreachCount: 0 },
      };
    }

    let kitQueue: Awaited<ReturnType<typeof getCounselorPriorityQueue>> = {
      rows: [],
      totals: { critical: 0, warning: 0, ontrack: 0, total: 0 },
    };
    try {
      kitQueue = await getCounselorPriorityQueue(user.id, { isAdmin: kitIsAdmin && !kitCounselor });
    } catch (err) {
      console.error('[counselor:kit] priority queue failed:', err);
      kitLoadErrors.push('counselor-priority-queue-load-failed');
    }

    const kitQueueRows: CounselorQueueRow[] = kitQueue.rows.slice(0, 12).map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      bucket: row.bucket,
      blockerReason: row.blockerReason,
      // The kit prints this verbatim in the row meta; hand it a title, not a slug.
      enrolledProgram: row.enrolledProgram ? programDisplayTitle(row.enrolledProgram) : row.enrolledProgram,
      daysSinceLogin: row.daysSinceLogin,
      hoursWaitingReply: row.hoursWaitingReply,
    }));

    const kitSessions: CounselorSessionRow[] = kitCenter.interviewing.map((row) => ({
      memberId: row.memberId,
      memberName: row.memberName,
      role: row.role,
      lastRunAt: row.lastRunAt,
    }));

    return (
      <>
        {kitLoadErrors.map((state) => (
          <span key={state} hidden data-portal-error-state={state} />
        ))}
        <CounselorHomeKit
        assignedCount={assignedCount}
        atRiskCount={kitCenter.totals.atRiskCount}
        needsReplyCount={kitCenter.totals.needsReplyCount}
        onTrackCount={kitQueue.totals.ontrack}
        slaBreachCount={kitCenter.totals.slaBreachCount}
        queueRows={kitQueueRows}
        queueTotal={kitQueue.totals.total}
        sessions={kitSessions}
        bucketCounts={{
          critical: kitQueue.totals.critical,
          warning: kitQueue.totals.warning,
          ontrack: kitQueue.totals.ontrack,
        }}
        />
      </>
    );
  }

  const counselor = await prisma.counselor.findFirst({
    where: { userId: user.id, active: true },
    include: { partner: { select: { name: true } } },
  });

  if (!counselor && !(await isAdmin(user.id))) redirect('/dashboard');

  const assignmentWhere = {
    counselor: { userId: user.id, active: true },
    active: true,
  };
  const assignmentTotal = counselor
    ? await prisma.counselorAssignment.count({ where: assignmentWhere })
    : 0;
  const assignments = counselor
    ? await prisma.counselorAssignment.findMany({
      take: COUNSELOR_ROSTER_CAP,
        where: assignmentWhere,
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              programInterest: true,
              enrolledProgram: true,
              courseEnrollments: {
                orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
                select: {
                  programSlug: true,
                  curriculumVersion: true,
                  isPrimary: true,
                },
              },
              assessmentScorePct: true,
              memberProgramProgress: {
                select: { programSlug: true, averagePercent: true, coursesCompleted: true },
              },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
      })
    : [];

  let messagesNeedingReply = 0;
  if (counselor && assignments.length > 0) {
    const memberIds = assignments.map((a) => a.memberId);
    const threads = await prisma.messageThread.findMany({
      take: COUNSELOR_ROSTER_CAP,
      where: { memberId: { in: memberIds }, kind: 'member' },
      select: { id: true, memberId: true },
    });
    const threadIds = threads.map((t) => t.id);
    if (threadIds.length > 0) {
      // Batch: get the latest createdAt per thread, then fetch those messages in one query.
      const latestByThread = await prisma.message.groupBy({
        by: ['threadId'],
        where: { threadId: { in: threadIds } },
        _max: { createdAt: true },
      });
      const latestPairs = latestByThread
        .map((g) => ({ threadId: g.threadId, createdAt: g._max.createdAt }))
        .filter((p): p is { threadId: string; createdAt: Date } => p.createdAt !== null);
      const latestMessages = latestPairs.length > 0
        ? await prisma.message.findMany({
          take: COUNSELOR_ROSTER_CAP,
            where: {
              OR: latestPairs.map((p) => ({ threadId: p.threadId, createdAt: p.createdAt })),
            },
            select: { threadId: true, authorId: true, createdAt: true },
          })
        : [];
      // Pick one message per thread (in case of identical createdAt collisions).
      const latestByThreadId = new Map<string, { authorId: string | null }>();
      for (const m of latestMessages) {
        if (!latestByThreadId.has(m.threadId)) {
          latestByThreadId.set(m.threadId, { authorId: m.authorId });
        }
      }
      for (const t of threads) {
        if (!t.memberId) continue;
        const last = latestByThreadId.get(t.id);
        if (last?.authorId === t.memberId) messagesNeedingReply += 1;
      }
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });
  if (!dbUser) redirect('/dashboard');

  const t = await getTranslations('counselor');

  const affiliation = counselor ? counselorAffiliationLabel(counselor.partner?.name) : 'WorkforceAP';

  const enrolledCount = assignments.filter((a) => a.member.enrolledProgram).length;
  const needsAttentionCount = assignments.filter((a) => !a.member.enrolledProgram && !a.member.programInterest).length;

  const firstName = (dbUser.fullName ?? t('counselorNameFallback')).split(' ')[0];
  const goodTimePhrase = getGoodTimeOfDayPhrase();

  // Today's priorities — needs-reply, at-risk, and interviewing rows.
  const isAdminUser = await isAdmin(user.id);
  let commandCenterLoadFailed = false;
  let commandCenter;
  try {
    commandCenter = await getCounselorCommandCenter(user.id, {
      isAdmin: isAdminUser && !counselor,
      perSectionLimit: 5,
    });
  } catch {
    commandCenterLoadFailed = true;
    // Graceful fallback if the command center query fails (e.g. schema drift)
    commandCenter = { needsReply: [], atRisk: [], interviewing: [], totals: { needsReplyCount: 0, atRiskCount: 0, interviewingCount: 0, slaBreachCount: 0 } };
  }

  // Sprint R5 — tactical priority queue (red/yellow/green) that augments the
  // hot-queue strip below. Falls back to an empty queue if the underlying
  // triage query fails so the page never blows up.
  let priorityQueue: Awaited<ReturnType<typeof getCounselorPriorityQueue>> = {
    rows: [],
    totals: { critical: 0, warning: 0, ontrack: 0, total: 0 },
  };
  let priorityQueueLoadFailed = false;
  try {
    priorityQueue = await getCounselorPriorityQueue(user.id, {
      isAdmin: isAdminUser && !counselor,
    });
  } catch (err) {
    priorityQueueLoadFailed = true;
    console.error('[counselor] priority queue failed:', err);
  }

  const statCards = [
    { icon: 'groups', label: t('yourMembers'), value: assignments.length, bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', iconColor: 'var(--color-accent)' },
    { icon: 'mark_email_unread', label: t('awaitingReply'), value: messagesNeedingReply, bg: 'color-mix(in srgb, var(--color-blue) 12%, transparent)', iconColor: 'var(--color-blue)' },
    { icon: 'school', label: t('inAProgram'), value: enrolledCount, bg: 'color-mix(in srgb, var(--color-green) 12%, transparent)', iconColor: 'var(--color-green)' },
    { icon: 'warning', label: t('noProgramYet'), value: needsAttentionCount, bg: 'color-mix(in srgb, var(--color-gold) 14%, transparent)', iconColor: 'var(--color-gold)' },
  ];

  return (
    <PortalPageFrame maxWidth="76rem">
      {commandCenterLoadFailed ? <span hidden data-portal-error-state="counselor-legacy-command-center-load" /> : null}
      {priorityQueueLoadFailed ? <span hidden data-portal-error-state="counselor-legacy-priority-queue-load" /> : null}
      <h1 className="wa-sr-only">
        {t('counselorDashboard')} — {firstName}
      </h1>

      {/* ── Sprint R5: tactical priority queue (CRITICAL / WARNING / ON TRACK).
          Mounted ABOVE the hot-queue strip — different abstraction (tactical
          view + bulk-send templates) vs the alert feed below. ── */}
      <div style={{ padding: '0 clamp(1rem, 4vw, 1.5rem)' }}>
        <CounselorPriorityQueue rows={priorityQueue.rows} totals={priorityQueue.totals} />
      </div>

      {/* ── Today's priorities — Counselor Command Center.
          Sits above both mobile + desktop layouts so it shows everywhere.
          Per /plan-ceo-review (2026-04-26) brutal multi-persona review. ── */}
      <div style={{ padding: '0 clamp(1rem, 4vw, 1.5rem)' }}>
        <CounselorCommandCenter data={commandCenter} />
      </div>

      {/* ── At-Risk Summary Widget ── */}
      <div style={{ padding: '0 clamp(1rem, 4vw, 1.5rem)', marginTop: '1.5rem' }}>
        <AtRiskSummaryWidget />
      </div>

      {/* ── Mobile Counselor View (≤640px) ── */}
      <div className="wa-block md:wa-hidden portal-mobile-content">
        {/* Hero */}
        <div className="portal-pad-x" style={{ paddingTop:"1.5rem", paddingBottom:"0.5rem" }}>
          <p className="wa-text-[13px] wa-uppercase wa-tracking-[0.12em] wa-font-semibold" style={{ color: 'var(--color-accent)', marginBottom:"0.5rem" }}>{t('counselorDashboard')}</p>
          <h2 className="wa-text-3xl wa-font-extrabold wa-tracking-tight text-on-surface wa-leading-tight">
            {goodTimePhrase},{' '}
            <span style={{ color: 'var(--color-accent)' }}>{firstName}</span>
          </h2>
        </div>
        <div className="portal-pad-x" style={{ marginBottom: '1rem' }}>
          <details className="portal-card portal-card--compact">
            <summary className="portal-card__summary">
              {t('counselorAssistant')}
              <span className="portal-card__summary-hint">{t('tapToOpen')}</span>
            </summary>
            <div className="portal-card__body">
              <CounselorPortalVoiceBlock />
            </div>
          </details>
        </div>
        {/* Stats grid */}
        <div className="portal-pad-x" style={{ marginTop:"1rem", display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"1rem", marginBottom:"1.5rem" }}>
          <div className="wa-text-white" style={{gridColumn:"span 2", borderRadius:"0.75rem", padding:"1.25rem", position:"relative", overflow:"hidden", background: 'var(--color-accent)'}}>
            <div style={{ position:"relative", zIndex:10 }}>
              <p className="wa-text-[13px] wa-uppercase wa-tracking-widest" style={{ opacity:0.85, marginBottom:"0.25rem" }}>{t('yourMembers')}</p>
              <p className="wa-text-4xl wa-font-bold wa-tracking-tighter" style={{ fontVariantNumeric: 'tabular-nums' }}>{assignments.length}</p>
            </div>
            <span className="material-symbols-outlined" style={{ position: 'absolute', bottom: '-1rem', right: '-1rem', fontSize: '8rem', opacity: 0.07, color: '#fff', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">group</span>
          </div>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--gold">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">school</span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums' }}>{enrolledCount}</p>
            <p className="portal-metric-card__label">{t('inAProgram')}</p>
          </div>
          <div className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">mark_email_unread</span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums', color: messagesNeedingReply > 0 ? 'var(--color-accent)' : undefined }}>{messagesNeedingReply}</p>
            <p className="portal-metric-card__label">{t('awaitingReply')}</p>
          </div>
        </div>
        {/* Student roster */}
        <div className="portal-pad-x">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
            <h3 className="wa-text-lg wa-font-bold wa-tracking-tight">{t('activeRoster')}</h3>
            <span className="material-symbols-outlined text-on-surface-variant wa-text-xl" aria-hidden="true">sort</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            {assignments.length === 0 ? (
              <PortalEmptyState
                title={t('noMembersAssignedYet')}
                description={t('membersAppearOnceAssignedMobile')}
                icon={<span className="material-symbols-outlined" aria-hidden="true">person_search</span>}
                primaryAction={{ label: t('counselorGuide'), href: '/counselor/guide' }}
                secondaryAction={{ label: t('resources'), href: '/counselor/resources' }}
              />
            ) : (
              assignments.map((a) => {
                const assignment = resolveTrainingProgressAssignment(
                  a.member.enrolledProgram,
                  a.member.courseEnrollments,
                );
                const rawProgram = assignment.programSlug ?? a.member.programInterest;
                const prog = rawProgram
                  ? programDisplayTitle(rawProgram)
                  : t('unknownProgram');
                const enrolledSlug = assignment.programSlug;
                const program = enrolledSlug ? getProgramBySlug(enrolledSlug) : null;
                const progress = computeTrainingProgress({
                  enrolledProgram: enrolledSlug,
                  curriculumVersion: assignment.curriculumVersion,
                  coursesCompleted: null,
                  liveProgress: a.member.memberProgramProgress,
                });
                const trainingProgressPct = program && progress.totalCourses > 0 ? progress.pct : null;
                const rosterBadge = counselorStudentStatusBadge({
                  enrolledProgram: enrolledSlug,
                  assessmentScorePct: a.member.assessmentScorePct,
                });
                const statusLabel = rosterBadge.label;
                const badgeVariant = counselorStudentStatusBadgeVariant({
                  enrolledProgram: enrolledSlug,
                  assessmentScorePct: a.member.assessmentScorePct,
                });
                return (
                  <Link
                    key={a.id}
                    href={`/counselor/students/${a.memberId}`}
                    className="portal-kpi-card active:scale-[0.98] wa-transition-all"
                    style={{
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      textDecoration: 'none',
                    }}
                  >
                    <div className="bg-surface-container-high" style={{ width:"3rem", height:"3rem", borderRadius:"0.75rem", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">person</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <h4 title={a.member.fullName ?? undefined} className="wa-font-bold text-on-surface wa-text-base wa-truncate">{a.member.fullName}</h4>
                      <p className="wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-wider wa-truncate" style={{marginBottom:"0.25rem", color: 'var(--color-accent)'}}>{prog}</p>
                      {trainingProgressPct === null ? (
                        <p className="wa-text-[13px] wa-font-semibold text-on-surface-variant" style={{ margin: 0 }}>
                          {enrolledSlug ? t('trainingProgressUnavailable') : t('notEnrolled')}
                        </p>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                          <div className="bg-surface-container" style={{ flex:1, height:"0.25rem", borderRadius:"9999px", overflow:"hidden" }}>
                            <div style={{height:"100%", borderRadius:"9999px", width: `${trainingProgressPct}%`, background: 'var(--color-accent)'}} />
                          </div>
                          <span className="wa-text-[13px] wa-font-bold text-on-surface-variant" style={{ fontVariantNumeric: 'tabular-nums' }}>{trainingProgressPct}%</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"0.5rem" }}>
                      <StatusBadge label={statusLabel} variant={badgeVariant} />
                      <span className="material-symbols-outlined text-surface-container-highest" aria-hidden="true">chevron_right</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
      {/* ── Desktop View ── */}
      <div className="wa-hidden md:wa-block">
      {/* ── Welcome Header ── */}
      <PageHeader
        title={t('welcomeBack', { firstName })}
        titleHeadingLevel={2}
        subtitle={
          assignmentTotal > COUNSELOR_ROSTER_CAP
            ? `Showing first ${assignments.length} of ${assignmentTotal} assigned members`
            : t('seeAssignedMembers')
        }
      />

      <section style={{ marginBottom: '2rem' }}>
        <CounselorPortalVoiceBlock />
      </section>

      {/* ── Stat Cards ── */}
      <section className="portal-metric-strip" style={{ marginBottom: '2rem' }}>
        {statCards.map((card) => (
          <div key={card.label} className="portal-metric-card">
            <div className="portal-metric-card__icon-wrap" style={{ background: card.bg }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: card.iconColor, fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{card.icon}</span>
            </div>
            <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: card.value > 0 && card.label === t('awaitingReply') ? 'var(--color-accent)' : undefined }}>{card.value}</p>
            <p className="portal-metric-card__label">{card.label}</p>
          </div>
        ))}
      </section>

      {/* ── Main Content Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>

        {/* ── Left Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Your Students */}
          <section>
            <div style={{ marginBottom: '1rem' }}>
              <h3 className="portal-section-heading" style={{ margin: 0 }}>
                {t('yourMembers')}
              </h3>
              <p className="portal-page-subtitle" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                {t('sortedByRecentlyAssigned')}
              </p>
            </div>

            {assignments.length === 0 ? (
              <PortalEmptyState
                title={t('noMembersAssignedYet')}
                description={t('membersAppearOnceAssigned')}
                icon={<span className="material-symbols-outlined" aria-hidden="true">person_search</span>}
                primaryAction={{ label: t('contactAdminForAssignments'), href: 'mailto:info@workforceap.org?subject=Member%20assignments%20for%20counselor%20portal' }}
                secondaryAction={{ label: t('counselorResources'), href: '/counselor/resources' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {assignments.map((assignment) => {
                  const isEnrolled = !!assignment.member.enrolledProgram;
                  const initials = (assignment.member.fullName ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <Link
                      key={assignment.id}
                      href={`/counselor/students/${assignment.member.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="portal-card portal-card--flat portal-card--padded-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background-color 0.15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{
                            width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem',
                            background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.875rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                          }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: '0 0 0.125rem' }}>
                              {assignment.member.fullName}
                            </h4>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const rawProgram = assignment.member.enrolledProgram ?? assignment.member.programInterest;
                                return rawProgram ? programDisplayTitle(rawProgram) : t('noProgram');
                              })()} · {assignment.member.email}
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexShrink: 0 }}>
                          <StatusBadge
                            label={isEnrolled ? t('enrolled') : t('notEnrolled')}
                            variant={isEnrolled ? 'success' : 'accent'}
                          />
                          <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.35, fontSize: '1rem' }} aria-hidden="true">chevron_right</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* System Status */}
          <section>
            <h3 className="portal-section-heading">
              {t('systemStatus')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="portal-card portal-card--flat portal-card--padded-sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p className="portal-section-title" style={{ marginBottom: '0.25rem' }}>{t('dataSync')}</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{affiliation}</p>
                  </div>
                  <StatusBadge label={t('healthy')} variant="success" />
                </div>
              </div>
              <div className="portal-card portal-card--flat portal-card--padded-sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p className="portal-section-title" style={{ marginBottom: '0.25rem' }}>{t('assistant')}</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{t('available')}</p>
                  </div>
                  <StatusBadge label={t('online')} variant="success" />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Right Sidebar ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Quick Insights */}
          <section className="portal-card portal-card--flat portal-card--padded">
            <h3 className="portal-section-title" style={{ marginBottom: '1.25rem' }}>{t('quickInsights')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{t('activeMembers')}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-on-surface)' }}>{assignments.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{t('enrolledInModules')}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-green)' }}>{enrolledCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{t('awaitingReply')}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: messagesNeedingReply > 0 ? 'var(--color-accent)' : 'var(--color-on-surface)' }}>{messagesNeedingReply}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem', marginTop: '0.25rem' }}>
                <Link href="/counselor/messages" className="btn btn-primary btn-full-width" style={{ fontSize: '0.8125rem' }}>
                  {t('openMessages')}
                </Link>
              </div>
            </div>
          </section>

          {/* Quick Links */}
          <section>
            <h3 className="portal-section-title" style={{ marginBottom: '1rem' }}>Quick Links</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {([
                { href: '/counselor/inbox', icon: 'inbox', title: t('inboxZero'), desc: t('inboxZeroSubtitle'), accent: 'accent' },
                { href: '/counselor/at-risk', icon: 'notification_important', title: t('atRiskMembers'), desc: t('membersFlaggedByRisk'), accent: 'error' },
                { href: '/counselor/triage', icon: 'priority_high', title: t('triageQueue'), desc: t('membersFlaggedForAction'), accent: 'accent' },
                { href: '/counselor/queue', icon: 'pending_actions', title: t('workQueue'), desc: t('membersWaiting24h'), accent: 'accent' },
                { href: '/counselor/students', icon: 'groups', title: t('myMembersTitle'), desc: t('viewRoster'), accent: 'accent' },
                { href: '/counselor/placements', icon: 'work', title: t('placements'), desc: t('trackJobPlacements'), accent: 'green' },
                { href: '/counselor/inactive-members', icon: 'notifications_paused', title: t('inactiveMembers'), desc: t('membersNeedReengagement'), accent: 'error' },
                { href: '/counselor/messages', icon: 'forum', title: t('messages'), desc: t('replyToMemberThreads'), accent: 'blue' },
                { href: '/counselor/resources', icon: 'menu_book', title: t('resources'), desc: t('guidesAndReference'), accent: 'gold' },
              ] as const).map((link) => {
                const accentColor = QUICK_LINK_ACCENT_COLORS[link.accent] ?? QUICK_LINK_ACCENT_COLORS.accent;
                return (
                <Link key={link.href} href={link.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="portal-card portal-card--flat portal-card--padded-sm" style={{ display: 'flex', alignItems: 'center', gap: '1rem', transition: 'background-color 0.15s' }}>
                    <div style={{
                      width: '2.75rem', minWidth: '2.75rem', height: '2.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `color-mix(in srgb, ${accentColor} 10%, transparent)`, borderRadius: '0.625rem',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: accentColor, '--ms-fill': 1 }} aria-hidden="true">{link.icon}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{link.title}</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{link.desc}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', opacity: 0.3, flexShrink: 0 }} aria-hidden="true">chevron_right</span>
                </Link>
                );
              })}
            </div>
          </section>

          {/* Counselor Actions */}
          <section>
            <h3 className="portal-section-title" style={{ marginBottom: '1.25rem' }}>{t('counselorActions')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {needsAttentionCount > 0 && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ width: '8px', height: '8px', marginTop: '0.375rem', borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                      {t('needsProgramGuidance', { count: needsAttentionCount })}
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 700, marginTop: '0.25rem' }}>{t('actionRequired')}</p>
                  </div>
                </div>
              )}
              {messagesNeedingReply > 0 && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ width: '8px', height: '8px', marginTop: '0.375rem', borderRadius: '50%', background: 'var(--color-green)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                      {t('threadsWaitingForReply', { count: messagesNeedingReply })}
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 700, marginTop: '0.25rem' }}>{t('respondSoon')}</p>
                  </div>
                </div>
              )}
              {needsAttentionCount === 0 && messagesNeedingReply === 0 && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', opacity: 0.5 }}>
                  <div style={{ width: '8px', height: '8px', marginTop: '0.375rem', borderRadius: '50%', background: 'var(--outline-variant)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>
                      {t('allCaughtUp')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      </div>{/* end desktop */}
    </PortalPageFrame>
  );
}
