import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getSubjectOrganizationId } from "@/lib/tenant/organization";
import {
  getOrCreateMemberCounselorThread,
  assertStaffCanPost,
  normalizeMessageBody,
  serializeMessage,
} from '@/lib/messages/counselorThread';
import {
  getTemplate,
  renderNudge,
  type NudgeTemplateId,
} from '@/lib/counselor/nudgeTemplates';
import { getProgramBySlug } from '@/lib/content/programs';

import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { persistEvent } from '@/lib/events/track';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 5).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * The member lookup is wrapped in `withTenantScope` so a counselor from
 * Org A cannot send a nudge to an Org B member by guessing the UUID.
 * `Message`, `MessageThread`, and `MemberEvent` are NOT in
 * `TENANT_SCOPED_MODELS` — they inherit tenancy via FK to `User` —
 * so those reads/writes stay on the raw client; the membership lookup
 * is the gate.
 */

const VALID_TEMPLATE_IDS: NudgeTemplateId[] = ['check_in', 'stalled_step', 'milestone_celebrate'];export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw: unknown = await request.json().catch(() => null);
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const memberId = typeof body.memberId === 'string' ? body.memberId : '';
  const templateId = typeof body.templateId === 'string' ? (body.templateId as NudgeTemplateId) : null;
  const overrideBody = typeof body.overrideBody === 'string' ? body.overrideBody : null;
  const milestoneInput = typeof body.milestone === 'string' ? body.milestone : null;

  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  if (!templateId || !VALID_TEMPLATE_IDS.includes(templateId)) {
    return NextResponse.json({ error: 'valid templateId required' }, { status: 400 });
  }

  const template = getTemplate(templateId);
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });

  // Ensure the member exists in the actor's tenant and the staff user is
  // allowed to message them. Lookup goes through withTenantScope so a
  // cross-tenant memberId is treated as not-found.
  const orgId = await getSubjectOrganizationId(memberId).catch(() => null);
  if (!orgId) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  const member = await withTenantScope(orgId, (db) =>
    db.user.findFirst({
      where: { id: memberId },
      select: { id: true, fullName: true, enrolledProgram: true, deletedAt: true },
    }),
  );
  if (!member || member.deletedAt) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Authorize against the member first: a staff user who may not message
  // this member must not leave a freshly created thread behind a 403.
  if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get or create the counselor thread so the staff-can-post check has
  // something to authorize against.
  const thread = await getOrCreateMemberCounselorThread(memberId);
  const allowed = await assertStaffCanPost(user.id, thread.id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Compose the message body. If the counselor edited the rendered body in
  // the UI, prefer their edit but still validate length/emptiness.
  let composed: string;
  if (overrideBody !== null && overrideBody.trim() !== '') {
    composed = overrideBody;
  } else {
    const program = member.enrolledProgram ? getProgramBySlug(member.enrolledProgram) : null;
    const programLabel = program?.title ? `your ${program.title} track` : 'your training';
    composed = renderNudge(template, {
      firstName: member.fullName,
      programLabel,
      milestone: milestoneInput ?? undefined,
    });
  }

  const normalized = normalizeMessageBody(composed);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  // Send the message and write the audit event in a single transaction so a
  // partial failure doesn't leave the queue thinking a nudge happened when
  // the member never received it.
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        threadId: thread.id,
        authorId: user.id,
        body: normalized.body,
      },
      select: { id: true, threadId: true, authorId: true, body: true, createdAt: true },
    });

    await persistEvent({
      userId: memberId,
      eventName: 'counselor_nudge_sent',
      entityType: 'message',
      entityId: created.id,
      metadata: {
        templateId,
        counselorUserId: user.id,
        threadId: thread.id,
        edited: overrideBody !== null && overrideBody.trim() !== '',
      },
    }, tx);

    return created;
  });

  auditLog({
    actorUserId: user.id,
    action: 'counselor_nudge_sent',
    targetType: 'User',
    targetId: memberId,
    metadata: { templateId, messageId: message.id },
  }).catch(() => {});
  logAuditEvent({
    user: { id: user.id, role: 'counselor' },
    verb: 'nudged',
    object: { type: 'CounselorMessage', id: message.id },
    result: { success: true, extensions: { templateId, memberId } },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: serializeMessage(message),
    template: { id: template.id, label: template.label },
  });

  } catch (error) {
    console.error('/counselor/nudge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

