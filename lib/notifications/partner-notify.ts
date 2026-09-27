import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { classifyEmailSendFailure } from '@/lib/email/failureRecord';
import { FixtureRecipientSkippedError, MemberEmailOutcomeUncertainError, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

/** Surface provider rejections without persisting member or partner identity. */
async function sendPartnerEmail(resend: Resend, args: { from: string; to: string; subject: string; text: string; subjectMemberId: string; kind: 'milestone' | 'assignment' }): Promise<void> {
  try {
    await sendBrandedEmailOrThrowOnSkip(
      resend,
      {
        ...args,
        memberEffectClaim: true,
        html: `<p>${args.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</p>`,
      },
      { suppressFailureDiagnostic: true },
    );
  } catch (error) {
    if (error instanceof FixtureRecipientSkippedError) return;
    // The inner send releases its member claim after provider settlement.
    // This diagnostic may finish later, so construct only safe fields.
    const classified = error instanceof MemberEmailOutcomeUncertainError ? error.causeValue : error;
    const { errorClass } = classifyEmailSendFailure(classified);
    await recordWorkflowDiagnostic({
      workflow: 'email_send', status: 'error', provider: 'resend',
      summary: 'Partner member email send failed',
      failureReason: `partner_member_email_${errorClass}`,
      metadata: { kind: args.kind, errorClass, deliveryUncertain: error instanceof MemberEmailOutcomeUncertainError },
    });
    throw error;
  }
}

export type PartnerMilestone =
  | 'Program enrollment'
  | 'Course completed'
  | 'Certification earned'
  | 'Job placement';

function memberFirstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return 'Member';
  return t.split(/\s+/)[0] ?? t;
}

/**
 * Milestone → Partner notification preference mapping.
 *
 * INVARIANT: Every PartnerMilestone type must map to exactly one Partner boolean
 * preference field. If a new milestone is added, add it here or it will default
 * to sending (fail-open for backwards compat).
 */
const MILESTONE_PREF_KEY: Record<PartnerMilestone, string> = {
  'Program enrollment': 'notifyOnEnrollment',
  'Course completed': 'notifyOnCourse',
  'Certification earned': 'notifyOnCertified',
  'Job placement': 'notifyOnPlaced',
};

/**
 * Notifies the referring partner (via PartnerReferral) when a member hits a milestone.
 * Respects Partner.notifyOn* preferences — skips email when the partner has opted out.
 * No-ops when there is no referral, no contact email, or Resend is not configured.
 */
export async function sendPartnerMilestoneEmail(
  memberId: string,
  milestone: PartnerMilestone,
  details?: Record<string, string | undefined>
): Promise<void> {
  const referral = await prisma.partnerReferral.findFirst({
    where: { memberId },
    include: {
      partner: {
        select: {
          contactEmail: true,
          name: true,
          notifyOnEnrollment: true,
          notifyOnCourse: true,
          notifyOnCertified: true,
          notifyOnPlaced: true,
        },
      },
      member: { select: { fullName: true } },
    },
  });

  if (!referral) return;
  if (!referral.partner.contactEmail?.trim()) return;

  // Respect partner notification preferences
  const prefKey = MILESTONE_PREF_KEY[milestone];
  if (prefKey && (referral.partner as Record<string, unknown>)[prefKey] === false) {
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
  if (!resendKey) {
    console.warn('sendPartnerMilestoneEmail: RESEND_API_KEY not set');
    return;
  }

  const first = memberFirstName(referral.member.fullName);
  const subject = sanitizeEmailSubjectLine(`[WorkforceAP] Update on ${first} - ${milestone}`);

  const detailLines: string[] = [];
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      if (v) detailLines.push(`${k}: ${v}`);
    }
  }

  const text = [
    `Hello,`,
    '',
    `This is an update regarding ${referral.member.fullName}, referred by ${referral.partner.name}.`,
    '',
    `Milestone: ${milestone}`,
    ...detailLines,
    '',
    '— WorkforceAP',
  ].join('\n');

  try {
    const resend = new Resend(resendKey);
    await sendPartnerEmail(resend, {
      kind: 'milestone',
      subjectMemberId: memberId,
      from: emailFrom,
      to: referral.partner.contactEmail.trim(),
      subject,
      text,
    });
  } catch (err) {
    console.error('sendPartnerMilestoneEmail failed:', classifyEmailSendFailure(err).errorClass);
    throw err;
  }
}

/**
 * Notifies the partner when a new member is assigned to them.
 * No-ops when partner has no contact email or Resend is not configured.
 */
export async function sendPartnerNewMemberAssignedEmail(
  memberId: string,
  partnerId: string
): Promise<void> {
  try {
    const [member, partner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: memberId },
        select: { fullName: true },
      }),
      prisma.partner.findUnique({
        where: { id: partnerId },
        select: { contactEmail: true, name: true },
      }),
    ]);

    if (!member || !partner?.contactEmail?.trim()) return;

    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    if (!resendKey) {
      console.warn('sendPartnerNewMemberAssignedEmail: RESEND_API_KEY not set');
      return;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
    const partnerPortalUrl = `${siteUrl}/partner`;

    const subject = sanitizeEmailSubjectLine(
      `[WorkforceAP] New member assigned — ${member.fullName || 'Member'}`,
    );
    const text = [
      `Hello,`,
      '',
      `A new member, ${member.fullName || 'Member'}, has been assigned to ${partner.name}.`,
      '',
      `View their profile and progress in the partner portal.`,
      '',
      partnerPortalUrl,
      '',
      '— WorkforceAP',
    ].join('\n');

    try {
      const resend = new Resend(resendKey);
      await sendPartnerEmail(resend, {
        kind: 'assignment',
        subjectMemberId: memberId,
        from: emailFrom,
        to: partner.contactEmail.trim(),
        subject,
        text,
      });
    } catch (err) {
      console.error('sendPartnerNewMemberAssignedEmail failed:', classifyEmailSendFailure(err).errorClass);
      throw err;
    }
  } catch (err) {
    console.error('sendPartnerNewMemberAssignedEmail: load or send failed:', classifyEmailSendFailure(err).errorClass);
    throw err;
  }
}
