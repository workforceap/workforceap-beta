import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { recipientDomain, recipientHash } from '@/lib/email/failureRecord';
import { brandedEmailLayout } from '@/lib/email/template';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import type { EnrollmentAgreementActor } from './access';
import { agreementStudentWhere, requireAgreementMemberAccess } from './access';
import { EnrollmentAgreementError } from './errors';
import { agreementSha256 } from './storage';
import { ENROLLMENT_TEMPLATE_VERSION } from './types';

const TEMPLATE_SHA256 = 'dee5087ba4503c3d38dfb10c8e149a630f5c8b72e3c9d8a045a306737afff3a5';
const TEMPLATE_KEY = 'enrollment_agreement_blank_2026';
const KEY_PREFIX = 'enrollment-template/';
const GATE_PREFIX = 'enrollment-template-gate/';
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const IN_FLIGHT_MS = 2 * 60 * 1000;
const SUBJECT = 'Your WorkforceAP enrollment agreement form';
const TEXT = 'The blank WorkforceAP enrollment agreement is attached. Please complete and save it, then upload the completed PDF in your WorkforceAP Documents page. Sending this form does not sign or submit an agreement.';
const HTML = brandedEmailLayout({
  title: 'Enrollment agreement form',
  bodyHtml: '<p>The blank WorkforceAP enrollment agreement is attached.</p><p>Please complete and save it, then upload the completed PDF in your WorkforceAP Documents page. Sending this form does not sign or submit an agreement.</p>',
});

const noOpLogStore = { async record() {} };
const emailSchema = z.string().email().max(320);

function keyFor(operationId: string) { return `${KEY_PREFIX}${operationId}`; }
function gateKeyFor(memberId: string) { return `${GATE_PREFIX}${memberId}`; }
function payloadHash(input: { memberId: string; organizationId: string; to: string; from: string }) {
  return createHash('sha256').update(JSON.stringify({ ...input, subject: SUBJECT, text: TEXT, html: HTML,
    attachmentSha256: TEMPLATE_SHA256, templateVersion: ENROLLMENT_TEMPLATE_VERSION })).digest('hex');
}
function isUniqueConflict(error: unknown) { return (error as { code?: string } | null)?.code === 'P2002'; }

/** A unique internal row serializes separate staff clicks for one student. */
async function claimMemberGate(memberId: string, operationId: string, digest: string): Promise<boolean> {
  const dedupeKey = gateKeyFor(memberId);
  try {
    await prisma.emailSendLog.create({ data: {
      dedupeKey, status: 'gate_busy', provider: 'internal', entityType: digest, entityId: operationId,
      recipientCount: 0, attempts: 0,
    } });
    return false;
  } catch (error) { if (!isUniqueConflict(error)) throw error; }
  const gate = await prisma.emailSendLog.findUnique({ where: { dedupeKey } });
  if (!gate) throw new EnrollmentAgreementError(503, 'SEND_UNCERTAIN', 'The send lock could not be checked.');
  if (gate.status === 'gate_busy' && gate.entityId !== operationId) {
    const prior = gate.entityId ? await prisma.emailSendLog.findUnique({ where: { dedupeKey: keyFor(gate.entityId) }, select: { status: true } }) : null;
    if (prior?.status !== 'sent') throw new EnrollmentAgreementError(409, 'SEND_IN_PROGRESS', 'Finish or reconcile the earlier send before starting another.');
  } else if (gate.status === 'gate_busy') {
    if (gate.entityType !== digest) throw new EnrollmentAgreementError(409, 'SEND_CHANGED', 'The recipient or message changed. Reconcile the earlier request.');
    if (Date.now() - gate.updatedAt.getTime() < IN_FLIGHT_MS) throw new EnrollmentAgreementError(409, 'SEND_IN_PROGRESS', 'This send is still in progress. Refresh before retrying.');
  } else if (gate.status !== 'gate_idle') {
    throw new EnrollmentAgreementError(409, 'SEND_RECONCILIATION_REQUIRED', 'The send lock needs staff reconciliation.');
  }
  const claim = await prisma.emailSendLog.updateMany({
    where: { id: gate.id, status: gate.status, updatedAt: gate.updatedAt, entityId: gate.entityId },
    data: { status: 'gate_busy', entityType: digest, entityId: operationId },
  });
  if (claim.count !== 1) throw new EnrollmentAgreementError(409, 'SEND_IN_PROGRESS', 'Another send started. Refresh its status.');
  return gate.status === 'gate_busy' && gate.entityId === operationId;
}

