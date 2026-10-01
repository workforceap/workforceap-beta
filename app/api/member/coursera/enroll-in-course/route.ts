import { after, NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getB4BOrgId } from '@/lib/coursera/b4bClient';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import {
  COURSERA_ROSTER_INCOMPLETE_VIEW,
  EnrollStateError,
  enrollFailureView,
  runEnrollStateMachine,
} from '@/lib/coursera/enrollState';
import { buildB4BPort, CourseraRosterIncompleteError, writeEnrollAudit } from '@/lib/coursera/enrollPort';
import { captureApiError } from '@/lib/observability/captureApiError';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getProgramBySlug } from '@/lib/content/programs';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import {
  getProgramCurriculumManifest,
  normalizeCourseraCourseId,
} from '@/lib/content/programCurriculumManifest';

/**
 * POST /api/member/coursera/enroll-in-course
 * Body: `{ courseraCourseId: string }` — that's all the client sends.
 * The server resolves the active program, B4B org, and invite/membership/
 * enroll path from the authenticated session.
 *
 * Eligibility rules (server-enforced — never trust the client):
 *   1. `User.courseraEnrollmentApproved` must be `true` → otherwise 403.
 *      The flag is set by the counselor approval / admin toggle paths
 *      documented in `docs/COURSERA-ENROLLMENT-FLOW.md`.
 *   2. `User.enrolledProgram` must be set (member has chosen a program) →
 *      otherwise 400.
 *   3. The requested `courseraCourseId` must belong to the user's enrolled
 *      program (cross-program click protection) → otherwise 400.
 *
 * State graph (delegated to `lib/coursera/enrollState.ts`):
 *   - Not in B4B roster        → invite (Coursera emails them) → 'invited'
 *   - In roster, not in program → membership + enroll          → 'membership-created-and-enrolled'
 *   - In program, not in course → enroll                        → 'enrolled'
 *   - Already enrolled          → 200 + 'already-enrolled' (idempotent re-clicks)
 *
 * Every B4B write produces an `audit_logs` row whose actor is the
 * authenticated user (the member is the actor for self-service enrolls).
 * We chose `audit_logs` rather than inventing a new table because the
 * existing infra already records WIOA reviews, role changes, and admin
 * impersonation — the Coursera seat-spend trail belongs in the same place.
 *
 * 4xx behavior: a 4xx from Coursera (e.g. "already enrolled") is folded
 * into a 200 status='already-enrolled' so a double-click doesn't surface
 * an error toast. 5xx and unknown 4xx propagate as 502 with the audit
 * trail of whatever did succeed before the failure, carrying fixed copy
 * from `enrollFailureView` (never the provider's text). An incomplete
 * roster scan returns 503 COURSERA_ROSTER_INCOMPLETE: nothing was sent.
 */
