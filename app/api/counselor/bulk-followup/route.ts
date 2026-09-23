import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { isCounselor, isAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  assertStaffCanPost,
  getOrCreateMemberCounselorThread,
  normalizeMessageBody,
} from '@/lib/messages/counselorThread';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import {
  getFollowUpTemplate,
  renderFollowUpTemplate,
} from '@/lib/counselor/followUpTemplates';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { persistEvent } from '@/lib/events/track';
import {
  BULK_FOLLOW_UP_REPEAT_ERROR,
  lockAndCheckRecentBulkFollowUp,
  notifyMemberOfBulkFollowUp,
} from '@/lib/counselor/bulkFollowUpGuard';

/**
 * POST /api/counselor/bulk-followup
 *
 * Sprint R5 — Counselor inbox-zero / bulk follow-up.
 *
 * Body: { memberIds: string[]; templateId: 'check_in' | 'stale_training' | 'application_nudge' }
 *
 * Auth: caller must be a counselor (or admin). For each memberId the route
 * verifies the staff user can post on that member's counselor thread — this
 * implicitly enforces both org-scope and counselor-assignment scope through
 * the existing `assertStaffCanPost` predicate (see lib/messages/counselorThread.ts).
 *
 * Idempotency / partial failure:
 *   - Each member's send is wrapped in its own transaction so a single bad
 *     row doesn't poison the whole batch.
 *   - Repeat guard (lib/counselor/bulkFollowUpGuard.ts): a member who got the
 *     same template from either bulk route in the last 24 h is skipped
 *     (`skipped: true`, counted in `skipped`, not `failed`).
 *   - Each member actually sent a message gets one in-app notification.
 *   - The response includes per-member status so the UI can render a
 *     red/green list of outcomes.
 */

const MAX_BATCH = 50;

type BulkResultEntry = {
  memberId: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Same template already sent within the repeat window; not a failure. */
  skipped?: boolean;
};

async function handle(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = (await isCounselor(user.id)) || (await isAdmin(user.id));
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw: unknown = await request.json().catch(() => null);
    const json = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as {
      memberIds?: unknown;
      templateId?: unknown;
    };

    const memberIds = Array.isArray(json.memberIds)
      ? json.memberIds.filter((m): m is string => typeof m === 'string' && m.length > 0)
      : [];
    const templateId = typeof json.templateId === 'string' ? json.templateId : '';

    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'memberIds required' }, { status: 400 });
    }
    if (memberIds.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Cannot send more than ${MAX_BATCH} messages in one batch` },
        { status: 400 },
      );
    }

    const template = getFollowUpTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: 'Unknown templateId' }, { status: 400 });
    }

    // Deduplicate memberIds so the same member can't be sent the same
    // template twice in one batch (e.g. accidentally selected twice).
    const uniqueIds = Array.from(new Set(memberIds));

    // Pre-fetch member rows in one query for personalization context.
    const members = await prisma.$transaction((tx) => tx.user.findMany({
      take: MAX_BATCH,
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
      },
    }));
    const memberById = new Map(members.map((m) => [m.id, m]));

    const results: BulkResultEntry[] = [];

    for (const memberId of uniqueIds) {
      const member = memberById.get(memberId);
      if (!member) {
        results.push({ memberId, ok: false, error: 'Member not found' });
        continue;
      }

      try {
        // Member-level gate first so a forbidden member id never gets a
        // thread created as a side effect of the check below.
        if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
          results.push({ memberId, ok: false, error: 'Forbidden' });
          continue;
        }

        // Ensure the thread exists, then re-use the existing staff-can-post
        // check. This is the org-scope + assignment gate per the spec.
        const thread = await getOrCreateMemberCounselorThread(memberId);
        const canPost = await assertStaffCanPost(user.id, thread.id);
        if (!canPost) {
          results.push({ memberId, ok: false, error: 'Forbidden' });
          continue;
        }

        const program = member.enrolledProgram
          ? getProgramBySlug(member.enrolledProgram)
          : null;
        const programName = member.enrolledProgram ? programDisplayTitle(member.enrolledProgram) : null;

        const composed = renderFollowUpTemplate(template, {
          memberName: member.fullName,
          programName,
          certName: program?.title ?? null,
        });

        const normalized = normalizeMessageBody(composed);
        if (!normalized.ok) {
          results.push({ memberId, ok: false, error: normalized.error });
          continue;
        }

        const message = await prisma.$transaction(async (tx) => {
          if (await lockAndCheckRecentBulkFollowUp(tx, { memberId, templateId: template.id })) {
            return null;
          }
          const created = await tx.message.create({
            data: {
              threadId: thread.id,
              authorId: user.id,
              body: normalized.body,
            },
            select: { id: true },
          });

          await persistEvent({
            userId: memberId,
            eventName: 'counselor_bulk_followup_sent',
            entityType: 'message',
            entityId: created.id,
            metadata: {
              templateId: template.id,
              templateName: template.name,
              templateSubject: template.subject,
              counselorUserId: user.id,
              threadId: thread.id,
              batchSize: uniqueIds.length,
            },
          }, tx);

          return created;
        });

        if (!message) {
          results.push({ memberId, ok: false, skipped: true, error: BULK_FOLLOW_UP_REPEAT_ERROR });
          continue;
        }

        await notifyMemberOfBulkFollowUp({
          memberId,
          threadId: thread.id,
          authorId: user.id,
          body: normalized.body,
        });

        results.push({ memberId, ok: true, messageId: message.id });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Send failed';
        console.error('[bulk-followup] failed for member', memberId, err);
        results.push({ memberId, ok: false, error });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.length - sent - skipped;

    auditLog({
      actorUserId: user.id,
      action: 'counselor_bulk_followup_sent',
      targetType: 'User',
      targetId: user.id,
      metadata: { templateId, sent, skipped, failed, memberIds },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'counselor' },
      verb: 'sent',
      object: { type: 'BulkFollowup', id: templateId },
      result: { success: true, extensions: { sent, skipped, failed, memberCount: memberIds.length } },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      template: { id: template.id, name: template.name, subject: template.subject },
      sent,
      skipped,
      failed,
      results,
    });
  } catch (err) {
    console.error('/api/counselor/bulk-followup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiGuc(handle);