async function releaseMemberGate(memberId: string, operationId: string, digest: string): Promise<void> {
  await prisma.emailSendLog.updateMany({
    where: { dedupeKey: gateKeyFor(memberId), status: 'gate_busy', entityType: digest, entityId: operationId },
    data: { status: 'gate_idle' },
  });
}

async function memberForSend(actor: EnrollmentAgreementActor, memberId: string) {
  await requireAgreementMemberAccess(actor, memberId, 'send');
  const member = await withTenantScope(actor.organizationId, (db) => db.user.findFirst({
    where: { ...agreementStudentWhere(actor.organizationId), id: memberId },
    select: { id: true, fullName: true, email: true },
  }));
  if (!member) throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Student not found.');
  return member;
}

async function approvedTemplate(): Promise<Buffer> {
  try {
    const bytes = await readFile(path.join(process.cwd(), 'assets/enrollment/workforceap-enrollment-2026.pdf'));
    if (agreementSha256(bytes) === TEMPLATE_SHA256) return bytes;
  } catch { /* A missing bundled PDF is an unavailable template. */ }
  throw new EnrollmentAgreementError(503, 'TEMPLATE_UNAVAILABLE', 'The approved enrollment template is temporarily unavailable.');
}

export async function getTemplateSendView(actor: EnrollmentAgreementActor, memberId: string) {
  const member = await memberForSend(actor, memberId);
  const [latest, gate] = await Promise.all([
    prisma.emailSendLog.findFirst({
      where: { templateKey: TEMPLATE_KEY, entityId: memberId, userId: memberId, dedupeKey: { startsWith: KEY_PREFIX } },
      orderBy: { createdAt: 'desc' },
      select: { dedupeKey: true, status: true, createdAt: true, updatedAt: true, sentAt: true, lastEvent: true, lastEventAt: true, recipientHash: true, entityType: true },
    }),
    prisma.emailSendLog.findUnique({ where: { dedupeKey: gateKeyFor(memberId) },
      select: { status: true, entityId: true, entityType: true, updatedAt: true } }),
  ]);
  const currentDigest = payloadHash({ memberId, organizationId: actor.organizationId,
    to: member.email.trim(), from: process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>' });
  const matchesCurrentPayload = latest?.entityType === `enrollment_agreement_template:${currentDigest}`;
  const orphanGate = gate?.status === 'gate_busy' && gate.entityId && latest?.dedupeKey !== keyFor(gate.entityId);
  const gateReady = gate?.status !== 'gate_busy' || Date.now() - gate.updatedAt.getTime() >= IN_FLIGHT_MS;
  return {
    memberName: member.fullName,
    memberEmail: member.email,
    templateVersion: ENROLLMENT_TEMPLATE_VERSION,
    available: Boolean(getResend()) && emailSchema.safeParse(member.email).success,
    latest: orphanGate ? {
      operationId: gate.entityId!, status: 'reserved', requestedAt: gate.updatedAt.toISOString(), acceptedAt: null,
      deliveryEvent: null, deliveryEventAt: null, matchesCurrentRecipient: gate.entityType === currentDigest,
      matchesCurrentPayload: gate.entityType === currentDigest,
      canRetry: gate.entityType === currentDigest && gateReady,
    } : latest ? {
      operationId: latest.dedupeKey.slice(KEY_PREFIX.length), status: latest.status,
      requestedAt: latest.createdAt.toISOString(), acceptedAt: latest.sentAt?.toISOString() ?? null,
      deliveryEvent: latest.lastEvent, deliveryEventAt: latest.lastEventAt?.toISOString() ?? null,
      matchesCurrentRecipient: latest.recipientHash === recipientHash(member.email),
      matchesCurrentPayload,
      canRetry: (latest.status === 'failed' || latest.status === 'reserved' || latest.status === 'sending')
        && matchesCurrentPayload
        && Date.now() - latest.createdAt.getTime() < RETRY_WINDOW_MS
        && gateReady
        && (latest.status === 'failed' || Date.now() - latest.updatedAt.getTime() >= IN_FLIGHT_MS),
    } : null,
  };
}

/** One explicit staff request, with a durable claim before provider egress. */
export async function sendApprovedTemplate(actor: EnrollmentAgreementActor, memberId: string, operationId: string, confirmedEmail: string, expectedLatestOperationId: string | null) {
  const member = await memberForSend(actor, memberId);
  if (member.email !== confirmedEmail) throw new EnrollmentAgreementError(409, 'RECIPIENT_CHANGED', 'The student email changed. Refresh and confirm the current address before sending.');
  if (!emailSchema.safeParse(member.email).success) throw new EnrollmentAgreementError(409, 'RECIPIENT_UNAVAILABLE', 'This student has no usable email address.');
  const resend = getResend();
  if (!resend) throw new EnrollmentAgreementError(503, 'EMAIL_UNAVAILABLE', 'Email sending is not configured.');
  const bytes = await approvedTemplate();
  const from = process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
  const to = member.email.trim();
  const digest = payloadHash({ memberId, organizationId: actor.organizationId, to, from });
  const key = keyFor(operationId);
  const resumingGate = await claimMemberGate(memberId, operationId, digest);
  const latestAfterClaim = await prisma.emailSendLog.findFirst({
    where: { templateKey: TEMPLATE_KEY, entityId: memberId, userId: memberId, dedupeKey: { startsWith: KEY_PREFIX } },
    orderBy: { createdAt: 'desc' }, select: { dedupeKey: true },
  });
  const actualLatest = latestAfterClaim?.dedupeKey.slice(KEY_PREFIX.length) ?? null;
  if (expectedLatestOperationId !== actualLatest && !(resumingGate && expectedLatestOperationId === operationId)) {
    await releaseMemberGate(memberId, operationId, digest);
    throw new EnrollmentAgreementError(409, 'SEND_VIEW_STALE', 'The send history changed. Refresh this student before confirming another send.');
  }
  const now = new Date();
  let row;
  try {
    row = await prisma.emailSendLog.create({ data: {
      dedupeKey: key, idempotencyKey: key, templateKey: TEMPLATE_KEY,
      status: 'reserved', provider: 'internal', recipientHash: recipientHash(to), recipientDomain: recipientDomain(to),
      recipientCount: 1, subject: SUBJECT, userId: memberId,
      entityType: `enrollment_agreement_template:${digest}`, entityId: memberId,
      attempts: 0, createdAt: now,
    } });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    row = await prisma.emailSendLog.findUnique({ where: { dedupeKey: key } });
    if (!row) throw new EnrollmentAgreementError(503, 'SEND_UNCERTAIN', 'The previous request could not be checked. Reload before retrying.');
  }
  if (row.templateKey !== TEMPLATE_KEY || row.entityId !== memberId || row.userId !== memberId ||
    row.entityType !== `enrollment_agreement_template:${digest}` || row.idempotencyKey !== key) {
    throw new EnrollmentAgreementError(409, 'SEND_CHANGED', 'The recipient or message changed. Reconcile the earlier request before sending again.');
  }
  if (row.status === 'sent') {
    await releaseMemberGate(memberId, operationId, digest);
    return { acceptedAt: row.sentAt?.toISOString() ?? row.updatedAt.toISOString(), alreadyAccepted: true };
  }
  const age = Date.now() - row.createdAt.getTime();
  if (age >= RETRY_WINDOW_MS) throw new EnrollmentAgreementError(409, 'SEND_RECONCILIATION_REQUIRED', 'This send is too old to retry safely. Check the provider record before starting another send.');
  if (row.status === 'sending' && Date.now() - row.updatedAt.getTime() < IN_FLIGHT_MS) {
    throw new EnrollmentAgreementError(409, 'SEND_IN_PROGRESS', 'This send is still in progress. Refresh its status before retrying.');
  }
  if (!['reserved', 'sending', 'failed'].includes(row.status)) {
    throw new EnrollmentAgreementError(409, 'SEND_RECONCILIATION_REQUIRED', 'This send needs staff reconciliation.');
  }
  const claim = await prisma.emailSendLog.updateMany({
    where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
    data: { status: 'sending', attempts: { increment: 1 }, failureReason: null, failureClass: null },
  });
  if (claim.count !== 1) throw new EnrollmentAgreementError(409, 'SEND_IN_PROGRESS', 'This send changed. Refresh its status.');
  // The audit must exist before email leaves the app. Its metadata excludes PDF bytes and address.
  try {
    await auditLog({ actorUserId: actor.id, actorEmailSnapshot: null, actorRoleSnapshot: actor.role,
      action: 'enrollment_agreement_template_send_requested', targetType: 'EnrollmentAgreementTemplateSend', targetId: operationId,
      metadata: { organizationId: actor.organizationId, memberId, templateVersion: ENROLLMENT_TEMPLATE_VERSION, templateSha256: TEMPLATE_SHA256, recipientHash: recipientHash(to) },
    });
  } catch {
    await prisma.emailSendLog.updateMany({ where: { id: row.id, status: 'sending' }, data: { status: 'failed', failureClass: 'audit_unavailable' } });
    throw new EnrollmentAgreementError(503, 'AUDIT_UNAVAILABLE', 'Sending is unavailable because the audit could not be recorded.');
  }
  // Only a request that passed durable audit enters the Resend SLO population.
  await prisma.emailSendLog.update({ where: { id: row.id }, data: { provider: 'resend' } });
  try {
    const receipt = await sendBrandedEmailOrThrowOnSkip(resend, {
      from, to, subject: SUBJECT, html: HTML, text: TEXT,
      attachments: [{ filename: 'WorkforceAP-Enrollment-2026.pdf', content: bytes }],
      idempotencyKey: key, templateKey: TEMPLATE_KEY, userId: memberId,
      entityType: 'EnrollmentAgreementTemplateSend', entityId: memberId,
    }, { sendLogStore: noOpLogStore, suppressFailureDiagnostic: true });
    const providerId = receipt.data?.id;
    if (!providerId) throw new Error('Provider acceptance receipt missing');
    await prisma.emailSendLog.update({ where: { id: row.id }, data: {
      status: 'sent', providerMessageId: providerId, sentAt: new Date(), failureReason: null, failureClass: null,
    } });
    try { await releaseMemberGate(memberId, operationId, digest); }
    catch { /* The persisted receipt allows a later caller to reclaim the gate. */ }
    return { acceptedAt: new Date().toISOString(), alreadyAccepted: false };
  } catch (error) {
    // A provider timeout may mean acceptance. Keep the key for bounded replay;
    // if the status write fails, a stale `sending` row remains reconcilable.
    try {
      await prisma.emailSendLog.updateMany({ where: { id: row.id, status: 'sending' },
        data: { status: 'failed', failureClass: 'acceptance_unknown' } });
    } catch { /* Do not turn an uncertain provider outcome into a new operation. */ }
    throw new EnrollmentAgreementError(503, 'SEND_UNCERTAIN', 'Provider acceptance could not be confirmed. Retry this same request or check its status.');
  }
}
