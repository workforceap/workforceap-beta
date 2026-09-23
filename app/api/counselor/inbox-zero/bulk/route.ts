import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { notifyCounselorOfStaffAssignment, type StaffAssignedMember } from '@/lib/counselor/staffAssignmentNotify';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { logInboxZeroBulkAuditEvent } from '@/lib/counselor/inboxZeroAudit';
import {
  INBOX_ZERO_CONTACTED_ACTION,
  INBOX_ZERO_DISMISS_ACTION,
  INBOX_ZERO_FOLLOW_UP_ACTION,
  INBOX_ZERO_REASSIGN_ACTION,
} from '@/lib/counselor/inboxZero';
import {
  getFollowUpTemplate,
  renderFollowUpTemplate,
  type FollowUpTemplateId,
} from '@/lib/counselor/templates';
import {
  assertStaffCanPost,
  getOrCreateMemberCounselorThread,
  normalizeMessageBody,
} from '@/lib/messages/counselorThread';
import {
  getActorOrganizationId,
  getSubjectOrganizationId,
} from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { persistEvent } from '@/lib/events/track';
import {
  BULK_FOLLOW_UP_REPEAT_ERROR,
  lockAndCheckRecentBulkFollowUp,
  notifyMemberOfBulkFollowUp,
} from '@/lib/counselor/bulkFollowUpGuard';

const MAX_BATCH = 50;

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('follow_up'),
    memberIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
    templateId: z.enum([
      'doc_missing_nudge',
      'application_stalled',
      'check_in',
      'congrats_placement',
    ]),
  }),
  z.object({
    action: z.literal('mark_contacted'),
    memberIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
  }),
  z.object({
    action: z.literal('reassign'),
    memberIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
    counselorUserId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('dismiss'),
    memberIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
    reason: z.string().min(1).max(1000),
    flags: z.array(z.string()).optional(),
  }),
]);

