import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin, requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  getProgramBySlug,
} from '@/lib/content/programs';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import { rewardReferralOnEnrollment } from '@/lib/member/referrals';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';

class MemberProgramScopeChangedError extends Error {}

export const PATCH = withApiGuc(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await requireAdmin(user.id);

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const programSlug = typeof o.programSlug === 'string'
    ? canonicalizeProgramSlug(o.programSlug)
    : '';

  if (!programSlug) {
    return NextResponse.json({ error: 'programSlug required' }, { status: 400 });
  }

  const program = getProgramBySlug(programSlug);
  if (!program) {
    return NextResponse.json({ error: 'Invalid program' }, { status: 400 });
  }
  if (program.curriculumMigrationPending) {
    return NextResponse.json(
      {
        error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
        code: CURRICULUM_MIGRATION_PENDING_CODE,
      },
      { status: 409 },
    );
  }

  // Org admins stay inside their own tenant. Platform super-admins may act on
  // the subject tenant because the matching admin member page intentionally
  // supports cross-tenant operations.
  const superAdmin = await isSuperAdmin(user.id);
  const subjectOrgId = await getSubjectOrganizationId(id).catch(() => null);
  if (!subjectOrgId) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  const actorOrgId = superAdmin ? null : await getActorOrganizationId(user.id);
  if (!canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId, superAdmin })) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  const orgId = subjectOrgId;

  const [target, catalogSize, catalogEntry] = await Promise.all([
    prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, enrolledProgram: true },
    }),
    prisma.organizationProgramCatalog.count({ where: { organizationId: orgId } }),
    prisma.organizationProgramCatalog.findFirst({
      where: { organizationId: orgId, programSlug, status: 'active' },
      select: { programSlug: true },
    }),
  ]);
  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  // Match the admin member picker: organizations with an explicit catalog may
  // only assign programs in that catalog. Empty catalogs retain the global
  // static fallback used by legacy/default tenants.
  if (catalogSize > 0 && !catalogEntry) {
    return NextResponse.json(
      { error: "Program is not available for this member's organization." },
      { status: 400 },
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const memberUpdate = await tx.user.updateMany({
      where: { id, organizationId: orgId, deletedAt: null },
      data: {
        enrolledProgram: programSlug,
        programChangedAt: now,
        enrolledAt: now,
      },
    });
    if (memberUpdate.count !== 1) throw new MemberProgramScopeChangedError();
    // Multi-program: admin "set program" picks the user's primary
    // enrollment. Demote any other primary first to satisfy the partial
    // unique index, then upsert this program's row as primary.
    await tx.courseEnrollment.updateMany({
      where: {
        organizationId: orgId,
        userId: id,
        isPrimary: true,
        programSlug: { not: programSlug },
      },
      data: { isPrimary: false },
    });
    await upsertEquivalentCourseEnrollment(tx, {
      userId: id,
      programSlug,
      preserveLegacyAssignment: Boolean(
        target.enrolledProgram
        && programSlugsEquivalent(target.enrolledProgram, programSlug),
      ),
      create: {
        organizationId: orgId,
        curriculumVersion: activeCurriculumVersion(programSlug),
        isPrimary: true,
        enrolledAt: now,
        enrolledByAdminId: user.id,
      },
      update: {
        isPrimary: true,
        enrolledAt: now,
        enrolledByAdminId: user.id,
      },
    });
  });

  // The program write has committed. Notification/cache failures must not
  // turn that successful mutation into a misleading 500 in the admin UI.
  const postCommitResults = await Promise.allSettled([
    sendPartnerMilestoneEmail(id, 'Program enrollment', {
      Program: program.title,
    }),
    invalidateMemberState(id),
    // Staff-led enrollment is an enrollment trigger (WAP-32): pay a referral captured at signup. Idempotent.
    rewardReferralOnEnrollment(id),
  ]);
  for (const result of postCommitResults) {
    if (result.status === 'rejected') {
      console.error('[admin/member-program] post-commit side effect failed', result.reason);
    }
  }

  auditLog({ actorUserId: user.id, action: 'admin_member_program_change', targetType: 'User', targetId: id, metadata: { programSlug, orgId } }).catch((err) => console.error('[audit] admin_member_program_change:', err));
  logAuditEvent({ user: { id: user.id, role: superAdmin ? 'super_admin' : 'admin' }, verb: 'updated', object: { type: 'User', id }, result: { success: true, extensions: { programSlug } }, request: auditRequestMeta(request), orgId }).catch((err) => console.error('[audit] admin_member_program_change xapi:', err));

  return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof MemberProgramScopeChangedError) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    console.error('/admin/members/[id]/program error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
