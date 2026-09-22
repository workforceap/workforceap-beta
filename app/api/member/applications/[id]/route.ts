import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { prisma } from '@/lib/db/prisma';
import { awardPoints } from '@/lib/member/points';
import { recordApplicationStatusChange } from '@/lib/member/applicationStatusEvent';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const updateSchema = z.object({
  company: z.string().min(1).max(200).optional(),
  role: z.string().min(1).max(200).optional(),
  status: z.enum(['SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEWING', 'OFFER', 'ACCEPTED', 'REJECTED']).optional(),
  appliedAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal('')),
});async function _PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const { id } = await params;
  
    try {
      await ensureUserInDb(user);
  
      const existing = await prisma.$transaction((tx) => tx.jobApplication.findFirst({
        where: { id, userId: user.id },
      }));
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
      let body: unknown;
      try {
        body = await _request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }
  
      const parsed = updateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
      }
  
      const data: Record<string, unknown> = {};
      if (parsed.data.company !== undefined) data.company = parsed.data.company;
      if (parsed.data.role !== undefined) data.role = parsed.data.role;
      if (parsed.data.status !== undefined) data.status = parsed.data.status;
      if (parsed.data.appliedAt !== undefined) data.appliedAt = parsed.data.appliedAt?.trim() ? new Date(parsed.data.appliedAt) : null;
      if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;
      if (parsed.data.url !== undefined) data.url = parsed.data.url || null;
  
      const app = await prisma.$transaction((tx) => tx.jobApplication.update({
        where: { id },
        data,
      }));
  
      // Award points on the SAVED → real-application transition. Codex P2 catch
      // on PR #1061 — POST awards only for non-SAVED creates, so a row created
      // as SAVED and later transitioned should award here. Idempotent on app id
      // (`@@unique([userId, event, entityId])` in pointsConfig) so re-PATCHing
      // an already-applied row never double-awards.
      if (
        parsed.data.status !== undefined &&
        parsed.data.status !== 'SAVED' &&
        existing.status === 'SAVED'
      ) {
        awardPoints(user.id, 'job_application', app.id).catch(() => {});
      }
  
      // Sibling of `/api/member/job-applications/[id]`, which has always logged
      // this. Without it a status move made through this route left no trace in
      // the member activity log.
      if (parsed.data.status !== undefined) {
        await recordApplicationStatusChange({
          userId: user.id,
          applicationId: app.id,
          previousStatus: existing.status,
          nextStatus: parsed.data.status,
          sourcePage: '/dashboard/job-applications',
        });
      }

      auditLog({ actorUserId: user.id, action: 'member.application.update', targetType: 'JobApplication', targetId: id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'JobApplication', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ application: app });
    } catch (err) {
      console.error('[PATCH /api/member/applications/:id]', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/applications/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const { id } = await params;
  
    try {
      await ensureUserInDb(user);
      const existing = await prisma.$transaction((tx) => tx.jobApplication.findFirst({
        where: { id, userId: user.id },
      }));
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
      await prisma.$transaction((tx) => tx.jobApplication.delete({ where: { id } }));
      auditLog({ actorUserId: user.id, action: 'member.application.delete', targetType: 'JobApplication', targetId: id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'delete', object: { type: 'JobApplication', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/member/applications/:id]', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/applications/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const DELETE = withApiGuc(_DELETE);
