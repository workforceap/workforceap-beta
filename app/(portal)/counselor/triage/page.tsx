import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TriangleAlert, Clock, CheckCircle2, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import {
  getTriageQueue,
  emptyTriageQueue,
  FLAG_LABELS,
  type TriageRow,
  type TriageQueue,
} from '@/lib/counselor/triageFlags';
import { orderedReasonCounts } from '@/lib/attention/counselorViews';
import { ATTENTION_REASON_META } from '@/lib/attention/reasons';
import { listTemplates, NUDGE_TEMPLATES, renderNudge } from '@/lib/counselor/nudgeTemplates';
import TriageNudgePanel from '@/components/portal/counselor/TriageNudgePanel';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  DesignSurface,
  SectionHeader,
  QueueRow,
  StatusTag,
  StatSparkTile,
  KpiStrip,
  type KitColor,
  type KitTone,
  type KpiItem,
} from '@/components/portal/kit';

export const dynamic = 'force-dynamic';

type Priority = 'red' | 'yellow' | 'blue';

// Priority visuals follow the same red=urgent / yellow=watch / blue=celebrate
// language as the counselor "Needs attention" queue on the caseload home
// (components/portal/kit/pages/counselor/CounselorHomeKit.tsx), so this page
// reads as the same surface instead of a one-off.
const PRIORITY_DESCRIPTIONS: Record<Priority, string> = {
  red: 'Urgent — requires action today.',
  yellow: 'Watch — touch base this week.',
  blue: 'Celebrate — reinforce a recent win.',
};

const PRIORITY_ICON: Record<Priority, LucideIcon> = {
  red: TriangleAlert,
  yellow: Clock,
  blue: CheckCircle2,
};

const PRIORITY_TAG_LABEL: Record<Priority, string> = {
  red: 'Urgent',
  yellow: 'Watch',
  blue: 'Celebrate',
};

const PRIORITY_TAG_TONE: Record<Priority, KitTone> = {
  red: 'alert',
  yellow: 'warn',
  blue: 'info',
};

const PRIORITY_STAT_COLOR: Record<Priority, KitColor> = {
  red: 'accent',
  yellow: 'gold',
  blue: 'info',
};

export default async function CounselorTriagePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/triage');

  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect('/dashboard');

  const t = await getTranslations('counselor');

  let queue: TriageQueue;
  let loadError = false;
  try {
    queue = await getTriageQueue(user.id, { isAdmin: admin });
  } catch (err) {
    console.error('[counselor/triage] getTriageQueue failed:', err);
    loadError = true;
    queue = emptyTriageQueue();
  }

  return (
    <PortalPageFrame>
      <PageHeader
        title={t('triageQueueTitle')}
        subtitle={t('triageQueueSubtitle')}
        breadcrumbs={[
          { label: t('counselorPortal'), href: '/counselor' },
          { label: t('triage') },
        ]}
      />

      <section style={{ padding: '0 clamp(1rem, 4vw, 1.5rem) 2rem' }}>
        <DesignSurface surface="dense">
          {loadError ? (
            <div
              className="wa-kit-card"
              data-portal-error-state="counselor-triage-load-failed"
              style={{ textAlign: 'center' }}
            >
              <TriangleAlert
                size={28}
                aria-hidden
                style={{ color: 'var(--wa-accent)', display: 'block', margin: '0 auto 1rem' }}
              />
              <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: 'var(--wa-text)' }}>
                {t('couldntLoadTriageQueue')}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--wa-muted)', marginBottom: 20 }}>
                {t('triageQueueLoadErrorDesc')}
              </p>
              <Link href="/counselor/triage" className="btn btn-primary">
                <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('retry')}
              </Link>
            </div>
          ) : queue.totals.total === 0 ? (
            <PortalEmptyState
              title={t('queueIsClear')}
              description={t('queueIsClearDesc')}
              icon={<CheckCircle2 size={28} aria-hidden style={{ color: 'var(--wa-success)' }} />}
              primaryAction={{ label: t('openMessages'), href: '/counselor/messages' }}
              secondaryAction={{ label: t('backToDashboard'), href: '/counselor' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <SectionHeader
                title={t('triageQueueTitle')}
                goal={`${queue.totals.total} member${queue.totals.total === 1 ? '' : 's'} in the queue right now — each shown once, at their highest-priority flag.`}
              />
              <TriageSummary queue={queue} />
              <PriorityBucket priority="red" rows={queue.red} />
              <PriorityBucket priority="yellow" rows={queue.yellow} />
              <PriorityBucket priority="blue" rows={queue.blue} />
            </div>
          )}
        </DesignSurface>
      </section>
    </PortalPageFrame>
  );
}

