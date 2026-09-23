import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import {
  withTenantScope,
  assertSameTenant,
  memberInOrg,
  TenantScopeViolation,
} from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { awardPoints } from '@/lib/member/points';

async function _GET(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user || (!(await isAdmin(user.id)) && !(await isCounselor(user.id)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = await getActorOrganizationId(user.id);
  const placements = await withTenantScope(orgId, async (db) =>
    db.placementRecord.findMany({
      // PlacementRecord has no organizationId — scope through the member FK.
      where: memberInOrg(orgId),
      orderBy: { placedAt: 'desc' },
      take: 500,
      include: {
        user: { select: { fullName: true, email: true, id: true } },
      },
    })
  );

  const enriched = placements.map((p) => ({
    ...p,
    survey30: p.placedAt ? daysSince(p.placedAt) >= 30 : false,
    survey60: p.placedAt ? daysSince(p.placedAt) >= 60 : false,
    survey90: p.placedAt ? daysSince(p.placedAt) >= 90 : false,
  }));

  return NextResponse.json({ placements: enriched });

  } catch (error) {
    console.error('/admin/placements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


async function _POST(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) ?? {};
  const { userId, employerName, jobTitle, salaryOffered, placedAt } = body;
  if (!userId || !employerName || !jobTitle) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const orgId = await getActorOrganizationId(user.id);

  // PlacementRecord inherits its tenant through the member FK; reject
  // user-controlled userIds that point at another org (Invariant I-5).
  try {
    await assertSameTenant('user', userId, orgId);
  } catch (e) {
    if (e instanceof TenantScopeViolation) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    throw e;
  }

  const placement = await withTenantScope(orgId, async (db) =>
    db.placementRecord.create({
      data: {
        userId,
        employerName,
        jobTitle,
        salaryOffered: salaryOffered ? parseInt(salaryOffered, 10) : null,
        placedAt: placedAt ? new Date(placedAt) : new Date(),
        placedBy: user.id,
      },
    })
  );

  // WIOA grant claims need a tamper-evident change history (AUDIT H-DEP4)
  await auditLog({
    actorUserId: user.id,
    action: 'placement_create',
    targetType: 'placement_record',
    targetId: placement.id,
    metadata: {
      memberId: userId,
      employerName: placement.employerName,
      jobTitle: placement.jobTitle,
      salaryOffered: placement.salaryOffered,
      placedAt: placement.placedAt.toISOString(),
    },
  });
  logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'PlacementRecord', id: placement.id }, result: { success: true, extensions: { memberId: userId } } }).catch(() => {});

  // Idempotent per (userId, event, entityId) — safe even if this route is
  // ever hit twice for the same placement. Advertised on the points page as
  // a 500pt event but never actually awarded prior to this fix.
  void awardPoints(userId, 'placement_recorded', placement.id).catch(() => {});

  return NextResponse.json({ placement });

  } catch (error) {
    console.error('/admin/placements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


/** Legacy admin retention words mapped onto the classifier's vocabulary. */
const RETENTION_STATUS_ALIASES: Readonly<Record<string, string>> = {
  left: 'separated',
  unknown: 'pending',
};

async function _PATCH(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) ?? {};
  const parsed = z.object({
    id: z.string().min(1),
    placedAt: z.string().datetime().optional(),
    salaryOffered: z.number().nonnegative().optional(),
    employerName: z.string().min(1).max(200).optional(),
    jobTitle: z.string().min(1).max(200).optional(),
    // Only values the outcome classifier (lib/analytics/retentionOutcome.ts)
    // and the placement-survey sync understand. 'left' and 'unknown' are
    // accepted as aliases and normalised below. 'active' is refused: "still
    // employed" with no proven 90/180-day window is not retention evidence,
    // no report can classify it, and the survey would never overwrite it.
    retentionStatus: z
      .enum(['retained_90d', 'retained_180d', 'separated', 'pending', 'left', 'unknown'])
      .optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields', issues: parsed.error.issues }, { status: 400 });
  }

  const { id, retentionStatus, ...rest } = parsed.data;
  // Normalised before the write and the audit 'after' snapshot.
  const updates: typeof rest & { retentionStatus?: string } =
    retentionStatus === undefined
      ? rest
      : { ...rest, retentionStatus: RETENTION_STATUS_ALIASES[retentionStatus] ?? retentionStatus };
  const orgId = await getActorOrganizationId(user.id);

  // Verify placement belongs to admin's org and snapshot the fields being
  // changed so the audit log captures before/after (AUDIT H-DEP4).
  const existing = await withTenantScope(orgId, async (db) =>
    db.placementRecord.findFirst({
      where: { id, ...memberInOrg(orgId) },
      select: {
        id: true,
        userId: true,
        placedAt: true,
        salaryOffered: true,
        employerName: true,
        jobTitle: true,
        retentionStatus: true,
      },
    })
  );
  if (!existing) {
    return NextResponse.json({ error: 'Placement not found' }, { status: 404 });
  }

  const placement = await withTenantScope(orgId, async (db) =>
    db.placementRecord.update({ where: { id }, data: updates })
  );

  const before: Record<string, unknown> = {};
  for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
    const value = existing[key];
    before[key] = value instanceof Date ? value.toISOString() : value ?? null;
  }
  await auditLog({
    actorUserId: user.id,
    action: 'placement_update',
    targetType: 'placement_record',
    targetId: id,
    metadata: { memberId: existing.userId, before, after: updates },
  });
  logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'updated', object: { type: 'PlacementRecord', id }, result: { success: true, extensions: { memberId: existing.userId } } }).catch(() => {});

  return NextResponse.json({ placement });

  } catch (error) {
    console.error('/admin/placements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


function daysSince(date: Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}
export const GET = withApiGuc(_GET);
export const POST = withApiGuc(_POST);
export const PATCH = withApiGuc(_PATCH);
