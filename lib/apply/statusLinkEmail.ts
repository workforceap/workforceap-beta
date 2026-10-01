/**
 * The one email the public status lookup sends (product call 28a).
 *
 * Goes through `sendBrandedEmailOrThrowOnSkip` like every other outbound
 * message (plaintext part, List-Unsubscribe, fixture guard, retry, send log).
 * `template` is deliberately unset: a one-time link must never be replayed
 * from a stored failure row (see SendBrandedEmailArgs.template). The explicit
 * `text` part keeps the link intact for plaintext readers.
 */
import { getResend } from '@/lib/email';
import { escapeHtml, sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { FixtureRecipientSkippedError, sendBrandedEmailOrThrowOnSkip as sendBrandedEmail } from '@/lib/email/send';
import { brandedEmailLayout } from '@/lib/email/template';
import { EMAIL_TEMPLATE_KEYS } from '@/lib/email/templateKeys';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';

const APPLICATION_STATUS_LINK_SUBJECT = 'Your application status link';

type SendApplicationStatusLinkEmailResult = { ok: boolean; skipped?: boolean; error?: string };

function getFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

function applicationStatusLinkEmailText(params: {
  firstName: string;
  url: string;
  expiresInMinutes: number;
  orgName: string;
}): string {
  return [
    `Hi ${params.firstName},`,
    '',
    `Someone (hopefully you) asked for the status of your ${params.orgName} application. Open this link to see where it stands and what happens next:`,
    '',
    params.url,
    '',
    `The link works for ${params.expiresInMinutes} minutes and only from this email address. If it has expired, request a new one from the application status page.`,
    '',
    "If you didn't ask for this, you can ignore this message. Nothing about your application has changed.",
  ].join('\n');
}

export async function sendApplicationStatusLinkEmail(params: {
  to: string;
  fullName: string;
  url: string;
  expiresInMinutes: number;
  branding: OrganizationBranding;
  /** Send-log attribution only; never placed in the message. */
  userId: string;
  applicationId: string;
}): Promise<SendApplicationStatusLinkEmailResult> {
  const resend = getResend();
  if (!resend) {
    console.warn('sendApplicationStatusLinkEmail: RESEND_API_KEY not set');
    return { ok: false, error: 'Email not configured' };
  }
  const firstName = params.fullName.trim().split(/\s+/)[0] || 'there';
  const orgName = params.branding.name;
  const html = brandedEmailLayout({
    title: 'Your application status',
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Someone (hopefully you) asked for the status of your ${escapeHtml(orgName)} application. Open the link below to see where it stands and what happens next.</p>
      <p style="font-size: 0.9rem; color: #555;">The link works for ${params.expiresInMinutes} minutes and only for this email address. If it has expired, request a new one from the application status page.</p>
      <p style="font-size: 0.9rem; color: #555;">If you didn't ask for this, you can ignore this message. Nothing about your application has changed.</p>
    `,
    ctaText: 'View my application status',
    ctaUrl: params.url,
    branding: params.branding,
  });
  try {
    await sendBrandedEmail(resend, {
      from: getFrom(),
      to: params.to,
      subject: sanitizeEmailSubjectLine(APPLICATION_STATUS_LINK_SUBJECT),
      html,
      text: applicationStatusLinkEmailText({ firstName, url: params.url, expiresInMinutes: params.expiresInMinutes, orgName }),
      templateKey: EMAIL_TEMPLATE_KEYS.application_status_link,
      userId: params.userId,
      entityType: 'Application',
      entityId: params.applicationId,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof FixtureRecipientSkippedError) {
      return { ok: false, skipped: true, error: err.reason };
    }
    console.error('sendApplicationStatusLinkEmail failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}
