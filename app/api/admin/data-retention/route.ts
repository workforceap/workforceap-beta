import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { runDataCleanup } from '@/lib/retention/cleanup';
import { RETENTION_TABLES, getCutoffDate } from '@/lib/retention/config';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

export type TableStorageInfo = {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
  sizeHuman: string;
};

export type RetentionPolicyRow = {
  model: string;
  description: string;
  days: number;
  cutoffDate: string;
  estimatedRows: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

async function fetchStorageStats(): Promise<TableStorageInfo[]> {
  const tableNames = RETENTION_TABLES.map((t) => {
    // Map camelCase model name to snake_case table name
    const map: Record<string, string> = {
      auditLog: 'audit_logs',
      xapiStatement: 'xapi_statements',
      cronExecution: 'cron_executions',
      webhookEvent: 'webhook_events',
      memberEvent: 'member_events',
      workflowDiagnostic: 'workflow_diagnostics',
      emailSendLog: 'email_send_logs',
      portalWorkflowEvent: 'portal_workflow_events',
      publicWioaScreening: 'public_wioa_screenings',
    };
    return map[t.model] ?? t.model;
  });

  const rows = await prisma.$queryRawUnsafe<Array<{ relname: string; n_live_tup: bigint; total_size: bigint }>>(`
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

async function fetchPolicyRows(): Promise<RetentionPolicyRow[]> {
  const results: RetentionPolicyRow[] = [];

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

export const GET = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user || !(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'run') {
      const report = await runDataCleanup();
      return NextResponse.json({ ok: true, report });
    }

    const [storage, policies, recentRuns] = await Promise.all([
      fetchStorageStats(),
      fetchPolicyRows(),
      prisma.cronExecution.findMany({
        where: { jobName: 'data_cleanup' },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      storage,
      policies,
      recentRuns,
    });
  } catch (error) {
    console.error('[admin/data-retention] Error:', error);
    return NextResponse.json({ error: 'Failed to load retention data' }, { status: 500 });
  }
});

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user || !(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};

    if (body.action === 'run_cleanup') {
      const report = await runDataCleanup();
      auditLog({
        actorUserId: user.id,
        action: 'admin_data_retention_cleanup',
        targetType: 'DataRetention',
        metadata: { deletedRowCount: (report as any)?.totalDeleted ?? null },
      }).catch(() => {});
      logAuditEvent({
        user: { id: user.id, role: 'super_admin' },
        verb: 'ran',
        object: { type: 'DataRetentionCleanup', id: 'run_cleanup' },
        result: { success: true, extensions: { deletedRowCount: (report as any)?.totalDeleted ?? null } },
        request: auditRequestMeta(request),
      }).catch(() => {});
      return NextResponse.json({ ok: true, report });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[admin/data-retention POST] Error:', error);
    return NextResponse.json({ error: 'Failed to run cleanup' }, { status: 500 });
  }
});