async function _POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.email) {
      return NextResponse.json(
        { error: 'No email on file. Contact your counselor.' },
        { status: 400 },
      );
    }
  
    const o = await readJsonObjectBody(request);
    if (!o) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const courseraCourseId = normalizeCourseraCourseId(
      typeof o.courseraCourseId === 'string' ? o.courseraCourseId : '',
    );
    if (!courseraCourseId) {
      return NextResponse.json({ error: 'courseraCourseId required' }, { status: 400 });
    }
  
    let orgId: string;
    try {
      orgId = await getActorOrganizationId(user.id);
    } catch (err) {
      captureApiError(err, { route: 'member/coursera/enroll-in-course', extra: { stage: 'getActorOrganizationId' } });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    // Read the user's eligibility + program through the tenant-scoped proxy.
    // Self-only: there is no `memberId` in the body, by design.
    const dbUser = await withTenantScope(orgId, (db) =>
      db.user.findUnique({
        where: { id: user.id },
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
    if (!dbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    // Gate 1: eligibility flag.
    if (!dbUser.courseraEnrollmentApproved) {
      return NextResponse.json(
        {
          error: 'Enrollment locked',
          code: 'NOT_APPROVED',
          message:
            "Enrollment is locked. Your counselor will enable this when funding is confirmed.",
        },
        { status: 403 },
      );
    }
  
    // Gate 2: enrolled program.
    const { activeProgramSlug: enrolledProgram } = resolveActiveDashboardProgram({
      enrollments: dbUser.courseEnrollments,
      legacyEnrolledProgram: dbUser.enrolledProgram,
    });
    if (!enrolledProgram) {
      return NextResponse.json(
        {
          error: 'Choose a program first',
          code: 'NO_PROGRAM',
        },
        { status: 400 },
      );
    }
  
    // Gate 3: course belongs to the user's program.
    const enrollment = dbUser.courseEnrollments.find(
      (row) => row.programSlug === enrolledProgram,
    );
    const curriculumVersion = enrollment?.curriculumVersion ?? 'legacy-v1';
    const program = getProgramBySlug(enrolledProgram);
    const discoveredProgram = DISCOVERED_COURSERA_PROGRAMS[enrolledProgram];
    if (!program || !discoveredProgram) {
      return NextResponse.json(
        { error: 'Program not in Coursera catalog', code: 'PROGRAM_NOT_MAPPED' },
        { status: 400 },
      );
    }
    const assignedCourses = getProgramCoursesForCurriculumVersion(program, curriculumVersion);
    const courseInProgram = assignedCourses.find(
      (course) => normalizeCourseraCourseId(course.courseraCourseId) === courseraCourseId,
    );
    if (!courseInProgram) {
      return NextResponse.json(
        {
          error: 'Course not in your program',
          code: 'COURSE_NOT_IN_PROGRAM',
        },
        { status: 400 },
      );
    }
  
    // Shared B4B port (lib/coursera/enrollPort.ts): roster lookup with a
    // short-TTL cache, plus the invite/membership/enroll write bindings —
    // identical machinery to the admin one-click route.
    const b4bOrgId = getB4BOrgId();
    const approvedTrack = getProgramCurriculumManifest(enrolledProgram, curriculumVersion)?.externalTrack;
    if (approvedTrack && (approvedTrack.status !== 'validated' || !approvedTrack.collectionId)) {
      return NextResponse.json(
        {
          error: 'This approved Coursera learning path is still being validated.',
          code: 'CURRICULUM_TRACK_PENDING',
        },
        { status: 409 },
      );
    }
    const programId = approvedTrack?.collectionId ?? discoveredProgram.courseraProgramId;

    const externalId = user.email.trim().toLowerCase();
    let result;
    try {
      result = await runEnrollStateMachine(buildB4BPort(), {
        orgId: b4bOrgId,
        programId,
        courseraCourseId,
        externalId,
        email: user.email,
        fullName: dbUser.fullName ?? user.email,
      });
    } catch (err) {
      if (err instanceof EnrollStateError) {
        // Audit-log every step that DID happen before the failure. We swallow
        // audit errors so a logging-table outage can't mask the original error.
        await Promise.allSettled(
          err.events.map((event) =>
            writeEnrollAudit({ actorUserId: user.id, actorRole: 'member', targetUserId: user.id, event }),
          ),
        );
        captureApiError(err, {
          route: 'member/coursera/enroll-in-course',
          extra: { userId: user.id, step: err.step, httpStatus: err.httpStatus },
        });
        // Fixed copy only: err.message embeds the provider's error text.
        return NextResponse.json(
          enrollFailureView({ step: err.step, httpStatus: err.httpStatus }),
          { status: 502 },
        );
      }
      if (err instanceof CourseraRosterIncompleteError) {
        // The roster scan stopped before any B4B write, so there is nothing
        // to audit. 503: the member can retry once the scan can complete.
        captureApiError(err, {
          route: 'member/coursera/enroll-in-course',
          extra: { userId: user.id, reason: err.reason },
        });
        return NextResponse.json(COURSERA_ROSTER_INCOMPLETE_VIEW, { status: 503 });
      }
      captureApiError(err, { route: 'member/coursera/enroll-in-course', extra: { userId: user.id } });
      return NextResponse.json(
        { error: 'Unexpected error during enrollment.' },
        { status: 500 },
      );
    }
  
    // Success path: audit each event sequentially. Sequential writes — not
    // parallel — because the audit_logs table has an index on (target_type,
    // target_id) and we want them to land in the same order as the B4B
    // calls so a downstream observer reading the audit trail sees the
    // state-graph order, not whatever Postgres scheduled.
    for (const event of result.events) {
      await writeEnrollAudit({ actorUserId: user.id, actorRole: 'member', targetUserId: user.id, event }).catch(() => {
        // A failure to audit must NOT undo the enrollment — the seat is
        // already spent. We surface the failure for triage but keep the
        // success response the user sees.
        reportPostEnrollmentIssue('audit_write_failed', user.id);
      });
    }
  
    // Provider acceptance and local progress refresh are independent outcomes.
    // Keep this potentially slow multi-program pull out of the response path,
    // but register it with Next so it is not abandoned immediately on return.
    // "requested" is not a durable-job or completed-sync guarantee. The shared
    // sync can resolve with partial results, so never advertise "synced" here.
    let syncStatus: 'not_requested' | 'requested' | 'failed_to_start' = 'not_requested';
    if (result.status === 'enrolled' || result.status === 'membership-created-and-enrolled') {
      const syncArgs = { wapUserId: user.id, orgId, email: user.email, enrolledProgram };
      try {
        after(async () => {
          try {
            await triggerAutoSyncBestEffort(syncArgs);
          } catch {
            reportPostEnrollmentIssue('progress_refresh_failed', user.id);
          }
        });
        syncStatus = 'requested';
      } catch {
        syncStatus = 'failed_to_start';
        reportPostEnrollmentIssue('progress_refresh_schedule_failed', user.id);
      }
    }
  
    return NextResponse.json({
      status: result.status,
      message: result.message,
      sync: { status: syncStatus },
    });
  } catch (error) {
    console.error('/member/coursera/enroll-in-course:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Best-effort auto-sync after a successful enroll. Uses the same library
 * function the dashboard auto-sync route uses — `syncUserFromB4B` —
 * because that's where the seeding + xAPI replay logic actually lives.
 * We don't call the auto-sync HTTP route to avoid a self-fan-out.
 *
 * Preserve the existing account-email fallback when no mapping is available.
 * A mapping lookup failure is reported without suppressing the fallback, while
 * sync failures propagate to the registered callback for safe reporting.
 */
async function triggerAutoSyncBestEffort(args: {
  wapUserId: string;
  orgId: string;
  email: string;
  enrolledProgram: string | null;
}): Promise<void> {
  const { listCourseraIdentityMappingsForUser } = await import('@/lib/xapi/mappings');
  const mappings = await listCourseraIdentityMappingsForUser(args.wapUserId).catch(
    () => {
      reportPostEnrollmentIssue('mapping_lookup_failed', args.wapUserId);
      return [] as Array<{ courseraEmail: string | null }>;
    },
  );
  const courseraEmail =
    mappings.find((m) => m.courseraEmail)?.courseraEmail ?? args.email;
  if (!courseraEmail) return;

  const { syncUserFromB4B } = await import('@/lib/coursera/syncUserFromB4B');
  await syncUserFromB4B({
    email: courseraEmail.toLowerCase(),
    wapUserId: args.wapUserId,
    orgId: args.orgId,
    enrolledByAdmin: null,
    existingEnrolledProgram: args.enrolledProgram,
  });
}

/** Provider errors can contain account data. Emit only fixed-stage diagnostics;
 * even a telemetry outage must never overturn a provider-accepted enrollment. */
function reportPostEnrollmentIssue(
  stage: 'audit_write_failed' | 'progress_refresh_failed' | 'progress_refresh_schedule_failed' | 'mapping_lookup_failed',
  userId: string,
): void {
  try {
    captureApiError(new Error(`Coursera post-enrollment ${stage}`), {
      route: 'member/coursera/enroll-in-course',
      userId,
      extra: { stage },
    });
  } catch {
    // Reporting is fail-soft; no provider body, email, or credential fallback.
  }
}
export const POST = withApiGuc(_POST);
