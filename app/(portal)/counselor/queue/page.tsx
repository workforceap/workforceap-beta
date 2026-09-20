import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Clock, MessageSquare, RotateCcw } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import {
  formatTimeWaiting,
  getCounselorWorkQueue,
  getCounselorWorkQueueContext,
  previewMessageBody,
  type WorkQueueContext,
  type WorkQueueRow,
} from '@/lib/counselor/workQueue';
import { DesignSurface, SectionHeader, Avatar, StatusTag, colorVar, type KitColor, type KitTone } from '@/components/portal/kit';
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
              <span style={{ fontSize: 11, fontWeight: 700, color: c, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatTimeWaiting(row.hoursWaiting)}
              </span>
              <StatusTag tone={tier.tone}>{tier.label}</StatusTag>
            </span>
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
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
            <div
              className="wa-kit-card"
              data-portal-error-state="counselor-work-queue-load-failed"
              style={{ textAlign: 'center' }}
            >
              <AlertTriangle size={28} aria-hidden style={{ color: 'var(--wa-accent)', display: 'block', margin: '0 auto 1rem' }} />
              <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: 'var(--wa-text)' }}>
                {t('workQueueLoadError')}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--wa-muted)', marginBottom: 20 }}>{t('workQueueLoadErrorDesc')}</p>
              <Link href="/counselor/queue" className="btn btn-primary">
                <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('retry')}
              </Link>
            </div>
          ) : rows.length === 0 ? (
            <PortalEmptyState
              title={flaggedElsewhere > 0 ? t('workQueueNoRepliesTitle') : t('allCaughtUp')}
              description={
                flaggedElsewhere > 0
                  ? t('workQueueOtherFlagged', { count: flaggedElsewhere })
                  : t('workQueueEmptyDesc')
              }
              icon={<Clock size={28} style={{ color: 'var(--wa-success)' }} />}
              primaryAction={
                flaggedElsewhere > 0
                  ? { label: t('inboxZero'), href: '/counselor/inbox' }
                  : { label: t('openMessages'), href: '/counselor/messages' }
              }
              secondaryAction={{ label: t('backToDashboard'), href: '/counselor' }}
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
