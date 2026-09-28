import 'server-only';

/**
 * Sign, send, reconcile, close and partial-send cancellation for one stage
 * version. Sign and send are wired but hard-disabled: every gate defaults
 * off and is checked before any claim row, storage write or provider call.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { getResend } from '@/lib/email';
import { escapeHtml } from '@/lib/email/escapeHtml';
import { FixtureRecipientSkippedError, ResendResolvedSendError, sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { getBillingProviderOrgId } from '../../providerOrg';
import { stageAttachments, type ArchivedFile } from '../attachments';
import type { BillingStage } from '../constants';
import type { J5Content, J6Content } from '../content';
import { billingToday } from '../dates';
import type { CancelSendDto, CloseDto, ReconcileDto, SendDto, SignDto, StageVersionView } from '../dto';
import type { ArtifactKind } from '../financeStorage';
import { expectedFollowUpWindow } from '../payment';
import { STAGE_RECIPIENT_ROLES, type RecipientRole } from '../recipients';
import { ACCEPTED, deliveryState, markStaleClaimAmbiguous, reconcileSend, UNRESOLVED, type SendStatus } from '../sendClaims';
import { authorizeSigner, buildSignatureBlock, validateSignRequest, type SignatureBlock } from '../signing';
import type { StageStatus } from '../stateMachine';
import { isBillingRuleRefusal, isUniqueViolation, type TwoStageContext } from './access';
import { archiveErrorCode, financeArchive, readArchived } from './archive';
import { loadCaseSnapshot, recordContent, type CaseSnapshot, type RecordWithRelations } from './caseData';
import { verifySignable } from './documents';
import { SIGNER_CODES } from './evidence';
import { requireSendGates, requireSignGates, SIGNED_RENDERER_AVAILABLE } from './gates';
import { apiError } from './http';
import { runSend, type EmailPort, type SendClaimRow, type SendStorePort } from './sendEngine';
import { casePaymentDto, deliveryViews, versionView } from './summary';

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

async function designatedSigner(organizationId: string): Promise<string | null> {
  const row = await prisma.billingDesignatedSigner.findFirst({ where: { organizationId }, select: { userId: true } });
  return row?.userId ?? null;
}

async function snapshotOf<P>(ctx: TwoStageContext<P>): Promise<CaseSnapshot> {
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  if (!snapshot) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
  return snapshot;
}

function recordIn(snapshot: CaseSnapshot, stage: BillingStage, recordId: string): RecordWithRelations {
  const record = snapshot.records.find((r) => r.id === recordId && r.stage === stage);
  if (!record) throw apiError(404, 'RECORD_NOT_FOUND', 'This item was not found.');
  return record;
}

// ---------------------------------------------------------------------------
// Sign

/** Renders the signed (non-draft) PDF. None exists yet: #2702 is DRAFT-only and no signature representation is approved. */
export type SignedRendererPort = (input: { content: J5Content | J6Content; signature: SignatureBlock; frozenAt: string; receiptSignatureId: string | null }) => Promise<Uint8Array>;
export const signedRenderer: SignedRendererPort | null = null;

