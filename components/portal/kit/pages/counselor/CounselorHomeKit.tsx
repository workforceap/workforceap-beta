'use client';

import Link from 'next/link';
import {
  Users,
  TriangleAlert,
  MailWarning,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  SectionHeader,
  PageOpener,
  QueueRow,
  StatSparkTile,
  AreaChartMini,
  RankBars,
  type QueueTone,
  type ChartDatum,
  type RankDatum,
  type KitColor,
  type SparkStat,
} from '@/components/portal/kit';

/**
 * Counselor Portal — HOME view ("Command Center" redesign).
 *
 * Sibling to MemberHomeKit — same warm/dense kit language (--wa-* tokens,
 * wa-kit-* classes, lucide icons), ported for the counselor's caseload
 * instead of a member's learning journey. Layout order, top to bottom:
 *   1. Page opener (eyebrow + "Caseload" heading + goal caption).
 *   2. A 4-up KPI row (assigned / needs attention / awaiting reply / on
 *      track), each an optional inline sparkline + delta chip.
 *   3. "Needs attention" — the priority queue as severity-coded QueueRows.
 *      This is the hero of the view; everything else is secondary.
 *   4. A side column: "Today / this week" (interview-prep touchpoints) +
 *      either a daily-activity area chart (when the caller has one) or a
 *      caseload-by-bucket RankBars fallback (always available — it's just
 *      the three queue totals already on hand).
 *
 * Every prop is optional and degrades gracefully so a caller with only the
 * cheap counts (no per-day series, no sessions) still gets a complete page —
 * see app/(portal)/counselor/page.tsx's default path, which fetches from
 * lib/counselor/commandCenter.ts + lib/counselor/priorityQueue.ts.
 *
 * Target route: app/(portal)/counselor
 * Surface: dense (staff-facing).
 */

export type CounselorQueueBucket = 'critical' | 'warning' | 'ontrack';

export interface CounselorQueueRow {
  memberId: string;
  memberName: string;
  bucket: CounselorQueueBucket;
  /** Short human-readable primary blocker, e.g. "No activity 10+ days". */
  blockerReason?: string;
  /** Display title of the member's program (already resolved from the stored slug). */
  enrolledProgram?: string | null;
  /** Days since the member's last logged activity, when known. */
  daysSinceLogin?: number | null;
  /** Hours since the last unanswered member message, when known. */
  hoursWaitingReply?: number | null;
  /** Row action href. Defaults to `${memberHrefBase}/${memberId}`. */
  href?: string;
}

export interface CounselorSessionRow {
  memberId?: string;
  memberName: string;
  /** Interview-prep role/context summary, e.g. "Cloud Support Associate". */
  role?: string | null;
  /** When the session/tool run happened. Accepts a Date or a pre-formatted label. */
  lastRunAt?: Date | string | null;
  /** Row action href. Defaults to a sessions run link when `memberId` is set. */
  href?: string;
}

const BUCKET_TONE: Record<CounselorQueueBucket, QueueTone> = {
  critical: 'red',
  warning: 'yellow',
  ontrack: 'blue',
};

const BUCKET_ICON: Record<CounselorQueueBucket, LucideIcon> = {
  critical: TriangleAlert,
  warning: Clock,
  ontrack: CheckCircle2,
};

const BUCKET_FLAG: Record<CounselorQueueBucket, string | undefined> = {
  critical: 'Urgent',
  warning: 'Watch',
  ontrack: undefined,
};

export interface CounselorHomeKitProps {
  firstName?: string;
  greeting?: string;

  /** KPI counts — all cheap, always available from the default data path. */
  assignedCount?: number;
  atRiskCount?: number;
  needsReplyCount?: number;
  onTrackCount?: number;
  /** Of `needsReplyCount`, how many breach the 48h SLA. Folded into the "Needs attention" goal caption. */
  slaBreachCount?: number;

  /** Optional sparkline + delta chip per KPI tile. Omit any to hide that piece. */
  assignedSpark?: SparkStat;
  atRiskSpark?: SparkStat;
  needsReplySpark?: SparkStat;
  onTrackSpark?: SparkStat;

  /** Priority-queue rows — the hero. Empty renders a "caught up" state. */
  queueRows?: CounselorQueueRow[];
  /** Total rows in the underlying queue (may exceed `queueRows.length` when truncated). */
  queueTotal?: number;
  /** Base path for a queue row's "View" action. */
  memberHrefBase?: string;
  /** Roster link shown in the empty state. */
  rosterHref?: string;

