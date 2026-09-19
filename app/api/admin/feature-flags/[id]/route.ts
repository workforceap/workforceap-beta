import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { isOperationalFeatureFlagKey } from '@/lib/feature-flags/reservedKeys';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { name, description, enabled, rolloutPercentage, allowedRoles } = body as Record<string, unknown>;

    const existing = await prisma.$transaction((tx) => tx.featureFlag.findUnique({ where: { id } }));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (isOperationalFeatureFlagKey(existing.key)) {
      return NextResponse.json({ error: 'Cron settings must be managed through Email & Cron Management' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
    if (description !== undefined) update.description = typeof description === 'string' ? description.trim() || null : null;
    if (enabled !== undefined) update.enabled = !!enabled;
    if (rolloutPercentage !== undefined) {
      update.rolloutPercentage = Math.max(0, Math.min(100, Number(rolloutPercentage) || 0));
    }
    if (allowedRoles !== undefined) {
      update.allowedRoles = Array.isArray(allowedRoles)
        ? allowedRoles.filter((r: unknown): r is string => typeof r === 'string')
        : existing.allowedRoles;
    }

    const flag = await prisma.$transaction((tx) => tx.featureFlag.update({
      where: { id },
      data: update,
    }));

    void auditLog({ actorUserId: user.id, action: 'admin_feature_flag_update', targetType: 'featureFlag', targetId: id, metadata: { ...update, key: existing.key } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'updated', object: { type: 'FeatureFlag', id }, result: { success: true, extensions: { key: existing.key } } }).catch(() => {});

    return NextResponse.json({ flag });
  } catch (error) {
    console.error('[admin/feature-flags/[id] PATCH] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);async function _DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.$transaction((tx) => tx.featureFlag.findUnique({ where: { id }, select: { id: true, key: true } }));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (isOperationalFeatureFlagKey(existing.key)) {
      return NextResponse.json({ error: 'Cron settings must be managed through Email & Cron Management' }, { status: 400 });
    }
    await prisma.$transaction((tx) => tx.featureFlag.delete({ where: { id } }));
    void auditLog({ actorUserId: user.id, action: 'admin_feature_flag_delete', targetType: 'featureFlag', targetId: id, metadata: {} }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'deleted', object: { type: 'FeatureFlag', id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/feature-flags/[id] DELETE] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const DELETE = withApiGuc(_DELETE);
