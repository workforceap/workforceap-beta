import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import AuditLogsClient from './AuditLogsClient';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface } from '@/components/portal/kit';
import { AuditLogsKit, type AuditRow } from '@/components/portal/kit/pages/admin-subviews/AuditLogsKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – Audit Logs',
  description: 'Compliance registry and system event audit trail.',
  path: '/admin/audit-logs',
});
}

const PAGE_SIZE = 50;

function buildWhere(
  thirtyDaysAgo: Date,
  q: string,
  eventName: string
): Prisma.MemberEventWhereInput {
  const trimmed = q.trim();
  const base: Prisma.MemberEventWhereInput = {
    createdAt: { gte: thirtyDaysAgo },
    ...(eventName ? { eventName } : {}),
  };
  if (!trimmed) return base;
  return {
    AND: [
      base,
      {
        OR: [
          { user: { fullName: { contains: trimmed, mode: 'insensitive' } } },
          { user: { email: { contains: trimmed, mode: 'insensitive' } } },
          { eventName: { contains: trimmed, mode: 'insensitive' } },
          { entityType: { contains: trimmed, mode: 'insensitive' } },
          { sourcePage: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
    ],
  };
}

type Props = {
  searchParams?: Promise<{ page?: string; q?: string; event?: string; order?: string; ui?: string }>;
};

/** Short "When" label: today → time only, yesterday → "Yesterday", else month/day. */
function formatWhen(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Title-case an event_name slug → "Confirmed placement". */
function humanizeAction(name: string): string {
  const s = name.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

/** Read a source IP out of event metadata (best-effort) and mask it (73.x.x.12). */
function maskIp(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '—';
  const m = metadata as Record<string, unknown>;
  const raw = m.ip ?? m.ipAddress ?? m.ip_address ?? m.remoteAddr ?? m.clientIp;
  if (typeof raw !== 'string' || !raw.trim()) return '—';
  const ip = raw.trim().split(',')[0].trim();
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.x.x.${parts[3]}`;
  return ip; // IPv6 / non-dotted — show as-is
}

export default async function AdminAuditLogsPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/audit-logs');

  const superAdmin = await isSuperAdmin(user.id);
  if (!superAdmin) redirect('/admin');

  const sp = (await searchParams) ?? {};

  // --- DEFAULT: design-kit audit trail wired into real (lean) event data ---
  if (sp.ui !== 'legacy') {
    return renderKit();
  }
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q = (sp.q ?? '').trim();
  const eventFilter = (sp.event ?? '').trim();
  // Time order for the event list. 'desc' (newest first) is the default;
  // 'asc' supports incident reconstruction (read events oldest-first).
  const order: 'asc' | 'desc' = sp.order === 'asc' ? 'asc' : 'desc';

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const windowWhere: Prisma.MemberEventWhereInput = { createdAt: { gte: thirtyDaysAgo } };
  const listWhere = buildWhere(thirtyDaysAgo, q, eventFilter);

  const [totalInWindow, uniqueUsersInWindow, topEventRow, eventTypeGroups, totalMatching] = await Promise.all([
    prisma.memberEvent.count({ where: windowWhere }),
    prisma.memberEvent.groupBy({
      by: ['userId'],
      where: windowWhere,
      _count: true,
    }).then((rows) => rows.length),
    prisma.memberEvent.groupBy({
      by: ['eventName'],
      where: windowWhere,
      _count: { eventName: true },
      orderBy: { _count: { eventName: 'desc' } },
      take: 1,
    }),
    prisma.memberEvent.groupBy({
      by: ['eventName'],
      where: windowWhere,
      _count: { eventName: true },
      orderBy: { eventName: 'asc' },
    }),
    prisma.memberEvent.count({ where: listWhere }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const events = await prisma.memberEvent.findMany({
    where: listWhere,
    orderBy: { createdAt: order },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  const stats = {
    total30d: totalInWindow,
    uniqueUsers: uniqueUsersInWindow,
    topEvent: topEventRow[0]?.eventName ?? '—',
  };

  const eventTypesForSelect = eventTypeGroups.map((g) => ({
    name: g.eventName,
    count: g._count.eventName,
  }));

  const serialized = events.map((e) => ({
    id: e.id,
    userId: e.userId,
    userName: e.user.fullName,
    userEmail: e.user.email,
    eventName: e.eventName,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata as Record<string, unknown> | null,
    sourcePage: e.sourcePage,
    sessionId: e.sessionId,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Compliance registry — 30-day event trail (paginated)"
      />

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {[
          { label: 'Events (30d)', value: stats.total30d.toLocaleString(), icon: 'timeline', color: 'var(--color-accent)' },
          { label: 'Active Users', value: stats.uniqueUsers.toString(), icon: 'group', color: 'var(--wa-info-dark)' },
          { label: 'Top Event', value: stats.topEvent, icon: 'trending_up', color: 'var(--wa-success-dark)' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--surface-container)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '1.5rem', color: s.color, '--ms-fill': 1 }}
            >
              {s.icon}
            </span>
            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>{s.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <AuditLogsClient
        events={serialized}
        page={safePage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalMatching={totalMatching}
        initialQ={q}
        initialEvent={eventFilter}
        order={order}
        eventTypes={eventTypesForSelect}
      />
    </>
  );
}

/** Lean kit row count — first paint stays cheap. */
const KIT_LIMIT = 50;

/**
 * Design-kit default: dense immutable audit trail → <AuditLogsKit/>.
 * Lean reads only: latest N events + three scalar counts, run in parallel.
 * Aggregate failures degrade to 0 so the table still renders.
 */
async function renderKit() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [eventsResult, todayResult, weekResult, actorsResult] = await Promise.allSettled([
    prisma.memberEvent.findMany({
      take: KIT_LIMIT,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, email: true } } },
    }),
    prisma.memberEvent.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.memberEvent.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.memberEvent
      .groupBy({ by: ['userId'], where: { createdAt: { gte: sevenDaysAgo } } })
      .then((rows) => rows.length),
  ]);

  // If the core list query fails, fall back to the proven legacy view rather
  // than rendering an empty/fabricated kit.
  if (eventsResult.status === 'rejected') {
    captureApiError(eventsResult.reason, { route: 'admin/audit-logs', extra: { view: 'kit' } });
    redirect('/admin/audit-logs?ui=legacy');
  }

  const rows: AuditRow[] = eventsResult.value.map((e) => ({
    id: e.id,
    when: formatWhen(e.createdAt),
    actor: e.user?.fullName?.trim() || 'System',
    actorEmail: e.user?.email?.trim() || '—',
    action: humanizeAction(e.eventName),
    target: e.entityType
      ? `${e.entityType}${e.entityId ? ` #${e.entityId.slice(0, 8)}` : ''}`
      : e.sourcePage?.trim() || '—',
    ip: maskIp(e.metadata),
  }));

  const eventsToday = todayResult.status === 'fulfilled' ? todayResult.value : 0;
  const eventsThisWeek = weekResult.status === 'fulfilled' ? weekResult.value : 0;
  const distinctActors = actorsResult.status === 'fulfilled' ? actorsResult.value : 0;

  return (
    <DesignSurface surface="dense">
      <AuditLogsKit
        rows={rows}
        eventsToday={eventsToday}
        eventsThisWeek={eventsThisWeek}
        distinctActors={distinctActors}
      />
    </DesignSurface>
  );
}
