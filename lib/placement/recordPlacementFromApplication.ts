import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications/create';
import { awardPoints } from '@/lib/member/points';

/**
 * One writer for the PlacementRecord a job application produces.
 *
 * Two paths learn about a hire from an application:
 *
 *   - the EMPLOYER marks a `JobPostingApplication` hired
 *     (lib/employer/applicationStatusEffects.ts), and
 *   - the MEMBER confirms an offer on their own `JobApplication` tracker row
 *     (app/(portal)/dashboard/placementAction.ts).
 *
 * Until 2026-09-22 only the employer path stood up a PlacementRecord; the
 * member's confirmation wrote an event and stopped, so a self-reported hire
 * never reached the 30/60/90-day retention check-ins
 * (lib/cron/placement-surveys.ts), the First 90 Days card
 * (app/(portal)/dashboard/page.tsx) or any placement count. Both paths now
 * come through here.
 *
 * ## Idempotency
 *
 * `PlacementRecord.userId` is `@unique` — one row per member, and the schema
 * has no application/employer foreign key on the row. That unique key is the
 * idempotency key: a second confirmation of any kind finds the existing row
 * and never creates another.
 *
 * ## Verification semantics (unchanged)
 *
 * The schema's only verification flag is `startDateVerified`, and its
 * meaning is "a counselor or admin confirmed start date and wage for funder
 * reporting" (app/api/admin/members/[id]/placed-outcome/route.ts sets it;
 * lib/admin/funderProgramMetrics.ts, lib/cron/wioa-report.ts and the partner
 * payout eligibility read it). Neither an employer nor a member can set it:
 * an employer knows the hire happened, not the start date and wage the
 * funder definitions hinge on. So every row written here is
 * `startDateVerified: false` with `placedBy: null` (auto-created, not
 * staff-entered), and the source is recorded in `notes` plus the audit log.
 *
 * When the employer confirms a hire the member already reported, the SAME
 * row is corroborated in place — employer name and job title take the
 * employer's values (authoritative over the member's free-typed tracker
 * strings) and a dated line is appended to `notes`. A row a counselor or
 * admin entered (`placedBy` set) or already verified is never touched.
 */

export type PlacementSource = 'member_self_report' | 'employer_hired';

export type RecordPlacementOutcome =
  /** No row existed for the member; one was created (unverified). */
  | 'created'
  /** The member had already self-reported; the employer confirmed the same hire on that row. */
  | 'corroborated'
  /** A row already existed (staff-entered, verified, or already recorded from this source); nothing written. */
  | 'unchanged';

export type RecordPlacementResult = {
  outcome: RecordPlacementOutcome;
  placement: { id: string; employerName: string; jobTitle: string };
};

export const MEMBER_SELF_REPORT_NOTE =
  'Member-reported: created when the member confirmed accepting this offer on their dashboard. Verify start date and wage.';
export const EMPLOYER_HIRED_NOTE =
  'Auto-created when the employer marked this application hired. Verify start date and wage.';
/** Prefix of the note line appended when an employer confirms a member-reported hire. Also the repeat guard. */
export const EMPLOYER_CORROBORATION_MARKER = 'Employer confirmed this hire';

export const PLACEMENT_SOURCE_LABEL: Record<PlacementSource, string> = {
  member_self_report: 'member self-report',
  employer_hired: 'employer marked hired',
};

