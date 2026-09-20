import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendCertCelebrationEmail } from '@/lib/email';
import { logCronRun } from '@/lib/admin/logCronRun';
import { getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { awardPoints } from '@/lib/member/points';
import { settlePendingReferralRewards } from '@/lib/member/referrals';
import { TESTIMONIALS } from '@/content/testimonials';

import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { persistEvent } from '@/lib/events/track';

export const maxDuration = 300;
/**
 * GET /api/cron/milestone-celebration
 *
 * Sprint R3 (PLAN-2026-Q3.md) — redesigned certification celebration.
 * Subject leads with cert name + earned date (per the open-rate hypothesis,
 * 35% -> 55%). Body points the member at the AI interview practice tool,
 * surfaces the +25 point bump, and pulls a random peer testimonial when one
 * matches the member's program.
 *
 * Population: `CourseProgress` rows completed within the window — not
 * `User.assessmentCompletedAt` (an early-onboarding field that never fires
 * again once a member is enrolled, so members completing courses deep into a
 * program were never celebrated). Every distinct course completion is its
 * own milestone; a member who finishes two courses in the same window is
 * celebrated for each.
 *
 * Idempotency: `awardPoints` is idempotent per (userId, event, entityId), and
 * `entityId` here is the `CourseProgress.id` — unique per
 * (userId, programSlug, courseSlug) — so re-scanning the window on retry
 * never double-credits or double-sends. The email is only sent when points
 * were freshly awarded this run.
 *
 * Vercel cron: 0 11 * * * (daily 11AM UTC). Secured by CRON_SECRET.
 */
async function handle(_req: NextRequest) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);


  const completions = await prisma.courseProgress.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: yesterday },
      user: { deletedAt: null },
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      programSlug: true,
      courseSlug: true,
      completedAt: true,
      user: { select: { email: true, fullName: true } },
    },
    take: 100,
  });

  let sent = 0;
  let pointsAwardedCount = 0;

  for (const completion of completions) {
    try {
      if (!completion.user?.email) continue;

      const programSlug = completion.programSlug;
      const program = getProgramBySlug(programSlug);
      const programName = program ? getProgramDisplayTitle(program) : programSlug;

      // +25 point bump for cert celebration (Sprint R3 — ties milestone to a
      // points-widget update). Keying on the CourseProgress row id makes this
      // idempotent per completion, not per (member, program, day).
      const pointsResult = await awardPoints(
        completion.userId,
        'certification_earned',
        completion.id,
        25,
        { note: `Course completion celebration: ${programName} — ${completion.courseSlug}` },
      ).catch(() => ({ awarded: false, points: 0 }));
      if (pointsResult.awarded) pointsAwardedCount++;

      // Skip the email when points weren't freshly awarded: either this
      // exact completion was already celebrated on a prior run, or the
      // award itself failed — either way, don't resend.
      if (!pointsResult.awarded) continue;

      // Only include real, consented testimonials in member-facing email.
      // Static testimonials are kept empty until real, consented quotes are
      // gathered and reviewed. No fabricated social proof is sent.
      const launchSafeTestimonials = TESTIMONIALS.filter((t) => !t.id.startsWith('placeholder-'));
      const programMatch = launchSafeTestimonials.find(
        (t) => t.program && t.program.toLowerCase().includes(programSlug.toLowerCase()),
      );
      const testimonial =
        programMatch ?? (launchSafeTestimonials[Math.floor(Math.random() * launchSafeTestimonials.length)] ?? null);

      const delivery = await emailPacer.run(() => sendCertCelebrationEmail({
        to: completion.user.email,
        fullName: completion.user.fullName ?? completion.user.email,
        certName: programName,
        earnedAt: completion.completedAt ?? new Date(),
        pointsAwarded: 25,
        testimonial: testimonial
          ? { quote: testimonial.quote, name: testimonial.name, role: testimonial.role }
          : null,
      }));
      if (!delivery.ok) continue;
      sent++;

      await persistEvent({
        userId: completion.userId,
        eventName: 'certification_celebration_sent',
        entityType: 'course_progress',
        entityId: completion.id,
        metadata: { programSlug, programName, courseSlug: completion.courseSlug, pointsAwarded: 25 },
      }, prisma)
        .catch(() => { /* non-fatal — audit trail only, not used for idempotency */ });
    } catch {
      /* non-fatal */
    }
  }

  // Referral settlement (WAP-32): pay pending member referrals whose referee
  // was enrolled by a path that never saw the cookie (admin program assignment,
  // invite accept, Coursera sync). Same idempotent points machinery as above.
  let referralSettlement: Awaited<ReturnType<typeof settlePendingReferralRewards>> | { error: string };
  try {
    referralSettlement = await settlePendingReferralRewards();
  } catch (error) {
    referralSettlement = { error: error instanceof Error ? error.message : 'settlement failed' };
    console.error('[milestone-celebration] referral settlement failed:', error);
  }

  const runResult = { sent, total: completions.length, pointsAwardedCount, referralSettlement, emailPacing: emailPacer.summary() };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_milestone_celebration', runResult);
  return NextResponse.json(runResult);
}

export const GET = withCronLogging('cron_milestone_celebration', handle);
export const POST = withCronLogging('cron_milestone_celebration', handle);
