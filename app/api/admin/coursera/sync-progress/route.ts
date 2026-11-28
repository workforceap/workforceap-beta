import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { promoteCsvProgressToCanonical } from '@/lib/coursera/csvImport.server';
import { refreshMemberProgramProgressRollup } from '@/lib/member/courseProgress';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { forEachInChunks } from '@/lib/util/forEachInChunks';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Rollup refreshes run this many at a time instead of up to 100 strictly in series. */
const ROLLUP_CONCURRENCY = 5;

async function requireAdminUser() {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
}export const POST = withApiGuc(async () => {
  try {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const organizationId = await getActorOrganizationId(admin.id);

  // Tenant admins must never drain the global xAPI queue. The secured system
  // cron owns replay; this action only promotes facts already scoped to the
  // actor's organization and refreshes that organization's rollups.
  const xapi = { replayed: 0, deferredToSystemCron: true };

  // Phase 2: promote all CSV-imported Coursera progress into course_progress
  // so member dashboards reflect CSV data even when no xAPI statements arrived
  const csvPromotion = await promoteCsvProgressToCanonical({ organizationId });

  // Phase 3: backfill rollup for all members with existing CourseProgress rows
  const membersWithProgress = await prisma.$transaction((tx) => tx.courseProgress.findMany({
    where: { user: { organizationId } },
    select: { userId: true, programSlug: true },
    distinct: ['userId', 'programSlug'],
    take: 100,
  }));

  let rollupsRun = 0;
  let rollupErrors = 0;

  await forEachInChunks(membersWithProgress, ROLLUP_CONCURRENCY, async ({ userId, programSlug }) => {
    try {
      await refreshMemberProgramProgressRollup(userId, programSlug);
      rollupsRun++;
    } catch {
      rollupErrors++;
    }
  });

  void auditLog({ actorUserId: admin.id, action: 'admin_coursera_sync_progress', targetType: 'User', targetId: admin.id, metadata: {} }).catch(() => {});
  logAuditEvent({ user: { id: admin.id, role: 'admin' }, verb: 'created', object: { type: 'CourseraSyncProgress', id: admin.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({
    xapi,
    csvPromotion,
    rollups: { run: rollupsRun, errors: rollupErrors, total: membersWithProgress.length },
  });

  } catch (error) {
    console.error('/admin/coursera/sync-progress error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

