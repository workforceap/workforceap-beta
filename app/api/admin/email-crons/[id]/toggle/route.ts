import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { setCronEnabled } from '@/lib/cron/isCronEnabled';
import { CRON_REGISTRY } from '@/lib/admin/cronRegistry';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const POST = withApiGuc(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await requireAdmin(user.id); } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const cron = CRON_REGISTRY.find(c => c.id === id);
  if (!cron) return NextResponse.json({ error: 'Cron not found' }, { status: 404 });

  let body: { enabled?: boolean };
  try { body = await req.json(); if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object'); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }
  const enabled = body.enabled;
  const orgId = await getActorOrganizationId(user.id);
  const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';

  await prisma.$transaction(async (tx) => {
    await setCronEnabled(tx, cron.workflowKey, enabled);
    await tx.workflowDiagnostic.create({
    data: {
      workflow: cron.workflowKey,
      status: 'inspection',
      actorUserId: user.id,
      method: 'admin_toggle',
      summary: `Cron ${enabled ? 'enabled' : 'disabled'} by admin`,
      metadata: { enabled, toggledBy: user.id, toggledAt: new Date().toISOString() },
    },
    });
  });

  await auditLog({
    actorUserId: user.id,
    action: enabled ? 'email_cron_enable' : 'email_cron_disable',
    targetType: 'email_cron',
    targetId: id,
    metadata: { workflow: cron.workflowKey, enabled },
  });

  await logAuditEvent({
    user: { id: user.id, role: actorRole },
    verb: 'updated',
    object: { type: 'EmailCron', id },
    orgId,
    request: auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true, id, enabled });

  } catch (error) {
    console.error('/admin/email-crons/[id]/toggle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

