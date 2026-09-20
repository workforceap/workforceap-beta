import type { CreateEmailOptions, CreateEmailResponse } from 'resend';
import { getAdminAlertRecipients, getResend } from '@/lib/email';
import { plainTextEmailHtml } from '@/lib/email/plainTextEmail';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { barrierLabel, formatWioaReasons, publicAssistanceHelpLabel, publicAssistanceLabel, publicAssistanceProgramsLabel, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

export function getWioaScreeningNotificationRecipients(): string[] {
  const configured = (process.env.WIOA_SCREENING_NOTIFY_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0
    ? Array.from(new Set(configured))
    : getAdminAlertRecipients();
}

export type WioaScreeningNotificationContact = {
  fullName: string;
  email: string;
  phone?: string | null;
};

export type WioaEmailSender = (
  payload: CreateEmailOptions
) => Promise<CreateEmailResponse>;

type WioaNotificationDependencies = {
  sendEmail?: WioaEmailSender;
};

/** Production sender: the shared wrapper (retry, guards, diagnostics), not the raw SDK. */
const sendThroughBrandedWrapper: WioaEmailSender = async (payload) => {
  const resend = getResend();
  if (!resend) throw new Error('RESEND_API_KEY not set');
  const text = 'text' in payload && typeof payload.text === 'string' ? payload.text : '';
  const html = 'html' in payload && typeof payload.html === 'string' ? payload.html : plainTextEmailHtml(text);
  return sendBrandedEmailOrThrowOnSkip(resend, {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html,
    ...(text ? { text } : {}),
    ...(typeof payload.replyTo === 'string' ? { replyTo: payload.replyTo } : {}),
  });
};

export async function sendWioaScreeningNotification(params: {
  source: 'member_portal' | 'public_page';
  contact: WioaScreeningNotificationContact;
  snapshot: WioaQualificationSnapshot;
  userId?: string | null;
  adminUrl?: string | null;
}, dependencies: WioaNotificationDependencies = {}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const sendEmail = dependencies.sendEmail ?? sendThroughBrandedWrapper;
  const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
  const { source, contact, snapshot, userId, adminUrl } = params;
  const { answers, signal, submittedAt } = snapshot;
  const sourceLabel = source === 'member_portal' ? 'Member portal screening' : 'Public WIOA screening';

  try {
    const result = await sendEmail({
      from: emailFrom,
      to: getWioaScreeningNotificationRecipients(),
      subject: `${sourceLabel} — ${contact.fullName}`,
      text: [
        `Source: ${sourceLabel}`,
        `Name: ${contact.fullName}`,
        `Email: ${contact.email}`,
        `Phone: ${contact.phone?.trim() || '(not provided)'}`,
        `Signal (heuristic): ${signal}`,
        `Submitted: ${submittedAt}`,
        userId ? `User ID: ${userId}` : null,
        '',
        'Answers:',
        `• Age group: ${answers.ageBracket}`,
        `• County / ZIP: ${answers.countyOrZip || '(not provided)'}`,
        `• Primary barrier: ${barrierLabel(answers.primaryBarrier)}`,
        `• Unemployed / laid off: ${answers.dislocatedWorker ? 'Yes' : 'No'}`,
        `• Low income self-report: ${answers.lowIncomeSelfReport ? 'Yes' : 'No'}`,
        `• Receiving TANF / WIC / Food stamps (SNAP): ${publicAssistanceLabel(answers.publicAssistanceSelfReport)}`,
        answers.publicAssistanceSelfReport === true ? `• Programs named (self-reported): ${publicAssistanceProgramsLabel(answers)}` : null,
        answers.publicAssistanceSelfReport === true ? `• Wants help applying for benefits: ${publicAssistanceHelpLabel(answers)}` : null,
        `• Interested in training: ${answers.trainingInterest ? 'Yes' : 'No'}`,
        `• Completed intake already: ${answers.completedIntakeSelfReport ? 'Yes' : 'No'}`,
        '',
        'Screening explanations (staff copy in English; historical text labeled):',
        ...formatWioaReasons(snapshot).map((reason) => `• ${reason}`),
        adminUrl ? '' : null,
        adminUrl ? `Admin: ${adminUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    if (result.error) {
      console.error('[wioa-notification] email rejected by provider', {
        errorName: result.error.name,
      });
      return false;
    }

    if (!result.data?.id) {
      console.error('[wioa-notification] email provider returned no delivery id');
      return false;
    }

    return true;
  } catch (err) {
    console.error('[wioa-notification] email request failed', {
      errorName: err instanceof Error ? err.name : 'unknown_error',
    });
    return false;
  }
}
