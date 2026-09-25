import { NextRequest, NextResponse, after } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { notifyAndRecordPlacement, notifyInterviewTimeSet } from '@/lib/employer/applicationStatusEffects';
import { allowedNextJobApplicationStatuses, canTransitionJobApplicationStatus } from '@/lib/employer/applicationStatus';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const updateSchema = z.object({
  status: z.enum(['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected']),
  employerNotes: z.string().max(5000).optional(),
  interviewScheduledAt: z.string().datetime().optional().nullable(),
  // Stored in the interviewNotes column. This is candidate-visible "where /
  // format" text (an address, "Zoom", "phone call") that goes into the
  // member's notification. It is never the employer's private notes; those
  // live in employerNotes.
  interviewLocation: z.string().trim().max(500).nullable().optional(),
});

export const PATCH = withApiGuc(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const superAdmin = await isSuperAdmin(user.id);
  const ctx = await getEmployerForUser(user.id, { isSuperAdminHint: superAdmin });
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Verify this application belongs to this employer
  const application = await prisma.$transaction((tx) => tx.jobPostingApplication.findFirst({
    where: { id, job: { employerId: ctx.employerId } },
    select: { id: true, status: true, interviewScheduledAt: true, interviewNotes: true },
  }));
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.errors }, { status: 400 });
  }

  // Only moves in the transition map; re-saving the current status (e.g. a
  // notes-only save) is always allowed.
  const previousStatus = application.status;

  // An interview time only belongs on an application at Interview. Clearing
  // it (null) is allowed from any status.
  if (parsed.data.interviewScheduledAt && parsed.data.status !== 'interview') {
    return NextResponse.json(
      {
        error: 'An interview time can only be set while the application is at Interview.',
        code: 'interview_time_requires_interview_status',
      },
      { status: 400 },
    );
  }

  if (parsed.data.status !== previousStatus && !canTransitionJobApplicationStatus(previousStatus, parsed.data.status)) {
    return NextResponse.json(
      {
        error: `That move isn't available from ${jobApplicationStatusLabel(previousStatus, 'employer')}.`,
        code: 'invalid_transition',
        allowed: allowedNextJobApplicationStatuses(previousStatus),
      },
      { status: 409 },
    );
  }

  const updates: {
    status?: typeof parsed.data.status;
    employerNotes?: string;
    interviewScheduledAt?: Date | null;
    interviewNotes?: string | null;
    statusUpdatedAt?: Date;
  } = {};

  if (parsed.data.status) {
    updates.status = parsed.data.status;
    updates.statusUpdatedAt = new Date();
  }
  if (parsed.data.employerNotes !== undefined) {
    updates.employerNotes = parsed.data.employerNotes;
  }
  if (parsed.data.interviewScheduledAt !== undefined) {
    updates.interviewScheduledAt = parsed.data.interviewScheduledAt ? new Date(parsed.data.interviewScheduledAt) : null;
  }
  if (parsed.data.interviewLocation !== undefined) {
    updates.interviewNotes = parsed.data.interviewLocation || null;
  }

  // A new, different, non-null time is what the member hears about.
  const previousTime = application.interviewScheduledAt;
  const newTime =
    updates.interviewScheduledAt && updates.interviewScheduledAt.getTime() !== previousTime?.getTime()
      ? updates.interviewScheduledAt
      : null;

  // Compare-and-swap on the status we read, so two people moving the same
  // application at once cannot both win (and both notify the member).
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.jobPostingApplication.updateMany({
      where: {
        id,
        status: previousStatus,
        job: { employerId: ctx.employerId },
        // Two people setting the time at once: only one write (and one
        // member notification) wins; the other gets the stale 409 below.
        ...(newTime ? { interviewScheduledAt: previousTime } : {}),
      },
      data: updates,
    });
    if (count === 0) return null;
    return tx.jobPostingApplication.findFirst({
      where: { id, job: { employerId: ctx.employerId } },
    });
  });
  if (!updated) {
    return NextResponse.json(
      { code: 'stale', error: 'This application was updated by someone else. Reload to see the latest.' },
      { status: 409 },
    );
  }

  auditLog({
    actorUserId: user.id,
    action: 'employer_application_updated',
    targetType: 'User',
    targetId: updated.studentId,
    metadata: { applicationId: id, previousStatus, nextStatus: updated.status, employerId: ctx.employerId },
  }).catch(() => {});
  logAuditEvent({
    user: { id: user.id, role: 'employer' },
    verb: 'updated',
    object: { type: 'JobApplication', id },
    result: { success: true, extensions: { previousStatus, nextStatus: updated.status } },
  }).catch(() => {});

  // One member notification per request at most. A move into Interview that
  // also sets a time folds the time into the interview notification.
  const interview =
    updated.status === 'interview' && updated.interviewScheduledAt
      ? { at: updated.interviewScheduledAt, location: updated.interviewNotes ?? null }
      : undefined;
  if (updated.status !== previousStatus) {
    // after(): runs once the response is sent, and the platform keeps the
    // function alive until it settles (a bare `void` promise can be dropped).
    after(() =>
      notifyAndRecordPlacement({
        applicationId: id,
        studentId: updated.studentId,
        employerId: ctx.employerId,
        nextStatus: updated.status,
        ...(interview ? { interview } : {}),
      }),
    );
  } else if (newTime && interview) {
    after(() => notifyInterviewTimeSet({ applicationId: id, studentId: updated.studentId, interview }));
  }

  return NextResponse.json({ ok: true, application: updated });

  } catch (error) {
    console.error('/employer/applications/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

