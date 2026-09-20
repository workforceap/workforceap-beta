import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { RETENTION_TABLES, getCutoffDate } from '@/lib/retention/config';
import PageHeader from '@/components/portal/PageHeader';
import DataRetentionClient from '@/components/admin/DataRetentionClient';
import { DataRetentionKit } from '@/components/portal/kit/pages/admin-subviews/DataRetentionKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Data Retention',
    description: 'Manage data retention policies, storage usage, and compliance cleanup.',
    path: '/admin/data-retention',
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

async function fetchStorageStats() {
  const tableMap: Record<string, string> = {
    auditLog: 'audit_logs',
    xapiStatement: 'xapi_statements',
    cronExecution: 'cron_executions',
    webhookEvent: 'webhook_events',
    memberEvent: 'member_events',
    workflowDiagnostic: 'workflow_diagnostics',
    emailSendLog: 'email_send_logs',
    portalWorkflowEvent: 'portal_workflow_events',
    publicWioaScreening: 'public_wioa_screenings',
    emailFailureSnapshot: 'email_failure_snapshots',
  };
  const tableNames = RETENTION_TABLES.map((t) => tableMap[t.model] ?? t.model);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ relname: string; n_live_tup: bigint; total_size: bigint }>
  >(`
    SELECT
      c.relname,
      COALESCE(s.n_live_tup, 0) AS n_live_tup,
      pg_total_relation_size(c.oid) AS total_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname AND s.schemaname = n.nspname
    WHERE n.nspname = 'public'
      AND c.relname IN (${tableNames.map((t) => `'${t}'`).join(',')})
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);

  return rows.map((r) => ({
    tableName: r.relname,
    rowCount: Number(r.n_live_tup),
    sizeBytes: Number(r.total_size),
    sizeHuman: formatBytes(Number(r.total_size)),
  }));
}

async function fetchPolicies() {
  const results = [];
  for (const cfg of RETENTION_TABLES) {
    const cutoff = getCutoffDate(cfg.days);
    const delegate = (prisma as any)[cfg.model];
    const count = await delegate.count({
      where: { [cfg.dateColumn]: { lt: cutoff } },
    });
    results.push({
      model: cfg.model,
      description: cfg.description,
      days: cfg.days,
      cutoffDate: cutoff.toISOString(),
      estimatedRows: count,
    });
  }
  return results;
}

export default async function AdminDataRetentionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/data-retention');

  const superAdmin = await isSuperAdmin(user.id);
  if (!superAdmin) redirect('/admin');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  const [storage, policies, recentRuns] = await Promise.all([
    fetchStorageStats(),
    fetchPolicies(),
    prisma.cronExecution.findMany({
      where: { jobName: 'data_cleanup' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
  ]);

  // ---------------------------------------------------------------------------
  // LEGACY: the full interactive view incl. the "Run Cleanup Now" purge action.
  // Kept verbatim behind ?ui=legacy as the escape hatch — purge logic untouched.
  // ---------------------------------------------------------------------------
  if (requestedUi === 'legacy') {
    return (
      <div>
        <PageHeader
          title="Data Retention"
          subtitle="Policies, storage usage, and compliance cleanup."
        />
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <DataRetentionClient
            storage={storage}
            policies={policies}
            recentRuns={recentRuns}
          />
        </div>
      </div>
    );
  }

  // DEFAULT: read-only dense kit treatment.
  return (
    <DataRetentionKit
      storage={storage}
      policies={policies}
      recentRuns={recentRuns.map((r) => ({
        id: r.id,
        jobName: r.jobName,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        recordsProcessed: r.recordsProcessed,
        errorMessage: r.errorMessage,
      }))}
    />
  );
}