export async function signStage<P>(ctx: TwoStageContext<P>, stage: BillingStage, body: unknown, renderer: SignedRendererPort | null = signedRenderer): Promise<SignDto> {
  const principal = await designatedSigner(ctx.member.organizationId);
  // Gates first: while any is off nothing below runs.
  requireSignGates(stage, principal !== null);
  if (!SIGNED_RENDERER_AVAILABLE || !renderer) throw apiError(503, 'SIGNED_RENDERER_UNAVAILABLE', 'Signed J5/J6 PDFs cannot be produced until the signature representation is approved.');
  const signer = authorizeSigner({
    actor: { userId: ctx.user.id, organizationId: ctx.actorOrgId, isActive: true, isAdmin: true },
    providerOrgId: getBillingProviderOrgId(),
    stage,
    now: ctx.now,
  });
  if (!signer.ok) throw apiError(signer.status, SIGNER_CODES[signer.reason], signer.message);
  if (stage === 'j6' && principal?.toLowerCase() !== signer.signerSubjectId) throw apiError(403, 'SIGNER_NOT_DESIGNATED', 'Only the designated signer can sign a J6.');

  const b = asObj(body);
  const request = { recordId: str(b.recordId), version: typeof b.version === 'number' ? b.version : -1, contentSha256: str(b.contentSha256), intentConfirmed: b.intentConfirmed === true, intentText: str(b.intentText) };
  const pre = await snapshotOf(ctx);
  const target = recordIn(pre, stage, request.recordId);
  const content = recordContent<J5Content | J6Content>(target);
  const checked = validateSignRequest(
    { id: target.id, version: target.version, status: target.status as StageStatus, contentSha256: target.contentSha256, documentTitle: content.title, documentNumber: content.documentNumber },
    request,
  );
  if (!checked.ok) throw apiError(checked.status, checked.status === 422 ? 'INTENT_NOT_CONFIRMED' : target.status === 'draft' ? 'VERSION_STALE' : 'ALREADY_SIGNED', checked.message);
  const { receiptSignatureId } = await verifySignable(ctx, stage, target.id, request.contentSha256);

  const signedAt = ctx.now;
  const signature = buildSignatureBlock({ signedAt, intent: checked.intent });
  const bytes = await renderer({ content, signature, frozenAt: signedAt.toISOString(), receiptSignatureId });
  const kind = stage === 'j5' ? 'j5_signed_pdf' : 'j6_signed_pdf';
  ctx.effects.mark();
  let archived: Awaited<ReturnType<ReturnType<typeof financeArchive>['archiveFinancePdf']>>;
  try {
    archived = await financeArchive().archiveFinancePdf({ caseId: ctx.billingCase!.id, kind, bytes });
  } catch (error) {
    const code = archiveErrorCode(error);
    if (code === 'INTEGRITY_MISMATCH') throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'An archived file failed its integrity check. Contact an administrator.');
    if (code) throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive is not available. Nothing was signed.');
    throw error;
  }
  const { ref } = archived;
  await prisma.$transaction(async (tx) => {
    const artifact =
      (await tx.billingArtifact.findFirst({ where: { organizationId: ctx.member.organizationId, caseId: ctx.billingCase!.id, storageBucket: ref.bucket, storageKey: ref.key } })) ??
      (await tx.billingArtifact.create({
        data: {
          organizationId: ctx.member.organizationId,
          caseId: ctx.billingCase!.id,
          kind,
          source: 'rendered',
          fileName: `${content.documentNumber}.pdf`,
          mimeType: 'application/pdf',
          byteLength: ref.byteLength,
          sha256: ref.sha256,
          storageBucket: ref.bucket,
          storageKey: ref.key,
          stageRecordId: target.id,
          stage,
          stageVersion: target.version,
          renderedContentSha256: target.contentSha256,
          createdBySubjectId: signer.signerSubjectId,
        },
      }));
    const updated = await tx.billingStageRecord.updateMany({
      where: { id: target.id, organizationId: ctx.member.organizationId, status: 'draft', contentSha256: request.contentSha256 },
      data: { status: 'signed', signedBySubjectId: signer.signerSubjectId, signatureMethod: 'typed_attestation', signerIntent: checked.intent, signedArtifactId: artifact.id, signedViaDelegationId: null },
    });
    if (updated.count !== 1) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Review the current version and sign again.');
    // The database stamps signed_at; the printed date must be the same day (and, for a J6, the frozen issue date).
    const row = await tx.billingStageRecord.findFirst({ where: { id: target.id, organizationId: ctx.member.organizationId }, select: { signedAt: true } });
    const signedDay = row?.signedAt ? billingToday(row.signedAt) : null;
    if (signedDay !== billingToday(signedAt) || (stage === 'j6' && signedDay !== content.issueDate)) {
      throw apiError(409, 'DRAFT_STALE', 'The signing day changed while this document was being signed. Save the draft again and sign today.');
    }
    await auditLog(
      {
        actorUserId: ctx.user.id,
        action: 'billing.two_stage.signed',
        targetType: 'billing_stage_record',
        targetId: target.id,
        metadata: { caseId: ctx.billingCase!.id, stage, version: target.version, contentSha256: target.contentSha256, signedArtifactSha256: ref.sha256, via: signer.via },
      },
      tx,
    );
  });
  const after = await snapshotOf(ctx);
  const record = recordIn(after, stage, target.id);
  const view = versionView(after, ctx.member.id, record, ctx.now);
  if (!view.signed) throw new Error('signed record has no signed view');
  return { record: view, signedArtifact: view.signed.artifact };
}