  /** "Today / this week" compact session list (interview-prep touchpoints). */
  sessions?: CounselorSessionRow[];
  sessionsHref?: string;

  /** Daily activity series (e.g. caseload touchpoints/day). 2+ points required; omit to fall back to the bucket breakdown below. */
  activity?: ChartDatum[];
  activityDeltaLabel?: string;
  /** Caseload-by-bucket counts, used as the RankBars fallback when `activity` isn't available. */
  bucketCounts?: { critical: number; warning: number; ontrack: number };
}

/* ---------------------------------------------------------------------- */
/* Small pure helpers                                                      */
/* ---------------------------------------------------------------------- */

function queueRowMeta(row: CounselorQueueRow): string | undefined {
  const parts: string[] = [];
  if (row.blockerReason) parts.push(row.blockerReason);
  if (row.enrolledProgram) parts.push(row.enrolledProgram);
  if (typeof row.daysSinceLogin === 'number') {
    parts.push(`${row.daysSinceLogin}d inactive`);
  } else if (typeof row.hoursWaitingReply === 'number') {
    parts.push(`${row.hoursWaitingReply}h waiting`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatRelativeShort(when: Date | string | null | undefined): string | undefined {
  if (!when) return undefined;
  const date = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(date.getTime())) return typeof when === 'string' ? when : undefined;
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / (60 * 60 * 1000)));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* ---------------------------------------------------------------------- */
/* Presentational sub-components                                          */
/* ---------------------------------------------------------------------- */

function SideCardHead({ title }: { title: string }) {
  return (
    <span className="wa-kit-stat-label" style={{ display: 'block', marginBottom: 14 }}>
      {title}
    </span>
  );
}

function EmptyQueueState({ rosterHref }: { rosterHref: string }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <CheckCircle2 size={18} aria-hidden style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Nice work — no one&rsquo;s waiting on you right now.</p>
          <Link href={rosterHref} style={{ fontSize: 12, fontWeight: 600, color: 'var(--wa-accent)', textDecoration: 'none' }}>
            Browse your full roster
          </Link>
        </div>
      </div>
    </Card>
  );
}

