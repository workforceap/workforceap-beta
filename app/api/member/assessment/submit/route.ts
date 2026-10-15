import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { recordAssessmentSubmission } from '@/lib/assessment/recordSubmission';
import { canSubmitAssessment, ASSESSMENT_LIMIT_MESSAGE, MAX_ASSESSMENT_ATTEMPTS } from '@/lib/assessment/attempts';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { scoreAssessment, TOTAL_POINTS } from '@/lib/assessment/answer-key';
import { isStraightLined, STRAIGHT_LINE_MESSAGE } from '@/lib/assessment/answerPattern';
import { displayLettersForAnswers, isValidAttemptSeed } from '@/lib/assessment/layout';
import { ASSESSMENT_QUESTIONS_PUBLIC } from '@/lib/assessment/questions';
import type { QuestionChoice } from '@/lib/assessment/answer-key';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml, sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { plainTextEmailHtml } from '@/lib/email/plainTextEmail';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { getAssessmentResultRecipients, getResend } from '@/lib/email';
import { buildAssessmentReviewRows, formatAssessmentReviewText } from '@/lib/assessment/reviewRows';
import { trackEvent } from '@/lib/events/track';
import { awardPoints } from '@/lib/member/points';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from '@/lib/member/starterProfileReview';