// ---------------------------------------------------------------------------
// Send

/** Production email port: Resend through the shared wrapper (fixture recipients skipped, send log, retries with the same key). */
export function resendEmailPort(): EmailPort | null {
  const resend = getResend();
  if (!resend) return null;
  const from = process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
  return {
    async send(message) {
      return sendBrandedEmailOrThrowOnSkip(resend, {
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
        idempotencyKey: message.idempotencyKey,
        templateKey: 'billing_two_stage',
        entityType: 'billing_stage_record',
      });
    },
    readStatus: (error) => (error instanceof ResendResolvedSendError ? error.statusCode : undefined),
    isSkippedBeforeProvider: (error) => error instanceof FixtureRecipientSkippedError,
  };
}

function prismaSendStore<P>(ctx: TwoStageContext<P>, record: RecordWithRelations, attachmentSha256s: string[]): SendStorePort {
  const org = ctx.member.organizationId;
  const toRow = (r: { id: string; recipientRole: string; attemptNo: number; status: string; claimToken: string; claimedAt: Date; lastClaimedAt: Date; idempotencyKey: string; providerMessageId: string | null }): SendClaimRow => ({
    id: r.id,
    role: r.recipientRole as RecipientRole,
    attemptNo: r.attemptNo,
    status: r.status as SendStatus,
    claimToken: r.claimToken,
    claimedAt: r.claimedAt,
    lastClaimedAt: r.lastClaimedAt,
    idempotencyKey: r.idempotencyKey,
    providerMessageId: r.providerMessageId,
  });
  const refused = async (fn: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await fn();
    } catch (error) {
      if (isBillingRuleRefusal(error)) return false;
      throw error;
    }
  };
  return {
    async listClaims() {
      const rows = await prisma.billingStageSend.findMany({ where: { stageRecordId: record.id, organizationId: org } });
      return rows.map(toRow);
    },
    markStaleAmbiguous: (row) =>
      refused(async () => (await prisma.billingStageSend.updateMany({ where: { id: row.id, organizationId: org, claimToken: row.claimToken, status: 'pending' }, data: { status: 'ambiguous' } })).count === 1),
    async insertClaim(input) {
      try {
        const created = await prisma.billingStageSend.create({
          data: {
            organizationId: org,
            stageRecordId: record.id,
            stage: record.stage,
            attemptNo: input.attemptNo,
            recipientRole: input.role,
            recipientName: input.name,
            email: input.email,
            idempotencyKey: input.idempotencyKey,
            status: 'pending',
            claimToken: randomUUID(),
            // Overwritten by the database clock (billing_stage_send_guard).
            claimedAt: ctx.now,
            lastClaimedAt: ctx.now,
            contentSha256: record.contentSha256,
            attachmentSha256s,
          },
        });
        return toRow(created);
      } catch (error) {
        if (isUniqueViolation(error) || isBillingRuleRefusal(error)) return 'conflict';
        throw error;
      }
    },
    async reclaimSameKey(row) {
      const token = randomUUID();
      try {
        const updated = await prisma.billingStageSend.updateMany({
          where: { id: row.id, organizationId: org, claimToken: row.claimToken, status: 'ambiguous' },
          data: { status: 'pending', claimToken: token, lastClaimedAt: ctx.now },
        });
        return updated.count === 1 ? { ...row, status: 'pending', claimToken: token } : 'lost';
      } catch (error) {
        if (isBillingRuleRefusal(error) && /23 h same-key retry window/u.test((error as Error).message)) return 'window_passed';
        if (isBillingRuleRefusal(error)) return 'lost';
        throw error;
      }
    },
    settle: (row, input) =>
      refused(async () => {
        const updated = await prisma.billingStageSend.updateMany({
          where: { id: row.id, organizationId: org, claimToken: row.claimToken, status: row.status },
          data: {
            status: input.status,
            providerResult: input.providerResult,
            lastError: input.lastError,
            ...(input.status === 'provider_accepted' ? { acceptedAt: new Date(), providerMessageId: input.providerMessageId } : {}),
          },
        });
        return updated.count === 1;
      }),
    async auditAttempt(input) {
      await auditLog({
        actorUserId: ctx.user.id,
        action: 'billing.two_stage.send_attempted',
        targetType: 'billing_stage_send',
        targetId: input.sendId,
        metadata: { recordId: record.id, stage: record.stage, role: input.role, attemptNo: input.attemptNo, outcome: input.outcome },
      });
    },
  };
}

