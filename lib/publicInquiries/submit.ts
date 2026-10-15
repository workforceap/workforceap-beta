import 'server-only';

import { createHash } from 'node:crypto';
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml } from '@/lib/email/escapeHtml';
import { prismaEmailSendLogStore } from '@/lib/email/sendLog';
import type { PublicInquiryInput } from './validation';

export type InquirySubmitResult =
  | { ok: true }
  | { ok: false; status: number; error: string; saved?: true; receiptId?: string };

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Excludes ephemeral CAPTCHA tokens and client keys from the immutable receipt payload. */
export function inquiryPayload(input: PublicInquiryInput) {
  return {
    kind: input.kind, firstName: input.firstName, lastName: input.lastName, email: input.email,
    phone: input.phone ?? null, topic: input.topic, message: input.message,
    organizationName: input.organizationName ?? null, interestArea: input.interestArea ?? null,
    roleTitle: input.roleTitle ?? null, seats: input.seats ?? null, smsPreferred: input.smsPreferred,
  };
}

/**
 * Durability precedes provider work. A UUID identifies enhanced browser retries;
 * legacy/no-JS clients deduplicate identical normalized payloads within a UTC day.
 * Provider acceptance is recorded separately from capture and never called delivery.
 */
export async function submitPublicInquiry(headers: Headers, input: PublicInquiryInput): Promise<InquirySubmitResult> {
  const organizationId = await resolveOrgFromRequest(headers);
  const payload = inquiryPayload(input);
  const payloadHash = hash(JSON.stringify(payload));
  const submissionKey = input.submissionId ?? `legacy/${new Date().toISOString().slice(0, 10)}/${payloadHash}`;
  const inquiry = await withTenantScope(organizationId, async (db) => {
    const where = { organizationId_submissionKey: { organizationId, submissionKey } };
    try {
      return await db.publicInquiry.upsert({ where, create: { organizationId, submissionKey, payloadHash, ...payload }, update: {} });
    } catch (error) {
      // Prisma can emulate an upsert; concurrent inserts then race on the unique key.
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const existing = await db.publicInquiry.findUnique({ where });
      if (!existing) throw error;
      return existing;
    }
  });
  if (inquiry.payloadHash !== payloadHash) {
    return { ok: false, status: 409, error: 'This submission reference was already used. Please refresh the form before sending a changed inquiry.' };
  }
  if (inquiry.notificationStatus === 'accepted') return { ok: true };

  const receipt = { saved: true as const, receiptId: inquiry.id };
  const recordNotification = async (data: {
    notificationStatus?: string; notificationAttempts?: { increment: number }; notificationAttemptedAt?: Date;
  }, onlyUnaccepted = false) => {
    try {
      await withTenantScope(organizationId, (db) => db.publicInquiry.updateMany({
        where: { id: inquiry.id, ...(onlyUnaccepted ? { notificationStatus: { not: 'accepted' } } : {}) }, data,
      }));
    } catch {
      // Capture is already durable. Leave status unknown/pending if this write fails;
      // do not falsely tell a retrying submitter their retained inquiry was lost.
      console.error('Public inquiry notification status unavailable', { inquiryId: inquiry.id });
    }
  };
  const resend = getResend();
  if (!resend) {
    await recordNotification({ notificationStatus: 'unavailable' }, true);
    return { ok: false, status: 503, ...receipt, error: 'Your inquiry was saved. Email notification is temporarily unavailable; you can retry without creating another inquiry.' };
  }

  await recordNotification({ notificationAttempts: { increment: 1 }, notificationAttemptedAt: new Date() });
  const details = [
    ['Reference', inquiry.id], ['From', `${inquiry.firstName} ${inquiry.lastName}`],
    ['Email', inquiry.email], ['Phone', inquiry.phone || 'Not provided'],
    ['Prefer SMS', inquiry.smsPreferred ? 'Yes' : 'No'], ['Topic', inquiry.topic],
    ['Organization', inquiry.organizationName], ['Interest', inquiry.interestArea],
    ['Seats', inquiry.seats === null ? null : String(inquiry.seats)], ['Role', inquiry.roleTitle],
    ['Message', inquiry.message], ['Submitted', inquiry.createdAt.toISOString()],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  try {
    await sendBrandedEmailOrThrowOnSkip(resend, {
      from: process.env.EMAIL_FROM || 'noreply@workforceap.org',
      to: input.kind === 'careers' ? 'careers@workforceap.org' : 'info@workforceap.org',
      replyTo: inquiry.email,
      // Subject is persisted by EmailSendLog: never put lead PII or free text here.
      subject: `New public ${inquiry.kind} inquiry`,
      text: details.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
      html: brandedEmailLayout({
        title: 'New public inquiry',
        bodyHtml: details.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> <span style="white-space: pre-wrap">${escapeHtml(value)}</span></p>`).join(''),
      }),
      idempotencyKey: `public-inquiry/${inquiry.id}`,
      templateKey: 'public-inquiry-notification', entityType: 'public_inquiry', entityId: inquiry.id,
    }, {
      suppressFailureDiagnostic: true,
      sendLogStore: {
        record: (entry) => prismaEmailSendLogStore.record({ ...entry, failureReason: entry.failureClass }),
      },
    });
  } catch {
    await recordNotification({ notificationStatus: 'failed' }, true);
    return { ok: false, status: 500, ...receipt, error: 'Your inquiry was saved. Failed to send the email notification; please retry, or contact us directly.' };
  }
  await recordNotification({ notificationStatus: 'accepted' });
  return { ok: true };
}
