import { NextResponse, after } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { prisma } from '@/lib/db/prisma';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { sendCourseEnrolledEmail } from '@/lib/email';
import { maybeSendCourseKickoffEmail } from '@/lib/coursera/courseKickoff';
import { trackEvent } from '@/lib/events/track';
import { getActivePrograms, isProgramSlugActiveInCatalog } from '@/lib/platform/programCatalog';
import { isMemberWioaVerified } from '@/lib/platform/trainingEnrollmentGate';
import { awardPoints } from '@/lib/member/points';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import { cookies } from 'next/headers';
import { MEMBER_REFERRAL_COOKIE, rewardReferralOnEnrollment } from '@/lib/member/referrals';
import { auditLog } from '@/lib/audit';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  isCurriculumMigrationPending,
} from '@/lib/content/programs';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { logAuditEvent } from '@/lib/audit/log';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';
import { ensureSelfServeCounselorAssigned } from '@/lib/counselor/autoAssign';
export const POST = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const o = await readJsonObjectBody(request);
  if (!o) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof o.programSlug === 'string'
    ? canonicalizeProgramSlug(o.programSlug)
    : '';

  if (!slug) {
    return NextResponse.json({ error: 'programSlug is required' }, { status: 400 });
  }

  const activePrograms = await getActivePrograms();
  if (!isProgramSlugActiveInCatalog(activePrograms, slug)) {
    return NextResponse.json({ error: 'That program is not available for enrollment right now.' }, { status: 400 });
  }
  const programView = activePrograms.find((p) => p.slug === slug)!;
  const programTitle = programView.static?.title ?? programView.name;
  if (isCurriculumMigrationPending(slug)) {
    return NextResponse.json(
      {
        error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
        code: CURRICULUM_MIGRATION_PENDING_CODE,
      },
      { status: 409 },
    );
  }

  // Grant-funded programs (Digital Literacy) are not WIOA-gated. Module open
  // and completion already treat them as ungated; enroll must match.
  const fundingSource = programView.static?.fundingSource ?? 'WIOA';

  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    // Serialize self-serve enrolls per member so a double submit or a retry
    // racing the first request cannot both pass the already-enrolled check
    // and both fire the enrolled email. $executeRaw, never $queryRaw: the
    // lock returns void (lib/db/advisoryLockRawQuery.test.ts).
    const lockKey = `member-program-enroll:${user.id}`;
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);

    const existing = await tx.user.findUnique({
      where: { id: user.id },
      select: {
        enrolledProgram: true,
        wioaReviewStatus: true,
        // Multi-program: the primary enrollment row is the canonical
        // assignment (resolveActiveDashboardProgram reads it first), and its
        // enrolledByAdminId tells the WIOA gate whether an admin override is
        // in play. Returns at most one row via the partial unique index
        // `course_enrollments_user_primary_uidx`.
        courseEnrollments: {
          where: { isPrimary: true },
          select: { enrolledByAdminId: true, programSlug: true },
          take: 1,
        },
      },
    });

    if (fundingSource === 'WIOA') {
      const gate = isMemberWioaVerified({
        wioaReviewStatus: existing?.wioaReviewStatus,
        enrolledByAdminId: existing?.courseEnrollments?.[0]?.enrolledByAdminId,
      });
      if (!gate.ok) return { kind: 'wioa_blocked' as const, code: gate.code };
    }

    // Primary row first, then the legacy pointer. A member with a primary row
    // but a NULL pointer is still enrolled: re-running the write would
    // re-stamp enrolledAt and every side effect (same program) or hit the
    // one-primary-row unique index as a 500 (different program).
    const assignedProgramSlug =
      existing?.courseEnrollments?.[0]?.programSlug ?? existing?.enrolledProgram ?? null;
    if (assignedProgramSlug) {
      return programSlugsEquivalent(assignedProgramSlug, slug)
        ? { kind: 'already_enrolled' as const }
        : { kind: 'enrolled_elsewhere' as const };
    }

    const u = await tx.user.update({
      where: { id: user.id },
      data: {
        enrolledProgram: slug,
        enrolledAt: now,
      },
      select: { email: true, fullName: true, organizationId: true },
    });
    // Multi-program: self-serve enroll is the user's first program, so the
    // row is marked isPrimary = true. The check above ran under the lock, so
    // no competing primary row exists; the composite-keyed upsert still
    // prevents duplicate (userId, programSlug) rows.
    const enrollment = await upsertEquivalentCourseEnrollment(tx, {
      userId: user.id,
      programSlug: slug,
      preserveLegacyAssignment: Boolean(existing?.enrolledProgram),
      create: {
        organizationId: u.organizationId,
        curriculumVersion: activeCurriculumVersion(slug),
        isPrimary: true,
        enrolledAt: now,
        enrolledByAdminId: null,
      },
      update: {
        isPrimary: true,
        enrolledAt: now,
        enrolledByAdminId: null,
      },
    });
    return { kind: 'enrolled' as const, user: u, enrollmentId: enrollment.id };
  });

  if (outcome.kind === 'wioa_blocked') {
    const messages: Record<string, string> = {
      WIOA_NOT_STARTED:
        "Before you can enroll, you'll need to complete a brief eligibility screening. It takes about 5 minutes.",
      WIOA_PENDING:
        "Your eligibility screening is under review. We'll let you know once it's approved.",
      WIOA_NOT_ELIGIBLE:
        "Unfortunately, you're not eligible for this program based on current WIOA criteria. Let's find the right path.",
    };
    return NextResponse.json(
      { error: messages[outcome.code] ?? 'Enrollment not available', code: outcome.code },
      { status: 400 }
    );
  }

  // A retry of a request that already enrolled this member in this program:
  // no writes, no emails, no points, no audit rows.
  if (outcome.kind === 'already_enrolled') {
    return NextResponse.json({ ok: true, programSlug: slug, alreadyEnrolled: true });
  }

  // Self-serve reassignment stays admin-only (docs/PRODUCT_STAKES.md stake 2).
  if (outcome.kind === 'enrolled_elsewhere') {
    return NextResponse.json(
      { error: 'Already enrolled in a program. Changes require admin.', code: 'ALREADY_ENROLLED' },
      { status: 400 }
    );
  }

  const updatedUser = outcome;

  after(() =>
    auditLog({
      actorUserId: user.id,
      action: 'member_program_enroll',
      targetType: 'user',
      targetId: user.id,
      metadata: { programSlug: slug, programTitle },
    }).catch(() => {})
  );

  after(() => awardPoints(user.id, 'program_enrolled', slug).catch(() => {}));

  // Member-to-member referral: reward both sides on enrollment (idempotent, non-blocking).
  after(() =>
    cookies()
      .then((store) => rewardReferralOnEnrollment(user.id, store.get(MEMBER_REFERRAL_COOKIE)?.value))
      .catch(() => {})
  );

  // Lifecycle event: program_enrolled
  after(() =>
    trackEvent({
      userId: user.id,
      eventName: 'program_enrolled',
      entityType: 'Program',
      entityId: slug,
      metadata: { programTitle },
    }).catch(() => {})
  );

  after(() =>
    sendPartnerMilestoneEmail(user.id, 'Program enrollment', {
      Program: programTitle,
    }).catch((err) => console.error('Partner milestone email failed:', err))
  );

  after(() =>
    sendCourseEnrolledEmail({
      to: updatedUser.user.email,
      fullName: updatedUser.user.fullName,
      programName: programTitle,
    }).catch((err) => console.error('Course enrolled email failed:', err))
  );

  // Sprint R3 — fire-and-forget kickoff email (idempotent per enrollment row).
  after(() =>
    maybeSendCourseKickoffEmail({
      userId: user.id,
      enrollmentId: updatedUser.enrollmentId,
      programSlug: slug,
      email: updatedUser.user.email,
      fullName: updatedUser.user.fullName,
    }).catch(() => { /* already logged inside */ })
  );

  // Self-serve members get a real WAP counselor on first enroll so
  // "message your counselor" notifies someone. No-op if already assigned
  // or if the org has no active WAP counselors.
  const enrolledOrganizationId = updatedUser.user.organizationId;
  if (enrolledOrganizationId) {
    after(() =>
      ensureSelfServeCounselorAssigned({
        memberId: user.id,
        organizationId: enrolledOrganizationId,
      }).catch(() => {})
    );
  }

  // Invalidate cached member state so dashboard reflects enrollment immediately
  await invalidateMemberState(user.id);

  after(() =>
    auditLog({ actorUserId: user.id, action: 'member.program.enroll', targetType: 'ProgramEnrollment', targetId: slug }).catch(() => {})
  );
  after(() =>
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'ProgramEnrollment', id: slug }, result: { success: true } }).catch(() => {})
  );
  return NextResponse.json({ ok: true, programSlug: slug });

  } catch (error) {
    console.error('/member/enroll error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