async function attachmentsFor(snapshot: CaseSnapshot, stage: BillingStage, record: RecordWithRelations): Promise<{ files: Array<{ filename: string; content: Uint8Array }>; sha256s: string[] }> {
  const content = recordContent<J5Content | J6Content>(record);
  const load = async (id: string | null | undefined): Promise<ArchivedFile | null> => {
    if (!id) return null;
    const row = snapshot.artifacts.find((f) => f.id === id);
    if (!row) throw apiError(409, 'ATTACHMENT_MISMATCH', 'An attachment is missing from the archive record; nothing was sent.');
    const bytes = await readArchived(row);
    return { kind: row.kind as ArtifactKind, fileName: row.fileName, sha256: row.sha256, byteLength: row.byteLength, bytes };
  };
  const signed = await load(record.signedArtifactId);
  if (!signed) throw apiError(409, 'ATTACHMENT_MISMATCH', 'The signed PDF is missing; nothing was sent.');
  const voucher = content.kind === 'j6_invoice_cover_letter' ? await load(content.voucher.artifactId) : null;
  const boardInvoice = content.kind === 'j6_invoice_cover_letter' ? await load(content.boardInvoice?.artifactId) : null;
  const result = stageAttachments(stage, { signed, voucher, boardInvoice });
  if (!result.ok) throw apiError(409, 'ATTACHMENT_MISMATCH', result.error);
  return { files: result.attachments.map((a) => ({ filename: a.filename, content: a.content })), sha256s: result.sha256s };
}

/** Fixed, unhashed copy: the signed PDF is the document. */
export function stageEmail(content: J5Content | J6Content, role: RecipientRole): { subject: string; html: string; text: string } {
  const org = content.letterhead.headerLines[0];
  const title = `${content.kind === 'j5_quote_voucher_request' ? 'J5' : 'J6'} ${content.title} ${content.documentNumber}`;
  const lead = role === 'finance' ? `Please find attached ${title} and the received, signed training voucher.` : `Please find attached ${title} for your records.`;
  const text = `${lead}\n\n${org}\n${content.letterhead.footer.website} | ${content.letterhead.footer.phone}`;
  return { subject: `${title} - ${content.student.name}`, html: `<p>${escapeHtml(lead)}</p><p>${escapeHtml(org)}<br>${escapeHtml(content.letterhead.footer.website)} | ${escapeHtml(content.letterhead.footer.phone)}</p>`, text };
}

