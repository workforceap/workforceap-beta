import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { loadCronEnabledStates } from '@/lib/cron/isCronEnabled';
import { CRON_REGISTRY } from '@/lib/admin/cronRegistry';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async () => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await requireAdmin(user.id); } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Load last 50 workflow diagnostics that match any cron key
  const cronKeys = CRON_REGISTRY.map(c => c.workflowKey);
  const recentDiags = await prisma.$transaction((tx) => tx.workflowDiagnostic.findMany({
    where: { workflow: { in: cronKeys } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, workflow: true, status: true, summary: true, createdAt: true, metadata: true },
  }));

  const enabledStates = await loadCronEnabledStates(cronKeys);

  // Build a map: workflowKey → recent runs
  const runsByKey = new Map<string, typeof recentDiags>();
  for (const d of recentDiags) {
    const list = runsByKey.get(d.workflow) ?? [];
    list.push(d);
    runsByKey.set(d.workflow, list);
  }

  const enriched = CRON_REGISTRY.map(cron => {
    const runs = runsByKey.get(cron.workflowKey) ?? [];
    const last = runs[0] ?? null;
    const meta = last?.metadata as Record<string, unknown> | null;
    const enabled = enabledStates.get(cron.workflowKey)!;

    return {
      ...cron,
      enabled,
      lastRunAt: last?.createdAt?.toISOString() ?? null,
      lastRunStatus: last?.status ?? null,
      lastRunSummary: last?.summary ?? null,
      lastRunMeta: meta,
      recentRuns: runs.slice(0, 5).map(r => ({
        id: r.id,
        status: r.status,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
        meta: r.metadata,
      })),
    };
  });

  return NextResponse.json({ crons: enriched });

  } catch (error) {
    console.error('/admin/email-crons error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

