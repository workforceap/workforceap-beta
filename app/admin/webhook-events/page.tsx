import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import WebhookEventsClient from './WebhookEventsClient';
import PageHeader from '@/components/portal/PageHeader';
import { getWebhookStats } from '@/lib/webhooks/retry';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Webhook Events',
    description: 'Monitor incoming webhooks, failures, and retry status.',
    path: '/admin/webhook-events',
  });
}

const PAGE_SIZE = 50;

function buildWhere(
  q: string,
  source: string,
  status: string,
  dateFrom: string,
  dateTo: string
): Prisma.WebhookEventWhereInput {
  const trimmed = q.trim();
  const base: Prisma.WebhookEventWhereInput = {
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };
  if (!trimmed) return base;
  return {
    AND: [
      base,
      {
        OR: [
          { source: { contains: trimmed, mode: 'insensitive' } },
          { eventType: { contains: trimmed, mode: 'insensitive' } },
          { eventId: { contains: trimmed, mode: 'insensitive' } },
          { errorMessage: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
    ],
  };
}

type Props = {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    source?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

export default async function AdminWebhookEventsPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/webhook-events');

  const superAdmin = await isSuperAdmin(user.id);
  if (!superAdmin) redirect('/admin');

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q = (sp.q ?? '').trim();
  const sourceFilter = (sp.source ?? '').trim();
  const statusFilter = (sp.status ?? '').trim();
  const dateFrom = sp.dateFrom ?? '';
  const dateTo = sp.dateTo ?? '';

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const listWhere = buildWhere(q, sourceFilter, statusFilter, dateFrom, dateTo);

  const [stats, totalMatching, sourceGroups, statusGroups] = await Promise.all([
    getWebhookStats(sevenDaysAgo),
    prisma.webhookEvent.count({ where: listWhere }),
    prisma.webhookEvent.groupBy({
      by: ['source'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { source: true },
      orderBy: { source: 'asc' },
    }),
    prisma.webhookEvent.groupBy({
      by: ['status'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { status: true },
      orderBy: { status: 'asc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const events = await prisma.webhookEvent.findMany({
    where: listWhere,
    orderBy: { createdAt: 'desc' },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const serialized = events.map((e) => ({
    id: e.id,
    source: e.source,
    eventType: e.eventType,
    eventId: e.eventId,
    payloadSize: e.payloadSize,
    processingTimeMs: e.processingTimeMs,
    status: e.status,
    httpStatusCode: e.httpStatusCode,
    errorMessage: e.errorMessage,
    retryCount: e.retryCount,
    nextRetryAt: e.nextRetryAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  const sourcesForSelect = sourceGroups.map((g) => ({
    name: g.source,
    count: g._count.source,
  }));

  const statusesForSelect = statusGroups.map((g) => ({
    name: g.status,
    count: g._count.status,
  }));

  return (
    <>
      <PageHeader
        title="Webhook Events"
        subtitle="Incoming webhook monitor — failures, retries, and delivery status"
      />

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {[
          { label: '7d Total', value: stats.total.toLocaleString(), icon: 'timeline', color: 'var(--wa-accent-text)' },
          { label: 'Success', value: (stats.byStatus.success ?? 0).toLocaleString(), icon: 'check_circle', color: 'var(--wa-success-dark)' },
          { label: 'Failed', value: (stats.byStatus.failed ?? 0).toLocaleString(), icon: 'error', color: 'var(--color-red)' },
          { label: 'Retrying', value: (stats.byStatus.retrying ?? 0).toLocaleString(), icon: 'refresh', color: 'var(--wa-info-dark)' },
          { label: 'Dead Letter', value: (stats.byStatus.dead_letter ?? 0).toLocaleString(), icon: 'report', color: 'var(--color-orange)' },
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

      <WebhookEventsClient
        events={serialized}
        page={safePage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalMatching={totalMatching}
        initialQ={q}
        initialSource={sourceFilter}
        initialStatus={statusFilter}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        sources={sourcesForSelect}
        statuses={statusesForSelect}
      />
    </>
  );
}