function TriageSummary({ queue }: { queue: TriageQueue }) {
  const priorityStats: Array<{ key: Priority; label: string; value: number }> = [
    { key: 'red', label: PRIORITY_TAG_LABEL.red, value: queue.totals.red },
    { key: 'yellow', label: PRIORITY_TAG_LABEL.yellow, value: queue.totals.yellow },
    { key: 'blue', label: PRIORITY_TAG_LABEL.blue, value: queue.totals.blue },
  ];

  // One tile per attention reason that applies to someone in the queue, in
  // rank order, each captioned with its rule (lib/attention/reasons.ts).
  const flagItems: KpiItem[] = orderedReasonCounts(queue.totals.byFlag)
    .filter(({ count }) => count > 0)
    .map(({ reason, count }) => ({
      label: FLAG_LABELS[reason],
      value: count,
      delta: ATTENTION_REASON_META[reason].definition,
      deltaColor: 'muted',
    }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-3">
        {priorityStats.map((p) => {
          const Icon = PRIORITY_ICON[p.key];
          return (
            <StatSparkTile
              key={p.key}
              icon={<Icon size={16} />}
              label={p.label}
              value={p.value}
              color={PRIORITY_STAT_COLOR[p.key]}
            />
          );
        })}
      </div>
      {flagItems.length > 0 ? <KpiStrip items={flagItems} cols={4} /> : null}
    </div>
  );
}

function PriorityBucket({ priority, rows }: { priority: Priority; rows: TriageRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <StatusTag tone={PRIORITY_TAG_TONE[priority]}>{PRIORITY_TAG_LABEL[priority]}</StatusTag>
        <span className="wa-kit-stat-label">
          {rows.length} member{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>{PRIORITY_DESCRIPTIONS[priority]}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
        {rows.map((row) => (
          <TriageRowCard key={row.memberId} row={row} priority={priority} />
        ))}
      </ul>
    </div>
  );
}

function TriageRowCard({ row, priority }: { row: TriageRow; priority: Priority }) {
  const programLabelText = row.enrolledProgram
    ? programDisplayTitle(row.enrolledProgram)
    : 'Not enrolled';

  const milestoneText =
    row.context.milestoneEventName === 'certification_earned'
      ? 'earning your certification'
      : row.context.milestoneEventName === 'course_completed'
        ? 'finishing your course'
        : 'this milestone';

  // Filter templates to those appropriate for this priority. Pre-render
  // each template body so the client component doesn't need to import the
  // template logic.
  const programLabelForRender = row.enrolledProgram
    ? `your ${programDisplayTitle(row.enrolledProgram)} track`
    : 'your training';
  const templates = listTemplates()
    .filter((t) => t.appliesTo.includes(priority))
    .map((t) => ({
      id: t.id,
      label: t.label,
      preview: renderNudge(t, {
        firstName: row.memberName,
        programLabel: programLabelForRender,
        milestone: milestoneText,
      }),
    }));

  const Icon = PRIORITY_ICON[priority];
  const metaDetail = rowMetadataText(row);
  const meta = metaDetail ? `${FLAG_LABELS[row.primaryFlag]} · ${metaDetail}` : FLAG_LABELS[row.primaryFlag];

  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <QueueRow
        tone={priority}
        icon={<Icon size={16} aria-hidden />}
        title={row.memberName}
        meta={meta}
        flag={PRIORITY_TAG_LABEL[priority]}
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {row.context.threadId ? (
              <Link
                href={`/counselor/messages?thread=${row.context.threadId}`}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: 13, textDecoration: 'none' }}
              >
                Open thread
              </Link>
            ) : null}
            <Link
              href={`/counselor/students/${row.memberId}`}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 13, textDecoration: 'none' }}
            >
              View
            </Link>
          </div>
        }
      />
      <div style={{ paddingLeft: 50, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>
          {row.memberEmail} · {programLabelText}
        </p>
        {row.additionalFlags.length > 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>
            Also: {row.additionalFlags.map((f) => FLAG_LABELS[f]).join(' · ')}
          </p>
        ) : null}
        <TriageNudgePanel
          memberId={row.memberId}
          memberName={row.memberName}
          templates={templates}
          milestone={row.context.milestoneEventName ? milestoneText : null}
        />
      </div>
    </li>
  );
}

function rowMetadataText(row: TriageRow): string | undefined {
  const parts: string[] = [];
  if (row.context.daysInactive !== undefined) parts.push(`${row.context.daysInactive}d inactive`);
  if (row.context.hoursWaiting !== undefined) parts.push(`${row.context.hoursWaiting}h waiting`);
  if (row.context.staleSince) {
    const days = Math.max(
      0,
      Math.floor((Date.now() - row.context.staleSince.getTime()) / (24 * 60 * 60 * 1000)),
    );
    parts.push(`stale ${days}d`);
  }
  if (row.context.lastMessagePreview) parts.push(`"${row.context.lastMessagePreview}"`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

// Suppress unused warnings; templates referenced for type completeness.
void NUDGE_TEMPLATES;
