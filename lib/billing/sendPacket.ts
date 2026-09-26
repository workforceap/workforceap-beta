import type { TrainingBillingPacket } from '@prisma/client';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip as sendBrandedEmail } from '@/lib/email/send';
import { brandedEmailLayout } from '@/lib/email/template';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import { billingPacketCounselorHtml, billingPacketStudentHtml, type BillingPacketEmailFacts } from '@/emails/billing-packet';
import { loadLetterheadLogo, packetDocumentFilename, renderJ5InvoicePdf, renderJ6CoverLetterPdf } from './packetPdf';
import { packetToDocumentInput } from './packetDocument';
import { formatLongDate, formatMoney } from './packetText';

function getFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

export type SendPacketResult = {
  sentTo: string[];
  counselor: { fullName: string; email: string } | null;
  studentSent: boolean;
  counselorSent: boolean;
  errors: string[];
};

/**
 * Email the J5 + J6 PDFs to the participant and to their assigned counselor.
 * Two separate messages (different wording, each with both attachments). The
 * admin who pressed the button is cc'd on the counselor copy so the office has
 * the sent record in its own inbox.
 *
 * The student copy goes first because the counselor copy says "the same copy
 * went to the student": if it fails, the counselor copy is not sent.
 * `studentAlreadySent` skips the student copy when retrying a send whose
 * counselor copy failed, so the student is not emailed twice.
 */
export async function sendBillingPacketEmails(args: {
  packet: TrainingBillingPacket;
  member: { id: string; fullName: string; email: string; organizationId: string };
  counselor: { fullName: string; email: string } | null;
  ccEmail?: string | null;
  studentAlreadySent?: boolean;
}): Promise<SendPacketResult> {
  const resend = getResend();
  if (!resend) {
    return { sentTo: [], counselor: args.counselor, studentSent: false, counselorSent: false, errors: ['Email is not configured (RESEND_API_KEY missing).'] };
  }

  const branding = await getOrganizationBranding(args.member.organizationId);
  const input = packetToDocumentInput(args.packet, args.member, await loadLetterheadLogo());
  const [j5, j6] = await Promise.all([renderJ5InvoicePdf(input), renderJ6CoverLetterPdf(input)]);
  const attachments = [
    { filename: packetDocumentFilename('j5', args.packet.packetNumber, args.member.fullName), content: Buffer.from(j5) },
    { filename: packetDocumentFilename('j6', args.packet.packetNumber, args.member.fullName), content: Buffer.from(j6) },
  ];

  const facts: BillingPacketEmailFacts = {
    memberName: args.member.fullName,
    programTitle: input.programTitle,
    packetNumber: args.packet.packetNumber,
    totalLabel: formatMoney(args.packet.totalAmount),
    billToName: args.packet.billToName,
    invoiceDateLabel: formatLongDate(args.packet.invoiceDate),
    signerName: args.packet.signerName,
    signerTitle: args.packet.signerTitle,
    classLines: input.lineItems.map((row) =>
      `${row.description}${row.hours != null ? ` (${row.hours} contact hours)` : ''} - ${formatMoney(row.amount)}`,
    ),
  };

  const sentTo: string[] = [];
  const errors: string[] = [];
  const replyTo = input.provider.email;

  // Student copy.
  let studentSent = false;
  if (!args.studentAlreadySent) {
    try {
      const first = args.member.fullName.trim().split(/\s+/)[0] || 'there';
      const documentsUrl = `${branding.domain}/dashboard/documents`;
      await sendBrandedEmail(resend, {
        from: getFrom(),
        to: args.member.email,
        replyTo,
        subject: sanitizeEmailSubjectLine(`Your ${facts.programTitle} enrollment documents (invoice ${facts.packetNumber})`),
        html: brandedEmailLayout({
          title: 'Your signed training documents',
          bodyHtml: billingPacketStudentHtml({ firstName: first, facts, documentsUrl }),
          ctaText: 'Open my documents',
          ctaUrl: documentsUrl,
          branding,
        }),
        attachments,
      });
      studentSent = true;
      sentTo.push(args.member.email);
    } catch (err) {
      errors.push(`Student email failed: ${err instanceof Error ? err.message : 'send error'}`);
      return { sentTo, counselor: args.counselor, studentSent, counselorSent: false, errors };
    }
  }

  // Counselor copy (cc the admin who sent it).
  let counselorSent = false;
  if (args.counselor) {
    try {
      const first = args.counselor.fullName.trim().split(/\s+/)[0] || 'there';
      const studentUrl = `${branding.domain}/counselor/students/${args.member.id}`;
      const cc = args.ccEmail && args.ccEmail.toLowerCase() !== args.counselor.email.toLowerCase() ? args.ccEmail : undefined;
      await sendBrandedEmail(resend, {
        from: getFrom(),
        to: args.counselor.email,
        cc,
        replyTo,
        subject: sanitizeEmailSubjectLine(`J5/J6 for ${facts.memberName} - ${facts.programTitle} (${facts.packetNumber})`),
        html: brandedEmailLayout({
          title: `Signed J5 invoice and J6 cover letter for ${facts.memberName}`,
          bodyHtml: billingPacketCounselorHtml({ counselorFirstName: first, facts, studentUrl, memberEmail: args.member.email }),
          ctaText: 'Open student record',
          ctaUrl: studentUrl,
          branding,
        }),
        attachments,
      });
      counselorSent = true;
      sentTo.push(args.counselor.email);
      if (cc) sentTo.push(cc);
    } catch (err) {
      errors.push(`Counselor email failed: ${err instanceof Error ? err.message : 'send error'}`);
    }
  }

  return { sentTo, counselor: args.counselor, studentSent, counselorSent, errors };
}
