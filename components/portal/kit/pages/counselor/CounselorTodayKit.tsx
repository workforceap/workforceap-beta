import Link from 'next/link';
import {
  TriangleAlert,
  MailWarning,
  Clock,
  ClipboardList,
  UserPlus,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DesignSurface,
  PageOpener,
  StatTile,
  StatusTag,
  KitEmptyState,
  QueueRow,
  type KitTone,
  type QueueTone,
} from '@/components/portal/kit';
import { attentionReasonLabel, type AttentionSeverity } from '@/lib/attention/reasons';
import type { TodayGroup, TodayGroupKey, TodayQueue, TodayRow } from '@/lib/attention/counselorViews';
import { programDisplayTitle } from '@/lib/content/programTitle';

/**
 * Counselor Portal — TODAY view: the landing page.
 *
 * One list of who needs attention today, built from the shared attention
 * queue (`lib/attention`) via `toTodayQueue`, so it flags exactly the members
 * the Overview, Inbox zero, Triage and Work queue flag (counselor audit
 * 2026-09-20, §4.1 and §6.1). Layout, top to bottom:
 *   1. Page opener ("Today") with a quiet link to the full roster.
 *   2. Three StatTiles: needs attention / reply owed / on track.
 *   3. One section per group (`TODAY_GROUP_ORDER`), each with its rows as
 *      severity-coded QueueRows and its own empty state. On-track members
 *      are never listed — the queue must not list everyone.
 *
 * Pure and serializable: every string is computed from the queue so a render
 * test can drive it with the shared fixture roster.
 *
 * `data-tour` anchors (`tour-today-attention`, `tour-today-queue`,
 * `tour-today-roster`) are the page steps of the `counselor.home` guided tour
 * (lib/tours/registry.ts); keep them on elements that render for an empty queue.
 *
 * Target route: app/(portal)/counselor/today
 * Surface: dense (staff-facing).
 */

export interface CounselorTodayKitProps {
  queue: TodayQueue;
  /** True when the attention queue could not be loaded; the page then shows only the failed-load card. */
  loadError?: boolean;
  memberHrefBase?: string;
  rosterHref?: string;
  retryHref?: string;
}

const GROUP_ICON: Record<TodayGroupKey, LucideIcon> = {
  at_risk: TriangleAlert,
  reply_owed: MailWarning,
  quiet: Clock,
  follow_ups: ClipboardList,
  new: UserPlus,
  celebrate: Sparkles,
};

const SEVERITY_TONE: Record<AttentionSeverity, QueueTone> = {
  critical: 'red',
  warning: 'yellow',
  celebrate: 'blue',
};

const SEVERITY_TAG: Record<AttentionSeverity, { label: string; tone: KitTone }> = {
  critical: { label: 'Urgent', tone: 'alert' },
  warning: { label: 'Watch', tone: 'warn' },
  celebrate: { label: 'Celebrate', tone: 'info' },
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Row detail from the evaluator's context — no clock reads, so renders are deterministic. */
function todayRowDetail(row: TodayRow): string | undefined {
  const c = row.context;
  const parts: string[] = [];
  if (c.atRiskLevel) parts.push(`${c.atRiskLevel.toLowerCase()} risk${typeof c.atRiskScore === 'number' ? ` (${c.atRiskScore})` : ''}`);
  if (c.daysInactive === null) parts.push('no activity recorded');
  else if (typeof c.daysInactive === 'number') parts.push(`${c.daysInactive}d inactive`);
  if (typeof c.hoursWaiting === 'number') parts.push(`${c.hoursWaiting}h waiting`);
  if (c.daysSinceLastContact === null) parts.push('you have not written yet');
  else if (typeof c.daysSinceLastContact === 'number') parts.push(`${c.daysSinceLastContact}d since you wrote`);
  if (typeof c.daysSinceAssignment === 'number' && row.primaryReason === 'resume_missing_3d') parts.push(`${c.daysSinceAssignment}d without a resume`);
  if (typeof c.daysSinceApplication === 'number') parts.push(`application ${c.daysSinceApplication}d old`);
  if (typeof c.daysSinceJoined === 'number') parts.push(`joined ${c.daysSinceJoined}d ago`);
  if (c.milestoneEventName === 'certification_earned') parts.push('certification earned');
  else if (c.milestoneEventName === 'course_completed') parts.push('course completed');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function TodayTile({
  id,
  label,
  value,
  caption,
  tone,
}: {
  id: string;
  label: string;
  value: number;
  caption: string;
  tone?: KitTone;
}) {
  return <StatTile data-testid={`today-tile-${id}`} label={label} value={value} delta={caption} tone={tone} deltaTone="muted" />;
}

function TodayRowItem({ row, memberHrefBase }: { row: TodayRow; memberHrefBase: string }) {
  const Icon = GROUP_ICON[row.group];
  const tag = SEVERITY_TAG[row.severity];
  const detail = todayRowDetail(row);
  const reason = attentionReasonLabel(row.primaryReason);
  const meta = detail ? `${reason} · ${detail}` : reason;
  const program = row.enrolledProgram ? programDisplayTitle(row.enrolledProgram) : 'Not enrolled';
  const memberHref = `${memberHrefBase}/${encodeURIComponent(row.memberId)}`;

  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <QueueRow
        tone={SEVERITY_TONE[row.severity]}
        icon={<Icon size={16} aria-hidden />}
        title={row.memberName}
        meta={meta}
        flag={tag.label}
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {row.threadId ? (
              <Link
                href={`/counselor/messages?thread=${encodeURIComponent(row.threadId)}`}
                className="wa-kit-cta wa-kit-cta--ghost"
                aria-label={`Open thread with ${row.memberName}`}
              >
                Open thread
              </Link>
            ) : null}
            <Link href={memberHref} className="wa-kit-cta wa-kit-cta--ghost" aria-label={`View member ${row.memberName}`}>
              View member
            </Link>
          </div>
        }
      />
      <p className="wa-kit-meta" style={{ margin: 0, paddingLeft: 50, color: 'var(--wa-muted)' }}>
        {row.memberEmail} · {program}
        {row.additionalReasons.length > 0 ? ` · Also: ${row.additionalReasons.map(attentionReasonLabel).join(', ')}` : ''}
      </p>
    </li>
  );
}