/**
 * When every required role has exactly one accepted copy and nothing is
 * unresolved: signed -> sent (the database stamps sent_at), the send
 * receipt, and for a J6 the pending payment event anchored to sent_at.
 */
export async function completeIfDelivered<P>(ctx: TwoStageContext<P>, stage: BillingStage, recordId: string): Promise<boolean> {
  const snapshot = await snapshotOf(ctx);
  const record = recordIn(snapshot, stage, recordId);
  if (record.status !== 'signed') return record.status === 'sent';
  const sends = record.sends;
  const attachmentSha256s = sends.find((s) => ACCEPTED.has(s.status as SendStatus))?.attachmentSha256s ?? [];
  const state = deliveryState(
    stage,
    { contentSha256: record.contentSha256, attachmentSha256s, snapshot: record.recipients.map((r) => ({ role: r.recipientRole as RecipientRole, email: r.email })) },
    sends.map((s) => ({ role: s.recipientRole as RecipientRole, status: s.status as SendStatus, attemptNo: s.attemptNo, contentSha256: s.contentSha256, email: s.email, attachmentSha256s: s.attachmentSha256s })),
  );
  if (!state.complete) return false;
  const receipt = {
    contentSha256: record.contentSha256,
    attachmentSha256s,
    roles: STAGE_RECIPIENT_ROLES[stage].map((role) => {
      const s = sends.filter((x) => x.recipientRole === role && ACCEPTED.has(x.status as SendStatus)).sort((a, b) => b.attemptNo - a.attemptNo)[0]!;
      return { role, email: s.email, attemptNo: s.attemptNo, status: s.status, providerMessageId: s.providerMessageId };
    }),
  };
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.billingStageRecord.updateMany({
      where: { id: record.id, organizationId: ctx.member.organizationId, status: 'signed', contentSha256: record.contentSha256 },
      data: { status: 'sent', sendReceipt: receipt as unknown as Prisma.InputJsonValue },
    });
    if (updated.count !== 1) return;
    const sent = await tx.billingStageRecord.findFirst({ where: { id: record.id, organizationId: ctx.member.organizationId }, select: { sentAt: true } });
    if (stage === 'j6' && sent?.sentAt) {
      const window = expectedFollowUpWindow(sent.sentAt);
      await tx.billingPaymentEvent.create({
        data: {
          organizationId: ctx.member.organizationId,
          caseId: ctx.billingCase!.id,
          j6RecordId: record.id,
          status: 'pending',
          expectedFollowUpFrom: new Date(`${window.expectedFollowUpFrom}T00:00:00.000Z`),
          expectedFollowUpTo: new Date(`${window.expectedFollowUpTo}T00:00:00.000Z`),
          recordedBySubjectId: ctx.user.id,
        },
      });
    }
    await auditLog(
      { actorUserId: ctx.user.id, action: 'billing.two_stage.sent', targetType: 'billing_stage_record', targetId: record.id, metadata: { caseId: ctx.billingCase!.id, stage, version: record.version, contentSha256: record.contentSha256, roles: receipt.roles.map((r) => ({ role: r.role, attemptNo: r.attemptNo })) } },
      tx,
    );
  });
  return true;
}

