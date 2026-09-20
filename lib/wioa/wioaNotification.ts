import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailResponse,
} from 'resend';
import { getAdminAlertRecipients } from '@/lib/email';
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

export async function sendWioaScreeningNotification(params: {
  source: 'member_portal' | 'public_page';
  contact: WioaScreeningNotificationContact;
  snapshot: WioaQualificationSnapshot;
  userId?: string | null;
  adminUrl?: string | null;
}, dependencies: WioaNotificationDependencies = {}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const sendEmail = dependencies.sendEmail ?? ((payload: CreateEmailOptions) => {
    const resend = new Resend(resendKey);
    return resend.emails.send(payload);
  });
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