function TodayGroupSection({ group, memberHrefBase }: { group: TodayGroup; memberHrefBase: string }) {
  const headingId = `today-group-${group.key}-title`;
  const count = group.rows.length;
  const countTone: KitTone = count === 0 ? 'muted' : group.key === 'celebrate' ? 'info' : group.rows.some((r) => r.severity === 'critical') ? 'alert' : 'warn';
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`today-group-${group.key}`}
      data-count={count}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id={headingId} className="wa-text-xl wa-font-extrabold" style={{ letterSpacing: '-0.02em', margin: 0 }}>
          {group.label}
        </h2>
        <StatusTag tone={countTone}>{plural(count, 'member')}</StatusTag>
      </div>
      <p className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-muted)' }}>{group.description}</p>
      {count === 0 ? (
        <KitEmptyState title={group.emptyTitle} headingAs="h3" />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
          {group.rows.map((row) => (
            <TodayRowItem key={row.memberId} row={row} memberHrefBase={memberHrefBase} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function CounselorTodayKit({
  queue,
  loadError = false,
  memberHrefBase = '/counselor/students',
  rosterHref = '/counselor/students',
  retryHref = '/counselor/today',
}: CounselorTodayKitProps) {
  const { totals } = queue;
  const lede = loadError
    ? 'Your attention queue could not be loaded.'
    : totals.flagged === 0
      ? `Nothing needs attention · ${plural(totals.onTrack, 'member')} on track`
      : `${totals.flagged} of ${plural(totals.roster, 'member')} need attention · one list, each member once`;

  return (
    <DesignSurface surface="dense">
      <div style={{ padding: 'clamp(1rem, 4vw, 1.5rem)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <PageOpener
          kicker="Counselor"
          title="Today"
          lede={lede}
          action={
            <Link href={rosterHref} className="wa-page-action" data-tour="tour-today-roster">
              All members
            </Link>
          }
        />

        {loadError ? (
          <div className="wa-kit-card" data-portal-error-state="counselor-today-load-failed" role="alert" style={{ textAlign: 'center' }}>
            <TriangleAlert size={28} aria-hidden style={{ color: 'var(--wa-accent)', display: 'block', margin: '0 auto 1rem' }} />
            <h2 style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', marginBottom: 8, color: 'var(--wa-text)' }}>
              Couldn&apos;t load today&apos;s queue
            </h2>
            <p className="wa-kit-meta" style={{ color: 'var(--wa-muted)', marginBottom: 20 }}>
              The attention queue did not answer. Try again, or open Messages in the meantime.
            </p>
            <Link href={retryHref} className="wa-kit-cta">
              <RotateCcw size={14} aria-hidden style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Retry
            </Link>
          </div>
        ) : (
          <>
            <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-3 wa-gap-3" data-tour="tour-today-attention">
              <TodayTile
                id="flagged"
                label="Needs attention"
                value={totals.flagged}
                caption="Urgent or watch, across every group below"
                tone={totals.flagged > 0 ? 'alert' : undefined}
              />
              <TodayTile
                id="reply-owed"
                label="Reply owed"
                value={totals.awaitingReply}
                caption="Member message waiting 24h+ without a staff reply"
                tone={totals.awaitingReply > 0 ? 'alert' : undefined}
              />
              <TodayTile id="on-track" label="On track" value={totals.onTrack} caption="No flags today" tone="ok" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} data-tour="tour-today-queue">
              {queue.groups.map((group) => (
                <TodayGroupSection key={group.key} group={group} memberHrefBase={memberHrefBase} />
              ))}
            </div>
          </>
        )}
      </div>
    </DesignSurface>
  );
}
