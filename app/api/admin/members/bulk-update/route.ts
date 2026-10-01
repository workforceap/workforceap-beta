import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { notifyCounselorOfStaffAssignment, type StaffAssignedMember } from '@/lib/counselor/staffAssignmentNotify';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import type { PipelineBoardStage, MemberStatus } from '@prisma/client';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  getProgramBySlug,
  isCurriculumMigrationPending,
} from '@/lib/content/programs';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';
import { rewardReferralOnEnrollment } from '@/lib/member/referrals';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';

const MAX_MEMBERS = 100;

const stageValues = ['applied', 'enrolled', 'in_training', 'certified', 'job_searching', 'placed'] as const;
const memberStatusValues = ['active', 'inactive', 'placed'] as const;

const bodySchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(MAX_MEMBERS),
  pipelineStage: z.enum(stageValues).nullable().optional(),
  memberStatus: z.enum(memberStatusValues).nullable().optional(),
  counselorUserId: z.string().uuid().nullable().optional(),
  programSlug: z.string().min(1).nullable().optional(),
});

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const {
      memberIds,
      pipelineStage,
      memberStatus,
      counselorUserId,
      programSlug: requestedProgramSlug,
    } = parsed.data;
    const programSlug = typeof requestedProgramSlug === 'string'
      ? canonicalizeProgramSlug(requestedProgramSlug)
      : requestedProgramSlug;
    const orgId = await getActorOrganizationId(user.id);

    // Validate that at least one field is being updated
    if (pipelineStage === undefined && memberStatus === undefined && counselorUserId === undefined && programSlug === undefined) {
      return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
    }
    if (programSlug && isCurriculumMigrationPending(programSlug)) {
      return NextResponse.json(
        {
          error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
          code: CURRICULUM_MIGRATION_PENDING_CODE,
        },
        { status: 409 },
      );
    }
    if (programSlug && !getProgramBySlug(programSlug)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 });
    }
    if (programSlug) {
      const [catalogSize, catalogEntry] = await withTenantScope(orgId, (db) =>
        Promise.all([
          db.organizationProgramCatalog.count(),
          db.organizationProgramCatalog.findFirst({
            where: { programSlug, status: 'active' },
            select: { programSlug: true },
          }),
        ]),
      );
      if (catalogSize > 0 && !catalogEntry) {
        return NextResponse.json(
          { error: "Program is not available for this organization's catalog." },
          { status: 400 },
        );
      }
    }

    // Fetch members within tenant scope
    const members = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: { id: { in: memberIds }, deletedAt: null },
        select: {
          id: true,
          email: true,
          fullName: true,
          enrolledProgram: true,
          pipelineBoardStage: true,
        },
      }),
    );

    if (members.length === 0) {
      return NextResponse.json({ error: 'No valid members found' }, { status: 404 });
    }

    // If counselor update requested, validate counselor exists, is active,
    // AND belongs to the actor's organization. Without the tenant scope a
    // crafted bulk-update request could attach in-tenant members to a
    // cross-tenant counselor — the dropdown in /admin/members itself uses
    // /api/admin/counselors (which is scoped), but the API accepts any
    // counselorUserId in the body.
    let counselor: { id: string; user: { id: string; fullName: string } } | null = null;
    if (counselorUserId) {
      counselor = await prisma.counselor.findFirst({
        where: {
          userId: counselorUserId,
          active: true,
          user: { organizationId: orgId, deletedAt: null },
        },
        include: { user: { select: { id: true, fullName: true } } },
      });
      if (!counselor) {
        return NextResponse.json({ error: 'Counselor not found or inactive' }, { status: 400 });
      }
    }

    let updatedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];
    const assignedToCounselor: StaffAssignedMember[] = [];

    // Report requested members that are gone or in another org as skipped,
    // so the modal does not say "Updated 7 of 7" when 10 were selected. Only
    // a count: never echo ids that may belong to another organization.
    const requestedCount = new Set(memberIds).size;
    const skippedCount = Math.max(0, requestedCount - members.length);
    if (skippedCount > 0) {
      errors.push(`${skippedCount} selected member${skippedCount === 1 ? ' was' : 's were'} not found or ${skippedCount === 1 ? 'is' : 'are'} outside your organization.`);
    }

    for (const member of members) {
      try {
        const updates: {
          pipelineBoardStage?: PipelineBoardStage | null;
          memberStatus?: MemberStatus | null;
          enrolledProgram?: string | null;
          enrolledAt?: Date | null;
          programChangedAt?: Date;
          updatedAt?: Date;
        } = {};

        if (pipelineStage !== undefined) {
          updates.pipelineBoardStage = pipelineStage as PipelineBoardStage | null;
        }
        if (memberStatus !== undefined) {
          updates.memberStatus = memberStatus as MemberStatus | null;
        }
        if (programSlug !== undefined) {
          updates.enrolledProgram = programSlug;
          updates.programChangedAt = new Date();
          updates.enrolledAt = programSlug ? new Date() : null;
        }
        updates.updatedAt = new Date();

        const handoff = await prisma.$transaction(async (tx) => {
          const updated = await tx.user.updateMany({
            where: { id: member.id, organizationId: orgId, deletedAt: null },
            data: updates,
          });
          if (updated.count !== 1) {
            throw new Error('Member is no longer available in this organization.');
          }

          if (programSlug !== undefined) {
            if (programSlug === null) {
              // Preserve funding, sponsorship, workspace-email, and enrollment
              // provenance. With the User mirror cleared and no primary row,
              // dashboard and xAPI resolution treat these rows as historical.
              await tx.courseEnrollment.updateMany({
                where: { organizationId: orgId, userId: member.id, isPrimary: true },
                data: { isPrimary: false },
              });
            } else {
              const enrolledAt = updates.enrolledAt ?? new Date();
              await tx.courseEnrollment.updateMany({
                where: {
                  organizationId: orgId,
                  userId: member.id,
                  isPrimary: true,
                  programSlug: { not: programSlug },
                },
                data: { isPrimary: false },
              });
              await upsertEquivalentCourseEnrollment(tx, {
                userId: member.id,
                programSlug,
                preserveLegacyAssignment: Boolean(
                  member.enrolledProgram
                  && programSlugsEquivalent(member.enrolledProgram, programSlug),
                ),
                create: {
                  organizationId: orgId,
                  curriculumVersion: activeCurriculumVersion(programSlug),
                  isPrimary: true,
                  enrolledAt,
                  enrolledByAdminId: user.id,
                },
                update: {
                  isPrimary: true,
                  enrolledAt,
                  enrolledByAdminId: user.id,
                },
              });
            }
          }
          if (counselorUserId !== undefined) {
            const assigned = await assignMemberCounselor(tx, {
              memberId: member.id, organizationId: orgId, counselorUserId,
            });
            return {
              previousCounselorUserId: assigned.previousCounselorUserId,
              previousCounselorName: assigned.previousCounselorName,
            };
          }
          return null;
        });

        updatedCount++;
        if (counselorUserId) {
          assignedToCounselor.push({
            memberId: member.id,
            memberName: member.fullName,
            previousCounselorUserId: handoff?.previousCounselorUserId ?? null,
          });
        }

        // Staff-led enrollment is an enrollment trigger too (WAP-32): pay a
        // referral captured at signup. Idempotent, non-blocking.
        if (programSlug) {
          rewardReferralOnEnrollment(member.id).catch((err) =>
            console.error(`[bulk-update] referral settlement failed for ${member.id}:`, err),
          );
        }

        // Cache invalidation and audit writes are important
        // post-commit work. Report a warning instead of lying to the UI that
        // the already-committed member mutation failed.
        try {
          await invalidateMemberState(member.id);
        } catch (cacheError) {
          console.error(`[bulk-update] member-state cache invalidation failed for ${member.id}:`, cacheError);
          warnings.push(`${member.fullName}: member updated, but cached portal data may take a few minutes to refresh.`);
        }

        const auditResults = await Promise.allSettled([auditLog({
          actorUserId: user.id,
          action: 'bulk_update_member',
          targetType: 'user',
          targetId: member.id,
          metadata: {
            pipelineStage: pipelineStage ?? null,
            memberStatus: memberStatus ?? null,
            counselorUserId: counselorUserId ?? null,
            ...(handoff ?? {}),
            programSlug: programSlug ?? null,
            previousProgram: member.enrolledProgram,
            previousStage: member.pipelineBoardStage,
          },
        }), logAuditEvent({
          user: { id: user.id, role: 'admin' },
          verb: 'updated',
          object: { type: 'MemberBulkUpdate', id: member.id },
          result: {
            success: true,
            extensions: {
              orgId,
              pipelineStage: pipelineStage ?? null,
              memberStatus: memberStatus ?? null,
              counselorUserId: counselorUserId ?? null,
              ...(handoff ?? {}),
              programSlug: programSlug ?? null,
              previousProgram: member.enrolledProgram,
              previousStage: member.pipelineBoardStage,
            },
          },
          request: auditRequestMeta(request),
          orgId,
        })]);
        if (auditResults.some((result) => result.status === 'rejected')) {
          console.error(`[bulk-update] audit follow-up failed for ${member.id}`);
          warnings.push(`${member.fullName}: member updated, but audit follow-up needs review.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${member.fullName} (${member.email}): ${msg}`);
        console.error(`[bulk-update] failed for ${member.id}:`, err);
      }
    }

    await notifyCounselorOfStaffAssignment({
      counselorUserId: counselorUserId ?? null,
      actorUserId: user.id,
      members: assignedToCounselor,
      logPrefix: '[bulk-update]',
    });

    return NextResponse.json({
      updated: updatedCount,
      total: requestedCount,
      skipped: skippedCount,
      errors,
      warnings,
    }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('/admin/members/bulk-update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
