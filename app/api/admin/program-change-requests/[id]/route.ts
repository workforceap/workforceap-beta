import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  isCurriculumMigrationPending,
} from '@/lib/content/programs';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';
import { rewardReferralOnEnrollment } from '@/lib/member/referrals';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';

const patchSchema = z.object({
  status: z.enum(['APPROVED', 'DENIED']),
  adminNote: z.string().max(4000).optional().nullable(),
});

export const PATCH = withApiGuc(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
  }

  // Tenant scope: super-admins can review any request; everyone else can
  // only act on requests whose member belongs to their organization.
  // findFirst (not findUnique) so the relation filter applies. Cross-tenant
  // ids surface as 404 to avoid leaking existence.
  let tenantFilter: object = {};
  if (!(await isSuperAdmin(user.id))) {
    try {
      tenantFilter = { user: { organizationId: await getActorOrganizationId(user.id) } };
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  const existing = await prisma.$transaction((tx) => tx.programChangeRequest.findFirst({
    where: { id, ...tenantFilter },
    include: { user: { select: { id: true, enrolledProgram: true, organizationId: true } } },
  }));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 });
  }
  const requestedProgramSlug = canonicalizeProgramSlug(existing.requestedProgramSlug);

  const nextStatus = parsed.data.status;
  const orgId = existing.user.organizationId;
  if (
    nextStatus === 'APPROVED'
    && isCurriculumMigrationPending(requestedProgramSlug)
  ) {
    return NextResponse.json(
      {
        error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
        code: CURRICULUM_MIGRATION_PENDING_CODE,
      },
      { status: 409 },
    );
  }

  const review = await prisma.$transaction(async (tx) => {
    const claim = await tx.programChangeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: nextStatus,
        adminNote: parsed.data.adminNote ?? null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    if (claim.count !== 1) return { claimed: false };

    if (nextStatus === 'APPROVED') {
      // Approving a counselor-initiated program-change request is a strong
      // signal that funding is confirmed for this learner: the counselor
      // submitted the request and an admin is now signing off. We auto-set
      // `courseraEnrollmentApproved` here so the member's "Enroll in this
      // course" button unlocks immediately on the new program. The flag is
      // never auto-set by DB defaults — only by explicit code paths like
      // this one and the admin "Approve enrollment" toggle. See
      // `docs/COURSERA-ENROLLMENT-FLOW.md`.
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          enrolledProgram: requestedProgramSlug,
          courseraEnrollmentApproved: true,
          courseraEnrollmentApprovedAt: new Date(),
          courseraEnrollmentApprovedById: user.id,
        },
      });

      // INVARIANT: CourseEnrollment must stay in sync with User.enrolledProgram.
      // When a program change is approved, update CourseEnrollment to reflect the
      // new program. Use upsert in case CourseEnrollment was never created (legacy data).
      const memberForOrg = await tx.user.findUnique({
        where: { id: existing.userId },
        select: { organizationId: true },
      });
      if (memberForOrg) {
        // Multi-program: a program-change request flips the user's primary
        // enrollment to the requested program. Demote any other primary
        // first (the partial unique index `course_enrollments_user_primary_uidx`
        // allows only one). Then upsert the requested-slug row as primary.
        await tx.courseEnrollment.updateMany({
          where: {
            userId: existing.userId,
            isPrimary: true,
            programSlug: { not: requestedProgramSlug },
          },
          data: { isPrimary: false },
        });
        await upsertEquivalentCourseEnrollment(tx, {
          userId: existing.userId,
          programSlug: requestedProgramSlug,
          preserveLegacyAssignment: Boolean(
            existing.user.enrolledProgram
            && programSlugsEquivalent(
              existing.user.enrolledProgram,
              requestedProgramSlug,
            ),
          ),
          create: {
            organizationId: memberForOrg.organizationId,
            curriculumVersion: activeCurriculumVersion(requestedProgramSlug),
            isPrimary: true,
            enrolledAt: new Date(),
            enrolledByAdminId: user.id,
          },
          update: {
            isPrimary: true,
            enrolledByAdminId: user.id,
          },
        });
      }
    }

    return { claimed: true };
  });
  if (!review.claimed) {
    return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 });
  }

  // Lifecycle event for approved program changes
  if (nextStatus === 'APPROVED') {
    // Approval enrolls the member (CourseEnrollment upsert above): settle any
    // referral captured at signup (WAP-32). Idempotent, non-blocking.
    rewardReferralOnEnrollment(existing.userId).catch((err) =>
      console.error('[program-change] referral settlement failed:', err),
    );

    trackEvent({
      userId: existing.userId,
      eventName: 'program_change_approved',
      entityType: 'ProgramChangeRequest',
      entityId: id,
      metadata: {
        from: existing.currentProgramSlug,
        to: requestedProgramSlug,
        approvedBy: user.id,
      },
    }).catch(() => {});

    // Audit-log the eligibility flag flip. Tracking this in the same place as
    // the other audit_logs rows (B4B writes, WIOA reviews) means a single
    // query on `target_id = <memberId>` shows the full Coursera-spend trail.
    auditLog({
      actorUserId: user.id,
      action: 'coursera_enrollment_approved',
      targetType: 'User',
      targetId: existing.userId,
      metadata: {
        source: 'program_change_request_approved',
        programChangeRequestId: id,
        programSlug: requestedProgramSlug,
      },
    }).catch(() => {});
  }

  const actorRole = (await isSuperAdmin(user.id)) ? 'super_admin' : 'admin';
  await logAuditEvent({
    user: { id: user.id, role: actorRole },
    verb: nextStatus === 'APPROVED' ? 'approved' : 'voided',
    object: { type: 'ProgramChangeRequest', id },
    result: {
      success: true,
      extensions: {
        previousStatus: existing.status,
        newStatus: nextStatus,
        userId: existing.userId,
        requestedProgramSlug,
      },
    },
    request: auditRequestMeta(req),
    orgId,
  }).catch((err) => console.error('[audit] program change review:', err));

  const updated = await prisma.$transaction((tx) => tx.programChangeRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, fullName: true, enrolledProgram: true } },
      reviewedBy: { select: { id: true, email: true, fullName: true } },
    },
  }));

  return NextResponse.json({ request: updated });

  } catch (error) {
    console.error('/admin/program-change-requests/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
