import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

const JOB_NAME = 'cron_retention_decisions';
const RETENTION_QUEUE_LINK = '/admin/placements/retention';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Crossing this many days with no decision → 90-day milestone reminder. */
const NINETY_DAY_THRESHOLD_DAYS = 85;
/** Crossing this many days with no decision → 180-day milestone reminder. */
const ONE_EIGHTY_DAY_THRESHOLD_DAYS = 175;

/**
 * Weekly retention-decision reminder (Thursdays 13:30 — see vercel.json).
 *
 * PlacementRecord.retentionDecision is the funder-payable 90/180-day
 * milestone — see app/admin/placements/retention for the queue this
 * reminder points at. This cron does not write decisions itself; it just
 * makes sure a human sees the queue before the milestone goes stale:
 *
 *  - Placements ≥85 days old with no decision (90-day milestone) and
 *    placements ≥175 days old with no decision (180-day milestone) are
 *    collected in one pass.
 *  - Members with an active counselor get ONE batched notification to
 *    that counselor summarizing how many of their members are due
 *    (not one notification per member).
 *  - Members with no active counselor roll up into a single digest
 *    notification per organization, sent to that org's admins — this is
 *    the safety net for placements auto-created without a counselor
 *    assignment (e.g. via employer application-status effects).
 */
async function handle(_request: Request) {
  const now = new Date();
  const ninetyDayThreshold = new Date(now.getTime() - NINETY_DAY_THRESHOLD_DAYS * MS_PER_DAY);

  const duePlacements = await prisma.placementRecord.findMany({
    where: {
      OR: [{ retentionDecision: null }, { retentionDecision: 'pending' }],
      placedAt: { lte: ninetyDayThreshold },
    },
    take: 2000,
    select: {
      id: true,
      employerName: true,
      placedAt: true,
      userId: true,
      user: { select: { id: true, organizationId: true, deletedAt: true } },
    },
  });

  const liveDue = duePlacements.filter((p) => p.user && !p.user.deletedAt);

  if (liveDue.length === 0) {
    const runResult = { ok: true, checkedAt: now.toISOString(), duePlacements: 0, counselorsNotified: 0, adminDigestsSent: 0 };
    await setCronRecordsProcessed(0);
    await logCronRun(JOB_NAME, runResult);
    return NextResponse.json(runResult);
  }

  // Bucket by milestone (a placement past the 180-day threshold is also
  // still "due for 90" if it was never decided, but we only surface it in
  // the 180-day bucket so the counselor isn't double-counted).
  type DueRow = { placementId: string; userId: string; organizationId: string; bucket: 'ninety' | 'oneEighty' };
  const rows: DueRow[] = liveDue.map((p) => {
    const daysSince = Math.floor((now.getTime() - p.placedAt.getTime()) / MS_PER_DAY);
    return {
      placementId: p.id,
      userId: p.userId,
      organizationId: p.user!.organizationId,
      bucket: daysSince >= ONE_EIGHTY_DAY_THRESHOLD_DAYS ? 'oneEighty' : 'ninety',
    };
  });

  // Batched: one query for active counselor assignments across all due members.
  const assignments = await prisma.counselorAssignment.findMany({
    where: { memberId: { in: rows.map((r) => r.userId) }, active: true },
    select: {
      memberId: true,
      counselor: { select: { id: true, active: true, userId: true } },
    },
  });
  const counselorUserIdByMemberId = new Map<string, string>();
  for (const a of assignments) {
    if (a.counselor?.active && a.counselor.userId) {
      counselorUserIdByMemberId.set(a.memberId, a.counselor.userId);
    }
  }

  // Group by counselor (one notification per counselor, not per member).
  const counselorBatches = new Map<string, { ninety: number; oneEighty: number }>();
  // Group unassigned members by org (one digest per org, not per member).
  const orgRollups = new Map<string, { ninety: number; oneEighty: number }>();

  for (const row of rows) {
    const counselorUserId = counselorUserIdByMemberId.get(row.userId);
    if (counselorUserId) {
      const batch = counselorBatches.get(counselorUserId) ?? { ninety: 0, oneEighty: 0 };
      batch[row.bucket]++;
      counselorBatches.set(counselorUserId, batch);
    } else {
      const rollup = orgRollups.get(row.organizationId) ?? { ninety: 0, oneEighty: 0 };
      rollup[row.bucket]++;
      orgRollups.set(row.organizationId, rollup);
    }
  }

  let counselorsNotified = 0;
  for (const [counselorUserId, counts] of counselorBatches) {
    const total = counts.ninety + counts.oneEighty;
    try {
      await createNotification({
        userId: counselorUserId,
        type: 'task_assigned',
        title: `${total} retention decision${total === 1 ? '' : 's'} due`,
        body: `${counts.ninety} member${counts.ninety === 1 ? '' : 's'} due for a 90-day retention decision and ${counts.oneEighty} due for 180-day — funder-payable milestones waiting on your call.`,
        data: { link: RETENTION_QUEUE_LINK },
      });
      counselorsNotified++;
    } catch (err) {
      captureApiError(err, { route: 'cron/retention-decisions', extra: { counselorUserId } });
    }
  }

  // Admin digest for members with no active counselor — the safety net for
  // auto-created placements (e.g. from employer application-status effects)
  // that never got a counselor assignment.
  let adminDigestsSent = 0;
  if (orgRollups.size > 0) {
    const [profileAdmins, userRoleAdmins] = await Promise.all([
      prisma.profile.findMany({
        where: { role: { in: ['admin', 'super_admin'] } },
        select: { userId: true },
      }),
      prisma.userRole.findMany({
        where: { role: { name: 'admin' } },
        select: { userId: true },
      }),
    ]);
    const adminUserIds = new Set<string>([
      ...profileAdmins.map((p) => p.userId),
      ...userRoleAdmins.map((r) => r.userId),
    ]);
    const adminUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(adminUserIds) }, deletedAt: null, organizationId: { in: Array.from(orgRollups.keys()) } },
      select: { id: true, organizationId: true },
    });
    const adminsByOrg = new Map<string, string[]>();
    for (const admin of adminUsers) {
      const list = adminsByOrg.get(admin.organizationId) ?? [];
      list.push(admin.id);
      adminsByOrg.set(admin.organizationId, list);
    }

    for (const [organizationId, counts] of orgRollups) {
      const total = counts.ninety + counts.oneEighty;
      const admins = adminsByOrg.get(organizationId) ?? [];
      for (const adminUserId of admins) {
        try {
          await createNotification({
            userId: adminUserId,
            type: 'task_assigned',
            title: `${total} retention decision${total === 1 ? '' : 's'} due — no counselor assigned`,
            body: `${counts.ninety} member${counts.ninety === 1 ? '' : 's'} due for a 90-day retention decision and ${counts.oneEighty} due for 180-day have no active counselor to notify. Funder-payable milestones waiting.`,
            data: { link: RETENTION_QUEUE_LINK },
          });
          adminDigestsSent++;
        } catch (err) {
          captureApiError(err, { route: 'cron/retention-decisions', extra: { organizationId, adminUserId } });
        }
      }
    }
  }

  const runResult = {
    ok: true,
    checkedAt: now.toISOString(),
    duePlacements: rows.length,
    counselorsNotified,
    orgsWithUnassignedMembers: orgRollups.size,
    adminDigestsSent,
  };
  await setCronRecordsProcessed(rows.length);
  await logCronRun(JOB_NAME, runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging(JOB_NAME, handle);
export const POST = withCronLogging(JOB_NAME, handle);
