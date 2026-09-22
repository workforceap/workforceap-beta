import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import {
  formatTimeWaiting,
  getCounselorWorkQueue,
  getCounselorWorkQueueContext,
  previewMessageBody,
  type WorkQueueContext,
  type WorkQueueRow,
} from '@/lib/counselor/workQueue';
import { DesignSurface, SectionHeader, Avatar, StatusTag, KitEmptyState, colorVar, type KitColor, type KitTone } from '@/components/portal/kit';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/** hoursWaiting → severity tier, shared by the real page and the dev showcase. */
function workQueueTier(hoursWaiting: number): { color: KitColor; tone: KitTone; label: string } {
  if (hoursWaiting >= 72) return { color: 'accent', tone: 'alert', label: 'Overdue' };
  if (hoursWaiting >= 48) return { color: 'gold', tone: 'warn', label: 'At risk' };
  return { color: 'info', tone: 'info', label: 'Waiting' };
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Presentational work-queue row — shared by the real page and the dev showcase. */
function WorkQueueRowCard({ row }: { row: WorkQueueRow }) {
  const tier = workQueueTier(row.hoursWaiting);
  const c = colorVar(tier.color);
  return (
    <Link href={`/counselor/messages?memberId=${encodeURIComponent(row.memberId)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        className="wa-kit-card wa-kit-card--sm wa-kit-card--hover"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderLeft: `3px solid ${c}` }}
      >
        <Avatar initials={getInitials(row.memberName) || '?'} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h3
              title={row.memberName}
              style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {row.memberName}
            </h3>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatTimeWaiting(row.hoursWaiting)}
              </span>
              <StatusTag tone={tier.tone}>{tier.label}</StatusTag>
            </span>
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--wa-muted)',
              lineHeight: 1.45,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {previewMessageBody(row.lastMessageBody) || 'No message preview available'}
          </p>
        </div>
        <MessageSquare size={16} aria-hidden style={{ color: 'var(--wa-muted)', opacity: 0.5, flexShrink: 0, marginTop: 2 }} />
      </div>
    </Link>
  );
}

export default async function CounselorWorkQueuePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/queue');

  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect('/dashboard');

  let rows: Awaited<ReturnType<typeof getCounselorWorkQueue>>;
  let error = false;
  try {
    rows = await getCounselorWorkQueue(user.id, { isAdmin: admin });
  } catch (err) {
    console.error('[counselor/queue] getCounselorWorkQueue failed:', err);
    rows = [];
    error = true;
  }

  // This page is the "waiting on a reply" slice of the shared attention queue
  // (lib/attention). When the slice is empty but other members are flagged,
  // say so instead of "all caught up" — the same set Inbox zero shows.
  let context: WorkQueueContext | null = null;
  if (!error) {
    try {
      context = await getCounselorWorkQueueContext(user.id, { isAdmin: admin });
    } catch (err) {
      console.error('[counselor/queue] getCounselorWorkQueueContext failed:', err);
    }
  }
  const flaggedElsewhere = context ? Math.max(0, context.flaggedTotal - context.awaitingReply) : 0;

  const t = await getTranslations('counselor');
  const tEmpty = await getTranslations('empty');
  // Empty slice: `clear`. "All caught up" is claimed only when the shared
  // attention context loaded and nothing else is flagged; when other members
  // are flagged, or the context itself failed, the title stays "No replies
  // overdue" and the CTA is Inbox zero (the list that holds the other flags).
  const emptyGroup = context && flaggedElsewhere === 0 ? 'workQueueClear' : 'workQueueNoReplies';
  const emptyBody =
    emptyGroup === 'workQueueClear'
      ? tEmpty('counselor.workQueueClear.body')
      : context
        ? tEmpty('counselor.workQueueNoReplies.body', { count: flaggedElsewhere })
        : tEmpty('counselor.workQueueNoReplies.bodyUnknown');

  return (
    <PortalPageFrame>
      <PageHeader
        title={t('workQueue')}
        subtitle={t('workQueueSubtitle')}
        breadcrumbs={[
          { label: t('counselorPortalBreadcrumb'), href: '/counselor' },
          { label: t('workQueue') },
        ]}
      />

      <section style={{ padding: '0 clamp(1rem, 4vw, 1.5rem) 2rem' }}>
        <DesignSurface surface="dense">
          {error ? (
            <KitEmptyState
              framed
              kind="unavailable"
              tone="danger"
              headingAs="h2"
              data-portal-error-state="counselor-work-queue-load-failed"
              icon={<AlertTriangle size={13} aria-hidden="true" />}
              title={tEmpty('counselor.workQueueUnavailable.title')}
              description={tEmpty('counselor.workQueueUnavailable.body')}
              primaryAction={{ label: tEmpty('counselor.workQueueUnavailable.action'), href: '/counselor/queue' }}
            />
          ) : rows.length === 0 ? (
            <KitEmptyState
              framed
              kind="clear"
              tone={emptyGroup === 'workQueueClear' ? 'ok' : 'info'}
              headingAs="h2"
              data-testid="work-queue-empty"
              data-variant={emptyGroup}
              icon={<Clock size={13} aria-hidden="true" />}
              title={tEmpty(`counselor.${emptyGroup}.title`)}
              description={emptyBody}
              primaryAction={
                emptyGroup === 'workQueueClear'
                  ? { label: tEmpty('counselor.workQueueClear.action'), href: '/counselor/messages' }
                  : { label: tEmpty('counselor.workQueueNoReplies.action'), href: '/counselor/inbox' }
              }
              secondaryAction={{ label: tEmpty('counselor.workQueueClear.secondary'), href: '/counselor' }}
            />
          ) : (
            <>
              <SectionHeader
                title="Work queue"
                goal={t('workQueueMembersAwaiting', { count: rows.length })}
                action={
                  <Link href="/counselor/messages" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
                    {t('openMessages')} →
                  </Link>
                }
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map((row) => (
                  <WorkQueueRowCard key={row.threadId} row={row} />
                ))}
              </div>
            </>
          )}
        </DesignSurface>
      </section>
    </PortalPageFrame>
  );
}