export async function sendStage<P>(ctx: TwoStageContext<P>, stage: BillingStage, body: unknown, email: EmailPort | null = null): Promise<SendDto> {
  const principal = await designatedSigner(ctx.member.organizationId);
  // Gates first, before any claim row, storage read or provider call.
  requireSendGates(stage, principal !== null);
  const port = email ?? resendEmailPort();
  if (!port) throw apiError(503, 'EMAIL_NOT_ENABLED', 'J5/J6 email delivery is not configured in this environment.');
  const b = asObj(body);
  const retryFailedRoles = Array.isArray(b.retryFailedRoles) ? (b.retryFailedRoles.filter((r) => r === 'finance' || r === 'counselor' || r === 'student') as RecipientRole[]) : [];
  const snapshot = await snapshotOf(ctx);
  const record = recordIn(snapshot, stage, str(b.recordId));
  if (record.contentSha256 !== str(b.versionHash)) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Reload before sending.');
  if (record.status === 'sent') return sendResponse(ctx, stage, record.id, 'already');
  if (record.status !== 'signed') throw apiError(409, 'NOT_SIGNED', 'Sign this document before sending it.');
  const content = recordContent<J5Content | J6Content>(record);
  const { files, sha256s } = await attachmentsFor(snapshot, stage, record);
  const recipients = record.recipients.map((r) => ({ role: r.recipientRole as RecipientRole, name: r.recipientName, email: r.email }));
  const outcomes = await runSend({
    stage,
    recordId: record.id,
    version: record.version,
    recipients,
    messageFor: (role) => ({ ...stageEmail(content, role), attachments: files }),
    retryFailedRoles,
    now: ctx.now,
    store: prismaSendStore(ctx, record, sha256s),
    email: port,
    onProviderCall: () => ctx.effects.mark(),
  });
  await completeIfDelivered(ctx, stage, record.id);
  return sendResponse(ctx, stage, record.id, outcomes);
}

async function sendResponse<P>(ctx: TwoStageContext<P>, stage: BillingStage, recordId: string, outcomes: SendDto['roles'] | 'already'): Promise<SendDto> {
  const snapshot = await snapshotOf(ctx);
  const record = recordIn(snapshot, stage, recordId);
  const roles: SendDto['roles'] =
    outcomes === 'already'
      ? record.recipients.map((r) => ({
          role: r.recipientRole as RecipientRole,
          name: r.recipientName,
          email: r.email,
          outcome: 'ALREADY_ACCEPTED' as const,
          sendId: null,
          attemptNo: null,
          status: null,
          providerMessageId: null,
          message: 'This recipient already has this version.',
        }))
      : outcomes;
  return {
    recordId,
    stageStatus: record.status === 'sent' ? 'sent' : 'signed',
    complete: record.status === 'sent',
    sentAt: record.sentAt?.toISOString() ?? null,
    roles,
    payment: stage === 'j6' && record.status === 'sent' ? casePaymentDto(snapshot, ctx.now) : null,
  };
}

// ---------------------------------------------------------------------------
// Reconcile, close, cancel a partial send

