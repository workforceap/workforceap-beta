import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Sprout, Hammer, Star, Trophy, Flame } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import { getMemberPoints } from '@/lib/member/points';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import ReferralShareCard from './ReferralShareCard';
import {
  DesignSurface,
  CardHead,
  StatSparkTile,
  SegmentedProgress,
  StatusTag,
  colorVar,
  type KitColor,
} from '@/components/portal/kit';
import {
  EVENT_LABELS,
  LEVELS,
  POINT_VALUES,
  getLevelForPoints,
  getNextLevel,
} from '@/lib/member/pointsConfig';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('pointsMetaTitle'),
    description: t('pointsMetaDesc'),
    path: '/dashboard/points',
  });
}

const LEVEL_ICONS: Record<string, typeof Sprout> = {
  starter: Sprout,
  builder: Hammer,
  achiever: Star,
  champion: Trophy,
};

/** Recent point-earning event → command-center ledger dot color, distinct from the crimson accent. */
function ledgerColor(event: string): KitColor {
  if (event === 'job_application' || event === 'interview_requested' || event === 'placement_recorded') return 'info';
  if (event === 'daily_study' || event.startsWith('referral_') || event === 'program_enrolled') return 'gold';
  return 'success';
}

/**
 * Static catalogue of earnable actions sourced from `lib/member/pointsConfig`.
 * Each entry maps an event key to a member-facing destination so the page can
 * link directly to the action that earns the points.
 */
const EARN_ACTIONS: Array<{
  event: keyof typeof POINT_VALUES;
  href: string | null;
  blurb: string;
}> = [
  {
    event: 'placement_recorded',
    href: '/dashboard/jobs',
    blurb: 'Confirmed by your counselor when you start a new role.',
  },
  {
    event: 'certification_earned',
    href: '/dashboard/certifications',
    blurb: 'Add a verified certificate from a course or program.',
  },
  {
    event: 'program_enrolled',
    href: '/dashboard/program',
    blurb: 'Enroll in a WorkforceAP training program.',
  },
  {
    event: 'assessment_completed',
    href: '/dashboard/assessment',
    blurb: 'Complete the training preassessment to tailor your plan.',
  },
  {
    event: 'interview_requested',
    href: '/dashboard/messages',
    blurb: 'Request your program interview through your counselor.',
  },
  {
    event: 'course_completed',
    href: '/dashboard',
    blurb: 'Mark a course complete in your training plan.',
  },
  {
    event: 'counselor_session',
    href: '/dashboard/ai-tools',
    blurb: 'Run an AI Counselor session for guidance.',
  },
  {
    event: 'resume_uploaded',
    href: '/dashboard/ai-tools/resume-studio?view=rewrite',
    blurb: 'Upload or build out your resume.',
  },
  {
    event: 'job_application',
    href: '/dashboard/jobs',
    blurb: 'Log a job application from the jobs board.',
  },
  {
    event: 'pathway_step_completed',
    href: '/dashboard',
    blurb: 'Finish a learning step inside your pathway.',
  },
  {
    event: 'daily_study',
    href: '/dashboard/learning',
    blurb: 'Complete any lecture or quiz activity in Coursera — counted once per day.',
  },
];