function SessionListRow({ row, fallbackHref }: { row: CounselorSessionRow; fallbackHref: string }) {
  const relative = formatRelativeShort(row.lastRunAt);
  const href = row.href ?? (row.memberId ? `/counselor/sessions/${row.memberId}/run` : fallbackHref);
  return (
    <Link
      href={href}
      className="wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', padding: '6px 0' }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--wa-info-soft)',
          color: 'var(--wa-info)',
        }}
      >
        <Sparkles size={14} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--wa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.memberName}
        </div>
        {row.role ? (
          <div style={{ fontSize: 11, color: 'var(--wa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.role}
          </div>
        ) : null}
      </div>
      {relative ? (
        <span style={{ fontSize: 11, color: 'var(--wa-muted)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {relative}
        </span>
      ) : null}
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Main component                                                          */
/* ---------------------------------------------------------------------- */

export function CounselorHomeKit({
  firstName,
  greeting = 'Caseload',
  assignedCount = 0,
  atRiskCount = 0,
  needsReplyCount = 0,
  onTrackCount = 0,
  slaBreachCount = 0,
  assignedSpark,
  atRiskSpark,
  needsReplySpark,
  onTrackSpark,
  queueRows = [],
  queueTotal,
  memberHrefBase = '/counselor/students',
  rosterHref = '/counselor/students',
  sessions = [],
  sessionsHref = '/counselor/sessions',
  activity = [],
  activityDeltaLabel,
  bucketCounts,
}: CounselorHomeKitProps) {
  const total = queueTotal ?? queueRows.length;

  const kpis: Array<{ key: string; icon: LucideIcon; label: string; value: number; color: KitColor; spark?: SparkStat }> = [
    { key: 'assigned', icon: Users, label: 'Assigned members', value: assignedCount, color: 'info', spark: assignedSpark },
    {
      key: 'atRisk',
      icon: TriangleAlert,
      label: 'Members with risk alerts',
      value: atRiskCount,
      color: atRiskCount > 0 ? 'accent' : 'muted',
      spark: atRiskSpark,
    },
    {
      key: 'needsReply',
      icon: MailWarning,
      label: 'Awaiting reply',
      value: needsReplyCount,
      color: slaBreachCount > 0 ? 'accent' : needsReplyCount > 0 ? 'info' : 'muted',
      spark: needsReplySpark,
    },
    { key: 'onTrack', icon: CheckCircle2, label: 'On track', value: onTrackCount, color: 'success', spark: onTrackSpark },
  ];

  const hasActivitySeries = activity.length > 1;
  const bucketRankData: RankDatum[] | null = (() => {
    if (!bucketCounts) return null;
    const sum = bucketCounts.critical + bucketCounts.warning + bucketCounts.ontrack;
    if (sum <= 0) return null;
    return [
      { label: 'Critical', value: bucketCounts.critical, pct: (bucketCounts.critical / sum) * 100, color: 'accent' as const },
      { label: 'Warning', value: bucketCounts.warning, pct: (bucketCounts.warning / sum) * 100, color: 'gold' as const },
      { label: 'On track', value: bucketCounts.ontrack, pct: (bucketCounts.ontrack / sum) * 100, color: 'success' as const },
    ];
  })();

  const goalCaption = `${total} member${total === 1 ? '' : 's'} in queue${slaBreachCount > 0 ? ` · ${slaBreachCount} past 48h SLA` : ''}`;

  return (
    <DesignSurface surface="dense">
      <div style={{ padding: 'clamp(1rem, 4vw, 1.5rem)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* 1. Page opener */}
        <PageOpener className="wa-mb-5"
          kicker={greeting}
          title={firstName ? `Hey, ${firstName}.` : 'Caseload'}
          lede="Know who needs me today."
        />

        {/* 2. KPI row */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
          {kpis.map((k) => (
            <StatSparkTile key={k.key} icon={<k.icon size={16} />} label={k.label} value={k.value} color={k.color} spark={k.spark} />
          ))}
        </div>

        {/* 3 + 4. Hero queue (left) + side column (right). */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-12 wa-gap-4">
          <div className="lg:wa-col-span-8" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
            <SectionHeader title="Needs attention" goal={goalCaption} />
            {queueRows.length === 0 ? (
              <EmptyQueueState rosterHref={rosterHref} />
            ) : (
              queueRows.map((row) => {
                const Icon = BUCKET_ICON[row.bucket];
                return (
                  <QueueRow
                    key={row.memberId}
                    tone={BUCKET_TONE[row.bucket]}
                    icon={<Icon size={16} aria-hidden />}
                    title={row.memberName}
                    meta={queueRowMeta(row)}
                    flag={BUCKET_FLAG[row.bucket]}
                    action={
                      <AstryxLink href={row.href ?? `${memberHrefBase}/${row.memberId}`} as={Link as never} isStandalone>
                        <Button label="View" variant="secondary" size="sm" />
                      </AstryxLink>
                    }
                  />
                );
              })
            )}
          </div>

          <aside className="lg:wa-col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
            {/* Today / this week */}
            <Card>
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 4 }}>
                <SideCardHead title="Today / this week" />
                <Link
                  href={sessionsHref}
                  className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 14 }}
                >
                  Sessions <ArrowRight size={11} aria-hidden />
                </Link>
              </div>
              {sessions.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--wa-muted)', margin: 0 }}>
                  No interview-prep sessions run this week.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sessions.map((row, i) => (
                    <SessionListRow key={row.memberId ?? `${row.memberName}-${i}`} row={row} fallbackHref={sessionsHref} />
                  ))}
                </div>
              )}
            </Card>

            {/* Activity: real daily series when available, otherwise the caseload-by-bucket breakdown. */}
            <Card>
              {hasActivitySeries ? (
                <>
                  <SideCardHead title="Caseload activity" />
                  <AreaChartMini
                    data={activity}
                    id="counselor-cc-activity"
                    color="info"
                    height={140}
                    ariaLabel={activityDeltaLabel}
                  />
                  {activityDeltaLabel ? (
                    <p style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: 'var(--wa-success)', fontVariantNumeric: 'tabular-nums' }}>
                      {activityDeltaLabel}
                    </p>
                  ) : null}
                </>
              ) : bucketRankData ? (
                <>
                  <SideCardHead title="Caseload by bucket" />
                  <RankBars data={bucketRankData} />
                </>
              ) : (
                <>
                  <SideCardHead title="Caseload activity" />
                  <p style={{ fontSize: 12, color: 'var(--wa-muted)', margin: 0 }}>
                    Once members are assigned, their activity trend will appear here.
                  </p>
                </>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </DesignSurface>
  );
}