export async function recordPlacementFromApplication(args: {
  /** The member who was hired. */
  userId: string;
  employerName: string;
  jobTitle: string;
  source: PlacementSource;
  /**
   * `job_applications.id` for the member path, `job_postings_applications.id`
   * for the employer path. Audit metadata only — the schema has no FK.
   */
  applicationId: string;
  /** Who triggered the write: the member, or the employer's user (null when unknown). */
  actorUserId: string | null;
  now?: Date;
}): Promise<RecordPlacementResult> {
  const { userId, employerName, jobTitle, source, applicationId, actorUserId } = args;
  const now = args.now ?? new Date();

  const existing = await prisma.placementRecord.findUnique({
    where: { userId },
    select: {
      id: true,
      employerName: true,
      jobTitle: true,
      notes: true,
      placedBy: true,
      startDateVerified: true,
    },
  });

  if (!existing) {
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { enrolledProgram: true },
    });

    const placement = await prisma.placementRecord.create({
      data: {
        userId,
        employerName,
        jobTitle,
        programSlug: student?.enrolledProgram ?? null,
        placedAt: now,
        // Unverified until a counselor confirms start date/wage — this row
        // exists so the retention pipeline and placement counts don't miss the
        // hire, not to assert unconfirmed facts as ground truth.
        startDateVerified: false,
        notes: source === 'member_self_report' ? MEMBER_SELF_REPORT_NOTE : EMPLOYER_HIRED_NOTE,
      },
      select: { id: true, employerName: true, jobTitle: true },
    });

    // WIOA grant claims need a tamper-evident change history (AUDIT H-DEP4);
    // same action/targetType as the admin create route so one query lists
    // every placement creation regardless of who triggered it.
    await auditLog({
      actorUserId,
      action: 'placement_create',
      targetType: 'placement_record',
      targetId: placement.id,
      metadata: {
        memberId: userId,
        source,
        applicationId,
        employerName: placement.employerName,
        jobTitle: placement.jobTitle,
        startDateVerified: false,
        autoCreated: true,
      },
    });

    // Idempotent per (userId, event, entityId); the row is unique per member
    // so a member can earn this once however the hire was recorded.
    void awardPoints(userId, 'placement_recorded', placement.id).catch(() => {});

    await notifyPlacementRecorded({ userId, placement, source });

    return { outcome: 'created', placement };
  }

  const alreadyCorroborated = (existing.notes ?? '').includes(EMPLOYER_CORROBORATION_MARKER);
  const staffOwned = existing.placedBy !== null || existing.startDateVerified;

  if (source === 'employer_hired' && !staffOwned && !alreadyCorroborated) {
    const corroborationLine = `${EMPLOYER_CORROBORATION_MARKER} on ${now.toISOString().slice(0, 10)} (application ${applicationId}); the member had reported it as ${existing.employerName} / ${existing.jobTitle}.`;
    const placement = await prisma.placementRecord.update({
      where: { id: existing.id },
      data: {
        employerName,
        jobTitle,
        notes: existing.notes ? `${existing.notes}\n${corroborationLine}` : corroborationLine,
      },
      select: { id: true, employerName: true, jobTitle: true },
    });

    await auditLog({
      actorUserId,
      action: 'placement_update',
      targetType: 'placement_record',
      targetId: placement.id,
      metadata: {
        memberId: userId,
        source,
        applicationId,
        corroborated: true,
        previousEmployerName: existing.employerName,
        previousJobTitle: existing.jobTitle,
        employerName: placement.employerName,
        jobTitle: placement.jobTitle,
        // Still a counselor's call: the employer confirmed the hire, not the start date or wage.
        startDateVerified: false,
      },
    });

    await notifyCounselorToVerify({
      userId,
      placement,
      body: `The employer confirmed the hire a member you counsel reported at ${placement.employerName} (${placement.jobTitle}). Confirm start date and wage for funder reporting.`,
    });

    return { outcome: 'corroborated', placement };
  }

  return {
    outcome: 'unchanged',
    placement: { id: existing.id, employerName: existing.employerName, jobTitle: existing.jobTitle },
  };
}

async function notifyPlacementRecorded(args: {
  userId: string;
  placement: { id: string; employerName: string; jobTitle: string };
  source: PlacementSource;
}): Promise<void> {
  const { userId, placement, source } = args;

  await createNotification({
    userId,
    type: 'placement',
    title: 'Placement recorded',
    body: `We've logged your placement at ${placement.employerName}. Your counselor will follow up to confirm details.`,
    data: { link: '/dashboard' },
  });

  await notifyCounselorToVerify({
    userId,
    placement,
    body:
      source === 'member_self_report'
        ? `A member you counsel reported accepting an offer at ${placement.employerName} (${placement.jobTitle}). Confirm start date and wage for funder reporting.`
        : `A member you counsel was marked hired at ${placement.employerName} (${placement.jobTitle}). Confirm start date and wage for funder reporting.`,
  });
}

async function notifyCounselorToVerify(args: {
  userId: string;
  placement: { id: string };
  body: string;
}): Promise<void> {
  const assignment = await prisma.counselorAssignment.findFirst({
    where: { memberId: args.userId, active: true },
    select: { counselor: { select: { userId: true } } },
  });
  if (!assignment?.counselor.userId) return;
  await createNotification({
    userId: assignment.counselor.userId,
    type: 'placement',
    title: 'Member placed — verify details',
    body: args.body,
    data: { link: `/counselor/students/${args.userId}` },
  });
}
