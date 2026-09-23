import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/auth/server';
import { isSuperAdmin, requireAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getB4BOrgId } from '@/lib/coursera/b4bClient';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import {
  COURSERA_ROSTER_INCOMPLETE_VIEW,
  EnrollStateError,
  runEnrollStateMachine,
} from '@/lib/coursera/enrollState';
import { buildB4BPort, CourseraRosterIncompleteError, writeEnrollAudit } from '@/lib/coursera/enrollPort';
import { captureApiError } from '@/lib/observability/captureApiError';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { getProgramBySlug } from '@/lib/content/programs';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import {
  getProgramCurriculumManifest,
  normalizeCourseraCourseId,
} from '@/lib/content/programCurriculumManifest';

/**
 * POST /api/admin/coursera/enroll-member
 * Body: `{ memberId: string, courseraCourseId?: string }`
 *
 * Admin one-click enrollment: runs the exact self-service state machine
 * (invite → membership → enroll, `lib/coursera/enrollState.ts`) with the
 * admin as the audit actor and the member as the target — the path the
 * self-service route's audit comment reserved for "a future
 * admin-impersonation enroll path".
 *
 * When `courseraCourseId` is omitted, the member is enrolled into the FIRST
 * course of their assigned program — "get them started" semantics. The
 * program-level invite + membership steps cover the whole Learning Path;
 * subsequent courses are one click each from the member's own dashboard.
 *
 * Guardrails (server-enforced):
 *   - admin-only + same-tenant for org admins; platform super-admin support
 *     may deliberately act in the subject member's tenant;
 *   - `courseraEnrollmentApproved` must already be true → 409 otherwise.
 *     This button does NOT auto-approve: approval is the budget gate and
 *     stays an explicit, separately-audited decision;
 *   - member must have an assigned program that exists in the catalog;
 *   - every B4B write lands in `audit_logs` with `enrolledByAdmin`.
 */
const bodySchema = z.object({
  memberId: z.string().min(1),
  courseraCourseId: z.string().trim().min(1).optional(),
});