import { withApiGuc } from '@/lib/db/withRequestGuc';

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = parseBody(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
    }
  
    const { firstName, lastName, phone, programInterest, answers, seed, retakeRequestedAt } = parsed;
  
    const answersTyped: Record<number, QuestionChoice> = {};
    for (const [k, v] of Object.entries(answers)) {
      const id = parseInt(k, 10);
      if (Number.isNaN(id) || !['A', 'B', 'C', 'D'].includes(v as string)) continue;
      answersTyped[id] = v as QuestionChoice;
    }
  
    // Ops (10/9/26): one letter clicked for (nearly) every question is not an
    // answer sheet; do not score or save it as the member's WIOA result.
    // After shuffle (#2745) the form stores original letters, so a click-through
    // of display "A" looks mixed unless we reconstruct that attempt's layout.
    if (
      isStraightLined(answersTyped)
      || (seed !== null && isStraightLined(displayLettersForAnswers(ASSESSMENT_QUESTIONS_PUBLIC, seed, answersTyped)))
    ) {
      return NextResponse.json({ error: STRAIGHT_LINE_MESSAGE, code: 'ANSWERS_ALL_SAME' }, { status: 422 });
    }

    const { raw, pct } = scoreAssessment(answersTyped);
  
    const orgId = await getActorOrganizationId(user.id);
    const dbUser = await prisma.$transaction((tx) => withTenantScope(orgId, (db) => db.user.findFirst({
      where: { id: user.id },
      select: {
        assessmentCompleted: true,
        assessmentAttemptCount: true,
        assessmentRetakeRequestedAt: true,
        email: true,
        phone: true,
        // Multi-program: counselor-created flag lives on the primary enrollment.
        courseEnrollments: {
          where: { isPrimary: true },
          select: { enrolledByAdminId: true },
          take: 1,
        },
        profile: {
          select: {
            profilePhone: true,
            profileAddress: true,
            city: true,
            state: true,
            zip: true,
            referralSource: true,
          },
        },
      },
    }), tx));
  
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!canSubmitAssessment(dbUser)) {
      return NextResponse.json({ error: dbUser.assessmentAttemptCount >= MAX_ASSESSMENT_ATTEMPTS ? ASSESSMENT_LIMIT_MESSAGE : dbUser.assessmentCompleted ? 'Assessment already completed' : 'Staff must authorize your final preassessment attempt.' }, { status: dbUser.assessmentAttemptCount >= MAX_ASSESSMENT_ATTEMPTS ? 409 : 400 });
    }

    // Bind the POST to the form's authorization. A delayed initial request
    // must not become the final attempt if staff authorized a retake meanwhile.
    if ((dbUser.assessmentRetakeRequestedAt?.toISOString() ?? null) !== retakeRequestedAt) {
      return NextResponse.json({ error: 'Your assessment attempt changed. Reload the page before submitting.', code: 'STALE_ASSESSMENT_ATTEMPT' }, { status: 409 });
    }

    // Ops (9/3/26): the preassessment is never blocked. A counselor-created
    // account with an unconfirmed profile still submits; staff see the missing
    // fields on the member page and the reminder stays on the member's form.
    const starterProfileReview = getCounselorStarterProfileReview({
      wasCounselorCreated: !!dbUser.courseEnrollments[0]?.enrolledByAdminId,
      phone: dbUser.phone,
      profilePhone: dbUser.profile?.profilePhone,
      profileAddress: dbUser.profile?.profileAddress,
      city: dbUser.profile?.city,
      state: dbUser.profile?.state,
      zip: dbUser.profile?.zip,
      referralSource: dbUser.profile?.referralSource,
    });
    const profileReviewPending = starterProfileReview.required
      ? getStarterProfileFieldLabels(starterProfileReview.missing)
      : [];

    // Compare the completed-attempt count and exact pending authorization in
    // the same write. Duplicate or stale requests cannot consume another chance.
    const recorded = await recordAssessmentSubmission({
      memberId: user.id, organizationId: orgId, expected: dbUser,
      raw, pct, programInterest, answers: answersTyped,
    });
    if (!recorded) {
      return NextResponse.json({ error: 'Assessment already completed' }, { status: 400 });
    }
  
    awardPoints(user.id, 'assessment_completed').catch(() => {});
  
    // Track assessment completion for funnel analytics
    await trackEvent({
      userId: user.id,
      eventName: 'apply_signup_completed',
      entityType: 'assessment',
      metadata: { rawScore: raw, scorePct: pct, programInterest },
      sourcePage: '/dashboard/assessment',
    });
  
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.workforceap.org');
    const adminLink = `${siteUrl}/admin/assessments?userId=${user.id}`;
  
    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    const dashboardUrl = `${siteUrl}/dashboard`;
  
    let memberEmailSent = false;
    let adminEmailSent = false;
    if (resend) {
      try {
        // Ops (9/2/26): staff get the full answer sheet, not just the score, so
        // the WIOA assessment review can start from the email alone.
        const reviewRows = buildAssessmentReviewRows(answersTyped);
        const adminText = [
            `Name: ${firstName} ${lastName}`,
            `Email: ${dbUser.email}`,
            `Phone: ${phone}`,
            `Program Interest: ${programInterest}`,
            `Score: ${raw}/${TOTAL_POINTS} (${pct}%)`,
            `Submitted: ${new Date().toISOString()}`,
            '',
            `Member account (WIOA assessment): ${siteUrl}/admin/members/${user.id}`,
            `All assessments: ${adminLink}`,
            '',
            ...formatAssessmentReviewText(reviewRows),
          ].join('\n');
        const result = await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: getAssessmentResultRecipients(),
          subject: sanitizeEmailSubjectLine(`Training preassessment submitted — ${firstName} ${lastName} (${pct}%)`),
          html: plainTextEmailHtml(adminText),
          text: adminText,
        });
        if (!result.data?.id) {
          console.error('Assessment admin email was not accepted by the provider', {
            errorName: 'missing_delivery_id',
          });
        } else {
          adminEmailSent = true;
        }
      } catch (err) {
        console.error('Assessment admin email failed:', err);
      }
  
      try {
        const memberHtml = brandedEmailLayout({
          title: 'Assessment Complete',
          bodyHtml: `
            <p>Hi ${escapeHtml(firstName)},</p>
            <p>You've completed your readiness assessment. Your score: <strong>${raw}/${TOTAL_POINTS} (${pct}%)</strong>.</p>
            <p>You're all set to continue to your training. Log in to your dashboard to access your Coursera courses.</p>
          `,
          ctaText: 'Go to Dashboard',
          ctaUrl: dashboardUrl,
        });
        const result = await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: dbUser.email,
          subject: 'Assessment Complete — Workforce Advancement Project',
          html: memberHtml,
        });
        if (!result.data?.id) {
          console.error('Assessment member email was not accepted by the provider', {
            errorName: 'missing_delivery_id',
          });
        } else {
          memberEmailSent = true;
        }
      } catch (err) {
        console.error('Assessment member email failed:', err);
      }
    }
  
    return NextResponse.json({
      ok: true,
      rawScore: raw,
      scorePct: pct,
      emailsSent: memberEmailSent,
      adminEmailSent,
      profileReviewPending,
    });
  } catch (error) {
    console.error('/member/assessment/submit:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

function parseBody(body: unknown): {
  firstName: string;
  lastName: string;
  phone: string;
  programInterest: string;
  answers: Record<string, string>;
  seed: string | null;
  retakeRequestedAt: string | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.firstName !== 'string' || !o.firstName.trim()) return null;
  if (typeof o.lastName !== 'string' || !o.lastName.trim()) return null;
  if (typeof o.phone !== 'string' || !o.phone.trim()) return null;
  if (typeof o.programInterest !== 'string' || !o.programInterest.trim()) return null;
  if (!o.answers || typeof o.answers !== 'object') return null;
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.answers)) {
    if (typeof v === 'string') answers[k] = v;
  }
  return {
    firstName: o.firstName.trim(),
    lastName: o.lastName.trim(),
    phone: o.phone.trim(),
    programInterest: o.programInterest.trim(),
    answers,
    seed: isValidAttemptSeed(o.seed) ? o.seed : null,
    retakeRequestedAt: typeof o.retakeRequestedAt === 'string' ? o.retakeRequestedAt : null,
  };
}