export default async function DashboardPointsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/points');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const memberPoints = await getMemberPoints(user.id);
  const total = memberPoints.total;
  const levelMeta = getLevelForPoints(total);
  const nextLevel = getNextLevel(memberPoints.level);
  const pctToNext = nextLevel
    ? Math.min(100, Math.round(((total - levelMeta.min) / (nextLevel.min - levelMeta.min)) * 100))
    : 100;
  const LevelIcon = LEVEL_ICONS[memberPoints.level] ?? Sprout;
  const levelRank = LEVELS.findIndex((l) => l.name === memberPoints.level) + 1;

  // Recent point-earning events → command-center style ledger. Read-only,
  // additive query (mirrors the same lean read the /dashboard home already
  // runs for its own points ledger card).
  const recentTx = await prisma.pointsTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { event: true, points: true },
  });
  const pointsLedger = recentTx.map((tx) => ({
    label: EVENT_LABELS[tx.event] ?? 'Points earned',
    amount: tx.points,
    color: ledgerColor(tx.event),
  }));

  // Codex P2 catch on PR #1054: only show actions that are actually wired
  // to call `awardPoints()` in production code. POINT_VALUES has rows for
  // many events that never run in current code paths; listing them on this
  // page would promise points members can't actually earn. Keep this set in
  // sync with `awardPoints()` call sites — grep for `awardPoints(` if adding
  // new wired events:
  //   - assessment_completed   → app/api/member/assessment/submit/route.ts
  //   - program_enrolled       → app/api/member/enroll/route.ts
  //   - course_completed       → lib/member/courseCompletion.ts
  //   - counselor_session      → app/api/counselor/feedback/route.ts
  //   - placement_recorded     → app/api/admin/placements/route.ts
  //   - certification_earned   → app/api/member/certifications/route.ts
  //   - interview_requested    → app/api/member/interview-request/route.ts
  //   - resume_uploaded        → app/api/member/resume/upload/route.ts
  //   - job_application        → app/api/(portal)/dashboard/jobs/[id]/apply/route.ts
  //                              + app/api/member/job-applications/route.ts
  //                              + app/api/member/job-applications/log-external/route.ts
  //                              + app/api/member/applications/route.ts
  //   - pathway_step_completed → app/api/member/pathway-steps/[pathwayId]/[stepIndex]/complete/route.ts
  //   - daily_study            → lib/xapi/inboundStatementPipeline.ts (awarded
  //                              once per UTC calendar day per member, the
  //                              first time a resolved xAPI statement lands)
  // counselor_bonus is admin-awarded (uses customPoints), not member-earnable
  // directly, so it's intentionally excluded from EARN_ACTIONS.
  const WIRED_EVENTS = new Set<string>([
    'assessment_completed',
    'program_enrolled',
    'course_completed',
    'counselor_session',
    'placement_recorded',
    'certification_earned',
    'interview_requested',
    'resume_uploaded',
    'job_application',
    'pathway_step_completed',
    'daily_study',
  ]);
  const earnableActions = EARN_ACTIONS.filter(
    (a) => WIRED_EVENTS.has(a.event) && POINT_VALUES[a.event] > 0,
  ).sort((a, b) => POINT_VALUES[b.event] - POINT_VALUES[a.event]);

  return (
    <>
      <PageHeader
        title="Your Points"
        subtitle="Earn points as you make progress. Each milestone moves you toward the next level."
        breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'Your Points' }]}
      />
      {readOnlyAudit && <span hidden data-portal-audit-suppressed="member-referral-code-mint" />}

      <DesignSurface surface="warm">
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.25rem 4rem' }} className="wa-space-y-4">
          {/* ── KPI strip ── */}
          <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-3 wa-gap-3">
            <StatSparkTile icon={<Trophy size={16} />} label="Total points" value={total.toLocaleString()} />
            <StatSparkTile
              icon={<Flame size={16} />}
              label="Current streak"
              value={`${memberPoints.currentStreak} ${memberPoints.currentStreak === 1 ? 'day' : 'days'}`}
            />
            <StatSparkTile icon={<Star size={16} />} label="Level rank" value={`${levelRank} of ${LEVELS.length} · ${levelMeta.label}`} />
          </div>

          {/* ── Invite a friend (referral) ── */}
          {!readOnlyAudit && <ReferralShareCard />}

          {/* ── Current points summary + level progress ── */}
          <section className="wa-kit-card">
            <CardHead title="Level progress" />
            <div
              className="wa-flex wa-items-center wa-justify-between"
              style={{ gap: '1rem', flexWrap: 'wrap', marginBottom: 18 }}
            >
              <div className="wa-flex wa-items-center" style={{ gap: 14 }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--wa-radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: `color-mix(in srgb, ${levelMeta.color} 14%, transparent)`,
                    color: levelMeta.color,
                  }}
                >
                  <LevelIcon size={20} />
                </div>
                <div>
                  <div className="wa-kit-stat-label">My points</div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      lineHeight: 1,
                      marginTop: 4,
                      color: levelMeta.color,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {total.toLocaleString()}
                  </div>
                </div>
              </div>
              <span
                style={{
                  background: `color-mix(in srgb, ${levelMeta.color} 14%, transparent)`,
                  color: levelMeta.color,
                  borderRadius: 999,
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                }}
              >
                {levelMeta.label}
              </span>
            </div>

            {nextLevel ? (
              <>
                <div
                  className="wa-flex wa-items-center wa-justify-between"
                  style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginBottom: 8 }}
                >
                  <span>{pctToNext}% to {nextLevel.label}</span>
                  <span>Next: {nextLevel.label} at {nextLevel.min.toLocaleString()} pts</span>
                </div>
                <SegmentedProgress pct={pctToNext} segments={12} label={`Progress toward ${nextLevel.label}`} />
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--wa-muted)' }}>
                You&apos;ve reached the top tier. Keep going to set the bar even higher.
              </p>
            )}
          </section>

          {/* ── Tier ladder ── */}
          <section className="wa-kit-card">
            <CardHead title="Levels" />
            <div style={{ display: 'grid', gap: '0.625rem' }}>
              {LEVELS.map((l) => {
                const reached = total >= l.min;
                const current = l.name === memberPoints.level;
                const Icon = LEVEL_ICONS[l.name] ?? Sprout;
                const range =
                  l.max === Infinity ? `${l.min.toLocaleString()}+ pts` : `${l.min.toLocaleString()}–${l.max.toLocaleString()} pts`;
                return (
                  <div
                    key={l.name}
                    className="wa-flex wa-items-center"
                    style={{
                      gap: '0.875rem',
                      padding: '0.75rem 1rem',
                      border: `1px solid ${current ? `color-mix(in srgb, ${l.color} 45%, transparent)` : 'var(--wa-border)'}`,
                      borderRadius: 'var(--wa-radius-sm)',
                      background: current ? `color-mix(in srgb, ${l.color} 10%, transparent)` : 'transparent',
                      opacity: reached ? 1 : 0.7,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 'var(--wa-radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: `color-mix(in srgb, ${l.color} 14%, transparent)`,
                        color: l.color,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="wa-flex wa-items-center wa-gap-2" style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: 'var(--wa-text)' }}>
                        {l.label}
                        {current ? <StatusTag tone="ok">You are here</StatusTag> : null}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>{range}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Recent points ledger ── */}
          {pointsLedger.length > 0 ? (
            <section className="wa-kit-card">
              <CardHead title="Recent points" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pointsLedger.map((entry, i) => (
                  <div key={`${entry.label}-${i}`} className="wa-flex wa-items-center wa-justify-between" style={{ fontSize: 13 }}>
                    <span className="wa-flex wa-items-center wa-gap-2" style={{ color: 'var(--wa-muted)', fontWeight: 600 }}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: colorVar(entry.color) }} />
                      {entry.label}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--wa-success)', fontVariantNumeric: 'tabular-nums' }}>+{entry.amount}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── How to earn points ── */}
          <section className="wa-kit-card">
            <CardHead title="How to earn points" />
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--wa-muted)' }}>
              Points are awarded automatically when you hit a milestone. Most actions are
              counted once — finishing the same course or uploading the same resume twice
              won&apos;t double-count. Daily study points are the exception: they&apos;re
              earned again each new day you&apos;re active.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
              {earnableActions.map((action) => {
                const points = POINT_VALUES[action.event];
                const label = EVENT_LABELS[action.event] ?? action.event;
                const content = (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: 'var(--wa-text)' }}>{label}</p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-muted)', lineHeight: 1.5 }}>
                        {action.blurb}
                      </p>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '0.8125rem',
                        fontWeight: 800,
                        color: 'var(--wa-success)',
                        background: 'color-mix(in srgb, var(--wa-success) 12%, transparent)',
                        borderRadius: 999,
                        padding: '3px 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      +{points} pts
                    </span>
                  </>
                );

                const itemStyle: React.CSSProperties = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.875rem 1rem',
                  border: '1px solid var(--wa-border)',
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-surface)',
                  textDecoration: 'none',
                  color: 'inherit',
                };

                return (
                  <li key={action.event}>
                    {action.href ? (
                      <Link href={action.href} style={itemStyle} className="wa-kit-focus wa-kit-card--hover">
                        {content}
                      </Link>
                    ) : (
                      <div style={itemStyle}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div style={{ marginTop: '1.25rem' }}>
              <Link
                href="/dashboard"
                className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 40,
                  padding: '8px 16px',
                  border: '1px solid var(--wa-border)',
                  color: 'var(--wa-text)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  borderRadius: 999,
                  textDecoration: 'none',
                }}
              >
                Back to dashboard
              </Link>
            </div>
          </section>
        </div>
      </DesignSurface>
    </>
  );
}
