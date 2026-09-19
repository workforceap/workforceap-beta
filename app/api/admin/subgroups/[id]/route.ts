import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const SUBGROUP_TYPES = ['partner', 'manager', 'church'] as const;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(SUBGROUP_TYPES).optional(),
  leaderId: z.string().uuid().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
});async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireAdmin(user.id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  const superAdmin = await isSuperAdmin(user.id);
  const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

  const subgroup = await prisma.$transaction((tx) => tx.subgroup.findFirst({
    where: { id, ...(orgId ? { leader: { organizationId: orgId } } : {}) },
  }));
  if (!subgroup) return NextResponse.json({ error: 'Subgroup not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name != null) data.name = parsed.data.name;
  if (parsed.data.type != null) data.type = parsed.data.type;
  if (parsed.data.leaderId != null) {
    const leader = await prisma.$transaction((tx) => tx.user.findFirst({
      where: { id: parsed.data.leaderId, ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true },
    }));
    if (!leader) return NextResponse.json({ error: 'Leader user not found' }, { status: 400 });
    data.leaderId = parsed.data.leaderId;
  }
  if (parsed.data.partnerId !== undefined) {
    data.partnerId = parsed.data.partnerId;
    if (parsed.data.partnerId && subgroup.type === 'partner') {
      const partnerId = parsed.data.partnerId;
      const partner = await prisma.$transaction((tx) => tx.partner.findFirst({
        where: { id: partnerId, active: true, ...(orgId ? { organizationId: orgId } : {}) },
      }));
      if (!partner) return NextResponse.json({ error: 'Invalid or inactive partner' }, { status: 400 });
    }
  }
  if (parsed.data.description !== undefined) data.description = parsed.data.description;

  const updated = await prisma.$transaction((tx) => tx.subgroup.update({
    where: { id },
    data,
    include: {
      leader: { select: { id: true, fullName: true, email: true } },
      partner: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  }));
  await auditLog({
    actorUserId: user.id,
    action: 'subgroup_update',
    targetType: 'subgroup',
    targetId: id,
    metadata: { name: updated.name },
  });
  logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'updated', object: { type: 'Subgroup', id }, result: { success: true } }).catch(() => {});
  return NextResponse.json(updated);

  } catch (error) {
    console.error('/admin/subgroups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);async function _DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireAdmin(user.id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const superAdmin = await isSuperAdmin(user.id);
  const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

  const subgroup = await prisma.$transaction((tx) => tx.subgroup.findFirst({
    where: { id, ...(orgId ? { leader: { organizationId: orgId } } : {}) },
  }));
  if (!subgroup) return NextResponse.json({ error: 'Subgroup not found' }, { status: 404 });

  await prisma.$transaction((tx) => tx.subgroup.delete({ where: { id } }));
  await auditLog({
    actorUserId: user.id,
    action: 'subgroup_delete',
    targetType: 'subgroup',
    targetId: id,
    metadata: { name: subgroup.name },
  });
  logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'deleted', object: { type: 'Subgroup', id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/admin/subgroups/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const DELETE = withApiGuc(_DELETE);