type BulkResult = { memberId: string; ok: boolean; error?: string; warning?: string; skipped?: boolean };

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const counselor = await isCounselor(user.id);
    const admin = await isAdmin(user.id);
    if (!counselor && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const memberIds = [...new Set(parsed.data.memberIds)];
    const results: BulkResult[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    if (parsed.data.action === 'follow_up') {
      const template = getFollowUpTemplate(parsed.data.templateId as FollowUpTemplateId);
      if (!template) {
        return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
      }

      for (const memberId of memberIds) {
        try {
          if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
            results.push({ memberId, ok: false, error: 'not_found' });
            failed += 1;
            continue;
          }

          const orgId = await getSubjectOrganizationId(memberId);
          const member = await withTenantScope(orgId, (db) =>
            db.user.findFirst({
              where: { id: memberId, deletedAt: null },
              select: { id: true, fullName: true, enrolledProgram: true },
            }),
          );
          if (!member) {
            results.push({ memberId, ok: false, error: 'not_found' });
            failed += 1;
            continue;
          }

          const rendered = renderFollowUpTemplate(template, {
            memberName: member.fullName ?? 'there',
            programName: member.enrolledProgram ? programDisplayTitle(member.enrolledProgram) : 'your program',
          });
          const normalized = normalizeMessageBody(`${rendered.subject}\n\n${rendered.body}`);
          if (!normalized.ok) {
            results.push({ memberId, ok: false, error: normalized.error });
            failed += 1;
            continue;
          }

          const thread = await getOrCreateMemberCounselorThread(memberId);
          if (!(await assertStaffCanPost(user.id, thread.id))) {
            results.push({ memberId, ok: false, error: 'forbidden' });
            failed += 1;
            continue;
          }

          const message = await prisma.$transaction(async (tx) => {
            if (await lockAndCheckRecentBulkFollowUp(tx, { memberId, templateId: template.id })) {
              return null;
            }
            const created = await tx.message.create({
              data: { threadId: thread.id, authorId: user.id, body: normalized.body },
              select: { id: true },
            });
            await persistEvent({
              userId: memberId,
              eventName: 'counselor_inbox_zero_follow_up_sent',
              entityType: 'message',
              entityId: created.id,
              metadata: {
                templateId: template.id,
                counselorUserId: user.id,
                threadId: thread.id,
                batchSize: memberIds.length,
              },
            }, tx);
            return created;
          });

          if (!message) {
            results.push({ memberId, ok: false, skipped: true, error: BULK_FOLLOW_UP_REPEAT_ERROR });
            skipped += 1;
            continue;
          }

          await notifyMemberOfBulkFollowUp({
            memberId,
            threadId: thread.id,
            authorId: user.id,
            body: normalized.body,
          });

          await auditLog({
            actorUserId: user.id,
            action: INBOX_ZERO_FOLLOW_UP_ACTION,
            targetType: 'User',
            targetId: memberId,
            metadata: { memberId, templateId: template.id, templateName: template.name },
          }).catch((e) => console.error('[bulk follow_up] auditLog:', e));

          await logInboxZeroBulkAuditEvent({
            actorUserId: user.id,
            memberId,
            verb: 'launched',
            action: INBOX_ZERO_FOLLOW_UP_ACTION,
            request,
            extensions: { templateId: template.id, batchSize: memberIds.length },
          }).catch((e) => console.error('[bulk follow_up] AuditEvent:', e));

          results.push({ memberId, ok: true });
          sent += 1;
        } catch (e) {
          console.error('[bulk follow_up]', memberId, e);
          results.push({ memberId, ok: false, error: 'internal' });
          failed += 1;
        }
      }
      return NextResponse.json({ ok: true, action: 'follow_up', sent, skipped, failed, results });
    }

    if (parsed.data.action === 'mark_contacted') {
      for (const memberId of memberIds) {
        try {
          if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
            results.push({ memberId, ok: false, error: 'not_found' });
            failed += 1;
            continue;
          }
          await auditLog({
            actorUserId: user.id,
            action: INBOX_ZERO_CONTACTED_ACTION,
            targetType: 'User',
            targetId: memberId,
            metadata: { memberId, contactedAt: new Date().toISOString() },
          });
          await prisma.$transaction((tx) => persistEvent({
            userId: memberId,
            eventName: 'counselor_inbox_zero_contacted',
            metadata: { markedBy: user.id },
          }, tx))
            .catch((e) => console.error('[bulk contacted] memberEvent:', e));
          await logInboxZeroBulkAuditEvent({
            actorUserId: user.id,
            memberId,
            verb: 'experienced',
            action: INBOX_ZERO_CONTACTED_ACTION,
            request,
            extensions: { batchSize: memberIds.length },
          }).catch((e) => console.error('[bulk contacted] AuditEvent:', e));
          results.push({ memberId, ok: true });
          sent += 1;
        } catch (e) {
          console.error('[bulk contacted]', memberId, e);
          results.push({ memberId, ok: false, error: 'internal' });
          failed += 1;
        }
      }
      return NextResponse.json({ ok: true, action: 'mark_contacted', sent, failed, results });
    }

    if (parsed.data.action === 'reassign') {
      const orgId = await getActorOrganizationId(user.id);
      const reassignCounselorUserId = parsed.data.counselorUserId;
      const targetCounselor = await prisma.$transaction((tx) => tx.counselor.findFirst({
        where: {
          userId: reassignCounselorUserId,
          active: true,
          user: { organizationId: orgId, deletedAt: null },
        },
        include: { user: { select: { id: true, fullName: true } } },
      }));
      if (!targetCounselor) {
        return NextResponse.json({ error: 'Counselor not found or inactive' }, { status: 400 });
      }

      const assignedToCounselor: StaffAssignedMember[] = [];
      for (const memberId of memberIds) {
        try {
          if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
            results.push({ memberId, ok: false, error: 'not_found' });
            failed += 1;
            continue;
          }
          const member = await withTenantScope(orgId, (db) =>
            db.user.findFirst({
              where: { id: memberId, deletedAt: null },
              select: { id: true, fullName: true },
            }),
          );
          if (!member) {
            results.push({ memberId, ok: false, error: 'not_found' });
            failed += 1;
            continue;
          }

          const { previousCounselorUserId, previousCounselorName } = await prisma.$transaction((tx) => assignMemberCounselor(tx, {
            memberId, organizationId: orgId, counselorUserId: targetCounselor.userId,
          }));
          assignedToCounselor.push({ memberId, memberName: member.fullName, previousCounselorUserId });

          const auditResults = await Promise.allSettled([auditLog({
            actorUserId: user.id,
            action: INBOX_ZERO_REASSIGN_ACTION,
            targetType: 'User',
            targetId: memberId,
            metadata: {
              memberId,
              counselorUserId: targetCounselor.userId,
              counselorName: targetCounselor.user.fullName,
              previousCounselorUserId,
              previousCounselorName,
            },
          }), logInboxZeroBulkAuditEvent({
            actorUserId: user.id,
            memberId,
            verb: 'completed',
            action: INBOX_ZERO_REASSIGN_ACTION,
            request,
            extensions: { counselorUserId: targetCounselor.userId, previousCounselorUserId, batchSize: memberIds.length },
          })]);

          const auditFailed = auditResults.some((result) => result.status === 'rejected');
          if (auditFailed) console.error('[bulk reassign] assignment committed; audit follow-up failed', memberId);
          results.push({
            memberId, ok: true,
            warning: auditFailed ? 'Counselor assigned, but audit history needs review. Contact an administrator; do not repeat the reassignment.' : undefined,
          });
          sent += 1;
        } catch (e) {
          console.error('[bulk reassign]', memberId, e);
          results.push({ memberId, ok: false, error: 'internal' });
          failed += 1;
        }
      }

      await notifyCounselorOfStaffAssignment({
        counselorUserId: targetCounselor.userId,
        actorUserId: user.id,
        members: assignedToCounselor,
        logPrefix: '[bulk reassign]',
      });

      return NextResponse.json({
        ok: true,
        action: 'reassign',
        sent,
        failed,
        results,
        counselorName: targetCounselor.user.fullName,
        warnings: [...new Set(results.flatMap((result) => result.warning ? [result.warning] : []))],
      });
    }

    const trimmedReason = parsed.data.reason.trim();
    for (const memberId of memberIds) {
      try {
        if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
          results.push({ memberId, ok: false, error: 'not_found' });
          failed += 1;
          continue;
        }
        await auditLog({
          actorUserId: user.id,
          action: INBOX_ZERO_DISMISS_ACTION,
          targetType: 'User',
          targetId: memberId,
          metadata: {
            memberId,
            reason: trimmedReason,
            flags: parsed.data.flags ?? [],
            dismissedAt: new Date().toISOString(),
            bulk: true,
          },
        });
        const dismissFlags = parsed.data.flags ?? [];
        await prisma.$transaction((tx) => persistEvent({
          userId: memberId,
          eventName: 'counselor_inbox_zero_dismissed',
          metadata: {
            dismissedBy: user.id,
            reason: trimmedReason,
            flags: dismissFlags,
            bulk: true,
          },
        }, tx))
          .catch((e) => console.error('[bulk dismiss] memberEvent:', e));
        await logInboxZeroBulkAuditEvent({
          actorUserId: user.id,
          memberId,
          verb: 'voided',
          action: INBOX_ZERO_DISMISS_ACTION,
          request,
          extensions: {
            reason: trimmedReason,
            flags: parsed.data.flags ?? [],
            batchSize: memberIds.length,
          },
        }).catch((e) => console.error('[bulk dismiss] AuditEvent:', e));
        results.push({ memberId, ok: true });
        sent += 1;
      } catch (e) {
        console.error('[bulk dismiss]', memberId, e);
        results.push({ memberId, ok: false, error: 'internal' });
        failed += 1;
      }
    }

    return NextResponse.json({ ok: true, action: 'dismiss', sent, failed, results });
  } catch (err) {
    console.error('[counselor/inbox-zero/bulk] unhandled:', err);
    return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 });
  }
});
