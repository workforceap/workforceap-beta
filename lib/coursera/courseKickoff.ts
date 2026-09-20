import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { sendCourseKickoffEmail } from '@/lib/email';
import { getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { persistEvent } from '@/lib/events/track';

/**
 * Fire-and-forget program-next-steps email after an assignment is saved.
 * A CourseEnrollment commit does not establish funding or permission to start;
 * the email deliberately makes neither claim.
 *
 * Idempotency: every send writes a `course_kickoff_email_sent` MemberEvent
 * with `entityType='course_enrollment'` and `entityId=<enrollmentId>`. Before
 * sending we check for an existing row so retries / duplicate calls into the
 * same enrollment never double-fire.
 *
 * The caller is expected to invoke this AFTER the enrollment row commits.
 * All errors are swallowed and logged — the enrollment flow must never block
 * on Resend latency or failure.
 */
export async function maybeSendCourseKickoffEmail(args: {
  userId: string;
  enrollmentId: string;
  programSlug: string;
  email: string;
  fullName: string | null;
}): Promise<void> {
  try {
    const already = await prisma.memberEvent.findFirst({
      where: {
        userId: args.userId,
        eventName: 'course_kickoff_email_sent',
        entityType: 'course_enrollment',
        entityId: args.enrollmentId,
      },
      select: { id: true },
    });
    if (already) return;

    const program = getProgramBySlug(args.programSlug);
    const programName = program ? getProgramDisplayTitle(program) : args.programSlug;

    const result = await sendCourseKickoffEmail({
      to: args.email,
      fullName: args.fullName ?? args.email,
      programName,
    });

    if (result.ok) {
      // Record after a successful send so a Resend outage doesn't permanently
      // skip the email for this enrollment — next retry will resend.
      await persistEvent({
        userId: args.userId,
        eventName: 'course_kickoff_email_sent',
        entityType: 'course_enrollment',
        entityId: args.enrollmentId,
        metadata: { programSlug: args.programSlug, programName },
      }, prisma)
        .catch(() => {
          /* non-fatal — at worst we resend on a follow-up call */
        });
    }
  } catch (err) {
    console.error('maybeSendCourseKickoffEmail failed:', err);
  }
}
