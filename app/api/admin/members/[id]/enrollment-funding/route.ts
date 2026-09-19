import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { FundingSource, Prisma } from '@prisma/client';
import { auditLog } from '@/lib/audit';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';

const bodySchema = z.object({
  fundingSource: z.nativeEnum(FundingSource).optional().nullable(),
  fundingNotes: z.string().max(8000).optional().nullable(),
  workspaceEmail: z.string().email().max(320).optional().nullable(),
  workspaceEmailProvisioned: z.boolean().optional(),
});

type Props = { params: Promise<{ id: string }> };

export const POST = withApiGuc(async (request: NextRequest, { params }: Props) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: memberId } = await params;
    const orgId = await getActorOrganizationId(user.id);

    const member = await prisma.$transaction((tx) => tx.user.findFirst({
      where: { id: memberId, deletedAt: null, organizationId: orgId },
      select: { id: true },
    }));
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

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

    const d = parsed.data;
    if (!interactiveTransactionsGuaranteed()) {
      return NextResponse.json({ error: 'Funding storage is temporarily unavailable' }, { status: 503 });
    }

    // Multi-program: funding/workspace metadata lives on the primary
    // enrollment row only. If a user has multiple enrollments, the secondary
    // ones don't get their own funding source through this UI.
    const outcome = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.findFirst({
        where: { userId: memberId, organizationId: orgId, isPrimary: true },
        select: { id: true, fundingSource: true, fundingNotes: true },
      });
      if (!enrollment && Boolean(d.fundingSource || d.fundingNotes?.trim())) {
        return { missingEnrollment: true, enrollmentFundingSaved: false };
      }
      if (enrollment) {
        const updated = await tx.courseEnrollment.updateMany({
          where: { id: enrollment.id, userId: memberId, organizationId: orgId, isPrimary: true },
          data: {
            fundingSource: d.fundingSource ?? null,
            fundingNotes: d.fundingNotes ?? null,
            workspaceEmail: d.workspaceEmail ?? null,
            workspaceEmailProvisioned: d.workspaceEmailProvisioned ?? false,
          },
        });
        if (updated.count !== 1) throw new Error('ENROLLMENT_FUNDING_CONFLICT');
        const grantChanged = (enrollment.fundingSource === 'GRANT' || d.fundingSource === 'GRANT') &&
          (enrollment.fundingSource !== (d.fundingSource ?? null) || enrollment.fundingNotes !== (d.fundingNotes ?? null));
        if (grantChanged) {
          await recordWioaReviewSnapshot({
            organizationId: orgId, userId: memberId, actorUserId: user.id,
            source: 'enrollment_funding', decision: d.fundingSource ?? 'UNSPECIFIED',
            notes: d.fundingNotes ?? null,
            funding: { enrollmentId: enrollment.id, previousSource: enrollment.fundingSource, source: d.fundingSource ?? null },
          }, tx);
        }
      }

      // Always sync workspaceEmail + provisioned flag to User
      const userUpdated = await tx.user.updateMany({
        where: { id: memberId, organizationId: orgId, deletedAt: null },
        data: {
          workspaceEmail: d.workspaceEmail ?? null,
          workspaceEmailProvisioned: d.workspaceEmailProvisioned ?? false,
        },
      });
      if (userUpdated.count !== 1) throw new Error('ENROLLMENT_FUNDING_CONFLICT');

      await auditLog({
        actorUserId: user.id,
        action: 'admin_enrollment_funding_update',
        targetType: 'User',
        targetId: memberId,
        metadata: { fundingSource: d.fundingSource ?? null, workspaceEmailProvisioned: d.workspaceEmailProvisioned ?? false, orgId },
      }, tx);
      return { missingEnrollment: false, enrollmentFundingSaved: Boolean(enrollment) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (outcome.missingEnrollment) {
      return NextResponse.json({ error: 'Create a primary program enrollment before saving funding details.' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      enrollmentFundingSaved: outcome.enrollmentFundingSaved,
      workspaceSaved: true,
    });

  } catch (error) {
    if ((error instanceof Error && error.message === 'ENROLLMENT_FUNDING_CONFLICT') ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ error: 'This enrollment changed. Reload and try again.' }, { status: 409 });
    }
    console.error('/admin/members/[id]/enrollment-funding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