async function _POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await requireAdmin(user.id);

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { memberId } = parsed.data;

    // Operate in the subject's org. Org admins remain same-tenant; platform
    // super-admins retain deliberate cross-tenant support access.
    const superAdmin = await isSuperAdmin(user.id);
    const subjectOrgId = await getSubjectOrganizationId(memberId).catch(() => null);
    if (!subjectOrgId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    const actorOrgId = superAdmin ? null : await getActorOrganizationId(user.id);
    if (!canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId, superAdmin })) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = await withTenantScope(subjectOrgId, (db) =>
      db.user.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          email: true,
          fullName: true,
          enrolledProgram: true,
          courseraEnrollmentApproved: true,
          courseEnrollments: {
            select: {
              id: true,
              programSlug: true,
              curriculumVersion: true,
              isPrimary: true,
              enrolledAt: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          },
        },
      }),
    );
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!member.email) {
      return NextResponse.json(
        { error: 'Member has no email on file.', code: 'NO_EMAIL' },
        { status: 409 },
      );
    }
    if (!member.courseraEnrollmentApproved) {
      return NextResponse.json(
        {
          error: 'Member is not approved for Coursera enrollment. Approve them first — approval is the seat-budget gate.',
          code: 'NOT_APPROVED',
        },
        { status: 409 },
      );
    }
    const { activeProgramSlug: enrolledProgram } = resolveActiveDashboardProgram({
      enrollments: member.courseEnrollments,
      legacyEnrolledProgram: member.enrolledProgram,
    });
    if (!enrolledProgram) {
      return NextResponse.json(
        { error: 'Member has no assigned program.', code: 'NO_PROGRAM' },
        { status: 409 },
      );
    }
    const enrollment = member.courseEnrollments.find(
      (row) => row.programSlug === enrolledProgram,
    );
    const curriculumVersion = enrollment?.curriculumVersion ?? 'legacy-v1';
    const program = getProgramBySlug(enrolledProgram);
    const discoveredProgram = DISCOVERED_COURSERA_PROGRAMS[enrolledProgram];
    if (!program || !discoveredProgram) {
      return NextResponse.json(
        { error: 'Program not in Coursera catalog.', code: 'PROGRAM_NOT_MAPPED' },
        { status: 409 },
      );
    }

    const assignedCourses = getProgramCoursesForCurriculumVersion(program, curriculumVersion);
    const requestedCourseId = normalizeCourseraCourseId(parsed.data.courseraCourseId);
    const course = requestedCourseId
      ? assignedCourses.find(
          (candidate) =>
            normalizeCourseraCourseId(candidate.courseraCourseId) === requestedCourseId,
        )
      : assignedCourses.find((candidate) => Boolean(candidate.courseraCourseId));
    if (!course) {
      return NextResponse.json(
        { error: "Course not in the member's program.", code: 'COURSE_NOT_IN_PROGRAM' },
        { status: 400 },
      );
    }

    const approvedTrack = getProgramCurriculumManifest(enrolledProgram, curriculumVersion)?.externalTrack;
    if (approvedTrack && (approvedTrack.status !== 'validated' || !approvedTrack.collectionId)) {
      return NextResponse.json(
        {
          error: 'The approved Coursera learning path is still pending exact-set validation.',
          code: 'CURRICULUM_TRACK_PENDING',
        },
        { status: 409 },
      );
    }
    const externalId = member.email.trim().toLowerCase();
    let result;
    try {
      result = await runEnrollStateMachine(buildB4BPort(), {
        orgId: getB4BOrgId(),
        programId: approvedTrack?.collectionId ?? discoveredProgram.courseraProgramId,
        courseraCourseId: course.courseraCourseId!,
        externalId,
        email: member.email,
        fullName: member.fullName ?? member.email,
      });
    } catch (err) {
      if (err instanceof EnrollStateError) {
        await Promise.allSettled(
          err.events.map((event) =>
            writeEnrollAudit({
              actorUserId: user.id,
              actorRole: superAdmin ? 'super_admin' : 'admin',
              targetUserId: member.id,
              event,
            }),
          ),
        );
        captureApiError(err, {
          route: 'admin/coursera/enroll-member',
          extra: { memberId: member.id, adminId: user.id, step: err.step, httpStatus: err.httpStatus },
        });
        const adminFacing =
          err.httpStatus >= 500
            ? 'Coursera is temporarily unavailable. Try again in a moment.'
            : err.message;
        return NextResponse.json(
          { error: adminFacing, step: err.step, code: 'B4B_FAILURE' },
          { status: 502 },
        );
      }
      if (err instanceof CourseraRosterIncompleteError) {
        captureApiError(err, {
          route: 'admin/coursera/enroll-member',
          extra: { memberId: member.id, adminId: user.id, reason: err.reason },
        });
        return NextResponse.json(
          {
            code: COURSERA_ROSTER_INCOMPLETE_VIEW.code,
            error:
              "Couldn't finish checking the Coursera roster, so no invitation was sent. Try again in a few minutes.",
          },
          { status: 503 },
        );
      }
      captureApiError(err, {
        route: 'admin/coursera/enroll-member',
        extra: { memberId: member.id, adminId: user.id },
      });
      return NextResponse.json({ error: 'Unexpected error during enrollment.' }, { status: 500 });
    }

    // Sequential, same as the self-service route: the audit trail should read
    // in state-graph order.
    for (const event of result.events) {
      await writeEnrollAudit({
        actorUserId: user.id,
        actorRole: superAdmin ? 'super_admin' : 'admin',
        targetUserId: member.id,
        event,
      }).catch((auditErr) => {
        captureApiError(auditErr, {
          route: 'admin/coursera/enroll-member',
          extra: { memberId: member.id, step: event.step, note: 'audit-write-failed' },
        });
      });
    }

    if (result.status === 'enrolled' || result.status === 'membership-created-and-enrolled') {
      void triggerAutoSyncBestEffort({
        wapUserId: member.id,
        orgId: subjectOrgId,
        adminId: user.id,
        email: member.email,
        enrolledProgram,
      }).catch(() => {
        /* fire-and-forget */
      });
    }

    return NextResponse.json({
      status: result.status,
      message: result.message,
      courseName: course.name,
    });
  } catch (error) {
    console.error('/admin/coursera/enroll-member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Same best-effort post-enroll seed as the self-service route, with the
 * admin recorded as `enrolledByAdmin` for the sync bookkeeping. */
async function triggerAutoSyncBestEffort(args: {
  wapUserId: string;
  orgId: string;
  adminId: string;
  email: string;
  enrolledProgram: string | null;
}): Promise<void> {
  const { listCourseraIdentityMappingsForUser } = await import('@/lib/xapi/mappings');
  const mappings = await listCourseraIdentityMappingsForUser(args.wapUserId).catch(
    () => [] as Array<{ courseraEmail: string | null }>,
  );
  const courseraEmail = mappings.find((m) => m.courseraEmail)?.courseraEmail ?? args.email;
  if (!courseraEmail) return;

  const { syncUserFromB4B } = await import('@/lib/coursera/syncUserFromB4B');
  await syncUserFromB4B({
    email: courseraEmail.toLowerCase(),
    wapUserId: args.wapUserId,
    orgId: args.orgId,
    enrolledByAdmin: args.adminId,
    existingEnrolledProgram: args.enrolledProgram,
  }).catch(() => {
    /* swallow — auto-sync is fire-and-forget */
  });
}

export const POST = withApiGuc(_POST);
