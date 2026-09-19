import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { WIOA_REVIEW_STATUSES } from '@/lib/wioa/wioaReview';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import {
  COUNSELOR_WIOA_STATUS_FORBIDDEN_MESSAGE,
  canReviewActorActOnMember,
  canReviewActorSetWioaStatus,
  resolveReviewActor,
} from '@/lib/counselor/applicationReviewAccess';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';
import { logAuditEvent, auditRequestMeta } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { lockMemberForReview } from '@/lib/counselor/lockMemberForReview';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 3).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * The lookup uses tenant scope. The transaction repeats the organization
 * and active-member predicates, locks the member and checks its current
 * counselor assignment before a compare-and-set review write.
 *
 * 2026-09-19: active counselors may also record the review, limited to
 * members assigned to them and to intake statuses (never `not_eligible`);
 * see `lib/counselor/applicationReviewAccess.ts`.
 */

const bodySchema = z.object({
  status: z.enum(WIOA_REVIEW_STATUSES),
  notes: z.string().max(8000).optional().nullable(),
});

// Required separately so old/stale clients receive actionable reload guidance,
// rather than silently reviewing evidence they did not load.
const revisionSchema = z.object({
  expectedSubmittedAt: z.string().datetime({ offset: true }),
  expectedReviewedAt: z.string().datetime({ offset: true }).nullable(),
});
const revisionConflictMessage = 'This screening or review changed. Reload and review the latest submission before saving.';

type Props = { params: Promise<{ id: string }> };

async function _PATCH(request: NextRequest, { params }: Props) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const actor = await resolveReviewActor(user.id);
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: memberId } = await params;
    if (!(await canReviewActorActOnMember(actor, memberId))) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const orgId = await getActorOrganizationId(user.id);

    const member = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id: memberId, deletedAt: null },
        select: { id: true, wioaQualificationJson: true, wioaReviewStatus: true, wioaReviewNotes: true, wioaReviewedAt: true },
      }),
    );
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!member.wioaQualificationJson) {
      return NextResponse.json({ error: 'Member has no WIOA self-screening on file' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    if (!canReviewActorSetWioaStatus(actor, parsed.data.status)) {
      return NextResponse.json({ error: COUNSELOR_WIOA_STATUS_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const revision = revisionSchema.safeParse(body);
    const screening = parseWioaQualificationSnapshot(member.wioaQualificationJson);
    const savedSubmittedAt = z.string().datetime({ offset: true }).safeParse(screening?.submittedAt);
    if (!revision.success || !savedSubmittedAt.success ||
        revision.data.expectedSubmittedAt !== savedSubmittedAt.data ||
        revision.data.expectedReviewedAt !== (member.wioaReviewedAt?.toISOString() ?? null)) {
      return NextResponse.json({ error: revisionConflictMessage }, { status: 409 });
    }

    const now = new Date();
    if (!interactiveTransactionsGuaranteed()) {
      return NextResponse.json({ error: 'Review storage is temporarily unavailable' }, { status: 503 });
    }
    const reviewed = await prisma.$transaction(async (tx) => {
      if (!(await lockMemberForReview(tx, {
        memberId, organizationId: orgId, actorUserId: actor.userId, actorRole: actor.role,
      }))) return false;
      const updated = await tx.user.updateMany({
        where: {
          id: memberId, organizationId: orgId, deletedAt: null,
          wioaReviewStatus: member.wioaReviewStatus, wioaReviewNotes: member.wioaReviewNotes,
          wioaReviewedAt: member.wioaReviewedAt,
          // A resubmission may also be pending with null notes. Guard the
          // captured answers so new evidence cannot be approved unseen.
          wioaQualificationJson: { equals: member.wioaQualificationJson as Prisma.InputJsonValue },
        },
        data: {
          wioaReviewStatus: parsed.data.status,
          wioaReviewNotes: parsed.data.notes?.trim() || null,
          wioaReviewedAt: now,
          wioaReviewedByUserId: user.id,
        },
      });
      if (updated.count !== 1) throw new Error('WIOA_REVIEW_CONFLICT');
      await recordWioaReviewSnapshot({
        organizationId: orgId,
        userId: memberId,
        source: 'wioa_review',
        decision: parsed.data.status,
        notes: parsed.data.notes?.trim() || null,
        actorUserId: user.id,
      }, tx);
      await auditLog({ actorUserId: user.id, action: 'member_wioa_review', targetType: 'user', targetId: memberId, metadata: { status: parsed.data.status } }, tx);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!reviewed) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    logAuditEvent({
      user: { id: user.id, role: actor.role },
      verb: 'wioa_review',
      object: { type: 'User', id: memberId },
      result: { success: true, extensions: { status: parsed.data.status } },
      request: auditRequestMeta(request),
      orgId,
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      wioaReviewStatus: parsed.data.status,
      wioaReviewedAt: now.toISOString(),
      wioaReviewedByUserId: user.id,
      wioaReviewNotes: parsed.data.notes?.trim() || null,
    });

  } catch (error) {
    if ((error instanceof Error && error.message === 'WIOA_REVIEW_CONFLICT') ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ error: 'This review changed. Reload and try again.' }, { status: 409 });
    }
    console.error('/admin/members/[id]/wioa-review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);