export async function reconcile<P>(ctx: TwoStageContext<P>, stage: BillingStage, sendId: string, body: unknown): Promise<ReconcileDto> {
  const b = asObj(body);
  const snapshot = await snapshotOf(ctx);
  const record = snapshot.records.find((r) => r.stage === stage && r.sends.some((s) => s.id === sendId));
  const send = record?.sends.find((s) => s.id === sendId);
  if (!record || !send) throw apiError(404, 'SEND_NOT_FOUND', 'This item was not found.');
  if (record.status !== 'signed') throw apiError(409, 'RECORD_NOT_SIGNED', 'Copies can be reconciled only while the document is signed and not yet sent.');
  const outcome = b.outcome === 'delivered' || b.outcome === 'not_delivered' ? b.outcome : null;
  const note = str(b.note).trim();
  if (!outcome || !note) throw apiError(422, 'RECONCILE_NOTE_REQUIRED', 'Reconciliation needs the outcome and a note on the evidence.');
  const evidenceArtifactId = str(b.evidenceArtifactId) || null;
  if (evidenceArtifactId && !snapshot.artifacts.some((f) => f.id === evidenceArtifactId)) throw apiError(422, 'EVIDENCE_NOT_IN_CASE', 'Reconciliation evidence must be a file of this case.');
  let status = send.status as SendStatus;
  const row = { role: send.recipientRole as RecipientRole, status, claimedAt: send.claimedAt, lastClaimedAt: send.lastClaimedAt };
  if (status === 'pending') {
    if (!markStaleClaimAmbiguous(row, ctx.now)) throw apiError(409, 'CLAIM_IN_FLIGHT', 'This copy is still being sent. Try again in a few minutes.');
    ctx.effects.mark();
    const marked = await prisma.billingStageSend.updateMany({ where: { id: send.id, organizationId: ctx.member.organizationId, claimToken: send.claimToken, status: 'pending' }, data: { status: 'ambiguous' } });
    if (marked.count !== 1) throw apiError(409, 'SEND_CHANGED', 'This copy changed. Reload before reconciling.');
    status = 'ambiguous';
  }
  if (status !== b.expectedStatus) throw apiError(409, 'SEND_CHANGED', 'This copy changed. Reload before reconciling.');
  const decided = reconcileSend({ ...row, status }, { outcome, bySubjectId: ctx.user.id, note });
  if (!decided.ok) throw apiError(409, 'NOT_RECONCILABLE', decided.error);
  ctx.effects.mark();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.billingStageSend.updateMany({
      where: { id: send.id, organizationId: ctx.member.organizationId, claimToken: send.claimToken, status },
      data: { status: decided.status, reconciledBySubjectId: ctx.user.id, reconciledAt: ctx.now, reconcileNote: note, reconcileEvidenceArtifactId: evidenceArtifactId },
    });
    if (updated.count !== 1) throw apiError(409, 'SEND_CHANGED', 'This copy changed. Reload before reconciling.');
    await auditLog(
      { actorUserId: ctx.user.id, action: 'billing.two_stage.send_reconciled', targetType: 'billing_stage_send', targetId: send.id, metadata: { recordId: record.id, stage, role: send.recipientRole, attemptNo: send.attemptNo, outcome: decided.status } },
      tx,
    );
  });
  await completeIfDelivered(ctx, stage, record.id);
  const after = await snapshotOf(ctx);
  const fresh = recordIn(after, stage, record.id);
  const delivery = deliveryViews(after, fresh, ctx.now).find((d) => d.role === send.recipientRole)!;
  return {
    delivery,
    stageStatus: fresh.status === 'sent' ? 'sent' : 'signed',
    complete: fresh.status === 'sent',
    sentAt: fresh.sentAt?.toISOString() ?? null,
    payment: stage === 'j6' && fresh.status === 'sent' ? casePaymentDto(after, ctx.now) : null,
  };
}

function closeInput(body: unknown): { action: 'void' | 'supersede'; reason: string; versionHash: string } {
  const b = asObj(body);
  const action = b.action === 'void' || b.action === 'supersede' ? b.action : null;
  const reason = str(b.reason).trim();
  if (!action) throw apiError(422, 'VALIDATION_FAILED', 'Choose void or supersede.', { field: 'action' });
  if (!reason) throw apiError(422, 'CLOSE_REASON_REQUIRED', 'Record why this version is being closed.', { field: 'reason' });
  return { action, reason, versionHash: str(b.versionHash) };
}

function openJ6Follows(snapshot: CaseSnapshot, j5RecordId: string): boolean {
  return snapshot.records.some((r) => r.stage === 'j6' && r.priorJ5RecordId === j5RecordId && (r.status === 'draft' || r.status === 'signed'));
}

async function closeWith<P>(
  ctx: TwoStageContext<P>,
  stage: BillingStage,
  record: RecordWithRelations,
  input: { action: 'void' | 'supersede'; reason: string },
  extra: Prisma.BillingStageRecordUpdateManyMutationInput,
  action: 'closed' | 'send_cancelled',
): Promise<StageVersionView> {
  ctx.effects.mark();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.billingStageRecord.updateMany({
      where: { id: record.id, organizationId: ctx.member.organizationId, status: record.status, contentSha256: record.contentSha256 },
      data: {
        status: input.action === 'void' ? 'voided' : 'superseded',
        ...(input.action === 'void' ? { voidedAt: ctx.now } : { supersededAt: ctx.now }),
        closedBySubjectId: ctx.user.id,
        closeReason: input.reason,
        ...extra,
      },
    });
    if (updated.count !== 1) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Reload before closing it.');
    await auditLog(
      { actorUserId: ctx.user.id, action: `billing.two_stage.${action}`, targetType: 'billing_stage_record', targetId: record.id, metadata: { caseId: ctx.billingCase!.id, stage, version: record.version, from: record.status, action: input.action } },
      tx,
    );
  });
  const after = await snapshotOf(ctx);
  return versionView(after, ctx.member.id, recordIn(after, stage, record.id), ctx.now);
}

export async function closeVersion<P>(ctx: TwoStageContext<P>, stage: BillingStage, recordId: string, body: unknown): Promise<CloseDto> {
  const input = closeInput(body);
  const snapshot = await snapshotOf(ctx);
  const record = recordIn(snapshot, stage, recordId);
  if (record.contentSha256 !== input.versionHash) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Reload before closing it.');
  const allowed =
    (record.status === 'draft' && input.action === 'void') ||
    (record.status === 'signed' && record.sends.length === 0) ||
    (record.status === 'sent' && input.action === 'supersede');
  if (record.status === 'signed' && record.sends.length > 0) {
    throw apiError(409, 'PARTIAL_SEND_REQUIRES_CANCELLATION', 'Some copies were already attempted. Use "Cancel remaining sends" and record why.');
  }
  if (!allowed) throw apiError(409, 'CLOSE_NOT_ALLOWED', `A ${record.status} document cannot be ${input.action === 'void' ? 'voided' : 'superseded'}.`);
  if (stage === 'j5' && openJ6Follows(snapshot, record.id)) throw apiError(409, 'J5_LINKED_BY_OPEN_J6', 'An open J6 follows this J5. Void or supersede the J6 first.');
  return { record: await closeWith(ctx, stage, record, input, {}, 'closed') };
}

export async function cancelPartialSend<P>(ctx: TwoStageContext<P>, stage: BillingStage, recordId: string, body: unknown): Promise<CancelSendDto> {
  const input = closeInput(body);
  const b = asObj(body);
  const snapshot = await snapshotOf(ctx);
  const record = recordIn(snapshot, stage, recordId);
  if (record.contentSha256 !== input.versionHash) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Reload before cancelling.');
  if (record.status !== 'signed') throw apiError(409, 'CLOSE_NOT_ALLOWED', `A ${record.status} document has no sends to cancel.`);
  if (record.sends.length === 0) throw apiError(409, 'NO_SEND_CLAIMS', 'Nothing was sent for this version. Void or supersede it instead.');
  if (record.sends.some((s) => UNRESOLVED.has(s.status as SendStatus))) throw apiError(409, 'SENDS_UNRESOLVED', 'A copy has an unknown outcome. Reconcile it before closing this version.');
  const accepted = [...new Set(record.sends.filter((s) => ACCEPTED.has(s.status as SendStatus)).map((s) => s.recipientRole))].sort();
  if (STAGE_RECIPIENT_ROLES[stage].every((role) => accepted.includes(role))) {
    throw apiError(409, 'ALL_RECIPIENTS_ACCEPTED', 'Every recipient has this version. Finish sending, then supersede it.');
  }
  const acknowledged = Array.isArray(b.acknowledgedRolesAlreadyReceived) ? [...new Set(b.acknowledgedRolesAlreadyReceived.map(String))].sort() : null;
  if (!acknowledged || acknowledged.join(',') !== accepted.join(',')) {
    throw apiError(409, 'ACCEPTED_ROLES_CHANGED', 'The recipients who received this version changed. Reload before cancelling.');
  }
  if (stage === 'j5' && openJ6Follows(snapshot, record.id)) throw apiError(409, 'J5_LINKED_BY_OPEN_J6', 'An open J6 follows this J5. Void or supersede the J6 first.');
  return { record: await closeWith(ctx, stage, record, input, { sendCancelledBySubjectId: ctx.user.id, sendCancelReason: input.reason }, 'send_cancelled') };
}
