import 'server-only';

/**
 * Case list/open/summary, draft preview, the freeze checkpoint, payment and
 * the staff-only archive download. No route here writes except open-case and
 * payment-received, each with its audit row in the same transaction.
 */
import type { BillingStageRecord } from '@prisma/client';
import { auditLog } from '@/lib/audit';
import { resolveAssignedCounselorContact } from '@/lib/billing/packetAccess';
import { prisma } from '@/lib/db/prisma';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getBillingProviderOrgId } from '../../providerOrg';
import type { BillingStage } from '../constants';
import { recipientRowsForContent, type J5Content, type J6Content } from '../content';
import { billingToday, compareIsoDates, isIsoDate } from '../dates';
import type { CaseSummaryDto, FreezeDto, ListCasesDto, OpenCaseDto, PaymentDto } from '../dto';
import { resolveProgramTerms } from '../hours';
import { currentCasePaymentEvent, recordPaymentReceived } from '../payment';
import { RendererAdapterError, renderDraftFromContent } from '../rendererAdapter';
import { authorizeSigner, signerIntentStatement } from '../signing';
import { canSignJ6 } from '../stateMachine';
import type { TwoStageContext } from './access';
import { readArchived } from './archive';
import { holdBlockers, J6_ISSUE_DATE_NOT_TODAY_MESSAGE, RECEIVING_SIGNATURE_NOT_ATTESTED_MESSAGE, VOUCHER_RECEIPT_FUTURE_MESSAGE } from './blockers';
import { currentVoucher, dateColumn, isoDate, loadCaseSnapshot, receiptSignatureState, recordContent, type CaseSnapshot } from './caseData';
import { allGates, GATE_MESSAGES } from './gates';
import { apiError, json, NO_STORE_HEADERS } from './http';
import { readLetterheadLogo } from './logo';
import { basePath, buildCaseSummary, caseListItem, casePaymentDto, toPaymentEvent } from './summary';
import { stagePrerequisiteBlockers } from './draft';

async function snapshotOf<P>(ctx: TwoStageContext<P>): Promise<CaseSnapshot> {
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  if (!snapshot) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
  return snapshot;
}

export async function listCases<P>(ctx: TwoStageContext<P>): Promise<ListCasesDto> {
  const rows = await prisma.billingCase.findMany({ where: { organizationId: ctx.member.organizationId, memberId: ctx.member.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const snapshots = await Promise.all(rows.map((row) => loadCaseSnapshot(prisma, ctx.member.organizationId, row.id)));
  return { cases: snapshots.flatMap((s) => (s ? [caseListItem(s)] : [])) };
}

export async function openCase<P>(ctx: TwoStageContext<P>, body: unknown): Promise<OpenCaseDto> {
  const raw = body && typeof body === 'object' ? (body as { programSlug?: unknown }).programSlug : undefined;
  const slug = canonicalizeProgramSlug(typeof raw === 'string' ? raw : '');
  const terms = resolveProgramTerms(slug);
  if (!terms.ok) throw apiError(422, 'PROGRAM_TERMS_UNAVAILABLE', terms.message, { field: 'programSlug' });
  const existing = await prisma.billingCase.findFirst({ where: { organizationId: ctx.member.organizationId, memberId: ctx.member.id, programSlug: terms.canonicalSlug } });
  if (existing) throw apiError(409, 'CASE_EXISTS', 'This member already has a billing case for this program.');
  ctx.effects.mark();
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.billingCase.create({
      data: { organizationId: ctx.member.organizationId, memberId: ctx.member.id, subjectMemberId: ctx.member.id, programSlug: terms.canonicalSlug, createdBySubjectId: ctx.user.id },
    });
    await auditLog({ actorUserId: ctx.user.id, action: 'billing.two_stage.case_opened', targetType: 'billing_case', targetId: row.id, metadata: { programSlug: row.programSlug } }, tx);
    return row;
  });
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, created.id);
  return { case: caseListItem(snapshot!) };
}

function viewerIsSigner<P>(ctx: TwoStageContext<P>): boolean {
  return authorizeSigner({
    actor: { userId: ctx.user.id, organizationId: ctx.actorOrgId, isActive: true, isAdmin: true },
    providerOrgId: getBillingProviderOrgId(),
    stage: 'j5',
    now: ctx.now,
  }).ok;
}

export async function caseSummary<P>(ctx: TwoStageContext<P>): Promise<CaseSummaryDto> {
  const snapshot = await snapshotOf(ctx);
  const counselor = await resolveAssignedCounselorContact(ctx.member.id);
  return buildCaseSummary({
    snapshot,
    memberId: ctx.member.id,
    member: ctx.member,
    assignedCounselor: counselor ? { name: counselor.fullName, email: counselor.email } : null,
    // The archive gate is checked live only by the routes that touch storage; the summary never calls Storage.
    gates: allGates({ financeArchiveReady: false, designatedSigner: snapshot.designatedSignerUserId !== null }),
    viewerIsExecutiveSigner: viewerIsSigner(ctx) && snapshot.designatedSignerUserId?.toLowerCase() === ctx.user.id.toLowerCase(),
    now: ctx.now,
  });
}

function findRecord(snapshot: CaseSnapshot, stage: BillingStage, recordId: string | null) {
  const record = recordId ? snapshot.records.find((r) => r.id === recordId && r.stage === stage) : undefined;
  if (!record) throw apiError(404, 'RECORD_NOT_FOUND', 'This item was not found.');
  return record;
}

const FRAME_HEADERS = { 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" };

function adapterError(error: unknown): never {
  if (error instanceof RendererAdapterError) {
    const status = error.code === 'LOGO_CHANGED' ? 409 : 422;
    const code = error.code === 'CONTENT_NOT_RENDERABLE' ? 'TEXT_NOT_PRINTABLE' : error.code;
    throw apiError(status, code, error.message, error.field ? { field: error.field } : {});
  }
  throw error;
}

/** Header-safe list of stable codes (never free text). */
function codeList(codes: readonly string[]): string {
  return [...new Set(codes)].filter((c) => /^[A-Za-z0-9_]+$/u.test(c)).join(',');
}

/** GET …/[stage]/draft/preview?recordId=…&versionHash=… */
export async function draftPreview<P>(ctx: TwoStageContext<P>, stage: BillingStage): Promise<Response> {
  const url = new URL(ctx.request.url);
  const snapshot = await snapshotOf(ctx);
  const record = findRecord(snapshot, stage, url.searchParams.get('recordId'));
  if (record.status !== 'draft') throw apiError(409, 'NOT_A_DRAFT', 'Only a draft has a preview. Open the signed PDF instead.');
  if (url.searchParams.get('versionHash') !== record.contentSha256) {
    throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Review the current version.');
  }
  // A DRAFT preview is never blocked by open gates or holds: staff review the
  // layout first. The same blockers freeze/sign/send enforce travel with it.
  const content = recordContent<J5Content | J6Content>(record);
  const receipt = stage === 'j6' ? receiptSignatureState(snapshot) : null;
  const receiptValidForThisVoucher = content.kind === 'j6_invoice_cover_letter' && receipt?.valid?.voucherArtifactId === content.voucher.artifactId && receipt.valid.voucherSha256 === content.voucher.sha256;
  const boardInvoiceId = content.kind === 'j6_invoice_cover_letter' ? content.boardInvoice?.artifactId ?? null : null;
  const prereq = stagePrerequisiteBlockers(stage, snapshot, ctx.now, record, boardInvoiceId);
  const blockerCodes = prereq.blockers.map((b) => b.code);
  if (content.kind === 'j6_invoice_cover_letter' && !receiptValidForThisVoucher) blockerCodes.push('RECEIVING_SIGNATURE_NOT_ATTESTED');
  const logo = await readLetterheadLogo();
  let bytes: Uint8Array;
  try {
    bytes = await renderDraftFromContent(content, {
      logoPng: logo.bytes,
      frozenAt: record.updatedAt.toISOString(),
      receiptSignatureId: receiptValidForThisVoucher ? receipt!.valid!.id : null,
    });
  } catch (error) {
    adapterError(error);
  }
  return new Response(new Blob([new Uint8Array(bytes)]), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${record.documentNumber}-DRAFT.pdf"`,
      'X-Billing-Version-Hash': record.contentSha256,
      'X-Billing-Blocker-Codes': codeList(blockerCodes),
      'X-Billing-Holds': codeList(prereq.holds),
      ...FRAME_HEADERS,
      ...NO_STORE_HEADERS,
    },
  });
}

/**
 * The checks shared by freeze and sign, run on the saved version: exact hash,
 * the content rebuilt from the latest evidence gives the same hash, the
 * recipient rows equal the printed contacts, every readiness blocker is
 * clear, and for a J6 no hold, class started, voucher receipt not in the
 * future and the signer principal's receipt attestation on the voucher hash.
 */
export async function verifySignable<P>(
  ctx: TwoStageContext<P>,
  stage: BillingStage,
  recordId: string,
  versionHash: string,
): Promise<{ snapshot: CaseSnapshot; record: CaseSnapshot['records'][number]; content: J5Content | J6Content; receiptSignatureId: string | null }> {
  const snapshot = await snapshotOf(ctx);
  const record = findRecord(snapshot, stage, recordId);
  if (record.status !== 'draft') throw apiError(409, 'ALREADY_SIGNED', `This document is already ${record.status}.`);
  if (record.contentSha256 !== versionHash) throw apiError(409, 'VERSION_STALE', 'The document changed since you reviewed it. Review the current version and sign again.');
  const content = recordContent<J5Content | J6Content>(record);
  const logo = await readLetterheadLogo();
  if (logo.sha256 !== content.letterhead.logo.sha256) throw apiError(409, 'LOGO_CHANGED', 'The letterhead logo changed. Save the draft again to review the new version.');
  const rows = recipientRowsForContent(content);
  const frozen = record.recipients.map((r) => `${r.recipientRole}|${r.recipientName}|${r.email}|${r.phone ?? ''}`).sort();
  const expected = rows.map((r) => `${r.role}|${r.name}|${r.email}|${r.phone ?? ''}`).sort();
  if (frozen.join('\n') !== expected.join('\n')) throw apiError(409, 'RECIPIENT_SNAPSHOT_MISMATCH', 'The recipient list does not match the document. Save the draft again.');
  const boardInvoiceId = content.kind === 'j6_invoice_cover_letter' ? content.boardInvoice?.artifactId ?? null : null;
  const prereq = stagePrerequisiteBlockers(stage, snapshot, ctx.now, record, boardInvoiceId);
  const notReady = prereq.blockers.filter((b) => !b.hardHold);
  if (notReady.length > 0) throw apiError(409, 'NOT_READY', 'Complete the steps listed before signing.', { blockers: notReady });
  if (prereq.holds.length > 0) throw apiError(409, 'J6_HELD', 'This J6 is on hold.', { holds: prereq.holds, blockers: holdBlockers(prereq.holds) });
  // The frozen content must still be what the latest evidence produces (a newer attestation or upload makes it stale).
  let receiptSignatureId: string | null = null;
  if (content.kind === 'j6_invoice_cover_letter') {
    const voucher = currentVoucher(snapshot);
    if (!voucher || voucher.artifact.id !== content.voucher.artifactId || voucher.attestation?.id !== content.voucher.attestationId) {
      throw apiError(409, 'DRAFT_STALE', DRAFT_STALE_MESSAGE);
    }
    const receipt = receiptSignatureState(snapshot);
    const receiptOk = receipt?.status.ok === true && receipt.valid?.voucherSha256 === content.voucher.sha256;
    const held = canSignJ6({
      reviewReasons: content.reviewReasons,
      classStartDate: content.training.classStartDate,
      now: ctx.now,
      voucherReceiptSignature: receiptOk ? { ok: true } : receipt?.status,
    });
    if (content.reviewReasons.length > 0) throw apiError(409, 'J6_HELD', 'This J6 is on hold.', { holds: content.reviewReasons, blockers: holdBlockers(content.reviewReasons) });
    if (!receiptOk) {
      if (snapshot.designatedSignerUserId === null) throw apiError(503, 'SIGNER_PRINCIPAL_UNSET', GATE_MESSAGES.SIGNER_PRINCIPAL_UNSET);
      throw apiError(409, 'RECEIVING_SIGNATURE_NOT_ATTESTED', RECEIVING_SIGNATURE_NOT_ATTESTED_MESSAGE);
    }
    if (!held.ok) throw apiError(409, 'CLASS_NOT_STARTED', 'The class has not started yet; a J6 is signed only after it starts.');
    const today = billingToday(ctx.now);
    if (compareIsoDates(content.voucher.receivedOn, today) > 0) {
      throw apiError(409, 'NOT_READY', VOUCHER_RECEIPT_FUTURE_MESSAGE, { blockers: [{ code: 'J6_VOUCHER_RECEIPT_FUTURE', message: VOUCHER_RECEIPT_FUTURE_MESSAGE, hardHold: false }] });
    }
    // The J6 is dated the day it is signed (server date), never earlier than class start or voucher receipt.
    if (content.issueDate !== today) {
      throw apiError(409, 'DRAFT_STALE', J6_ISSUE_DATE_NOT_TODAY_MESSAGE, { blockers: [{ code: 'J6_ISSUE_DATE_NOT_TODAY', message: J6_ISSUE_DATE_NOT_TODAY_MESSAGE, hardHold: false }] });
    }
    receiptSignatureId = receipt!.valid!.id;
  } else {
    const readiness = snapshot.attestations
      .filter((a) => a.kind === 'j5_readiness')
      .sort((a, b) => b.attestedAt.getTime() - a.attestedAt.getTime())[0];
    if (readiness?.id !== content.readiness.attestationId) throw apiError(409, 'DRAFT_STALE', DRAFT_STALE_MESSAGE);
  }
  return { snapshot, record, content, receiptSignatureId };
}

const DRAFT_STALE_MESSAGE = 'The evidence or letterhead changed since this draft was saved. Save the draft again and review the new preview.';

/** POST …/[stage]/freeze — a verified checkpoint; writes nothing. */
export async function freeze<P>(ctx: TwoStageContext<P>, stage: BillingStage, body: unknown): Promise<FreezeDto> {
  const b = (body && typeof body === 'object' ? body : {}) as { recordId?: unknown; versionHash?: unknown };
  const recordId = typeof b.recordId === 'string' ? b.recordId : '';
  const versionHash = typeof b.versionHash === 'string' ? b.versionHash : '';
  const { record, content } = await verifySignable(ctx, stage, recordId, versionHash);
  return {
    recordId: record.id,
    version: record.version,
    versionHash: record.contentSha256,
    documentTitle: content.title,
    documentNumber: content.documentNumber,
    intentText: signerIntentStatement({ documentTitle: content.title, documentNumber: content.documentNumber, contentSha256: record.contentSha256 }),
    previewPath: `${basePath(ctx.member.id, ctx.billingCase!.id)}/${stage}/draft/preview?recordId=${record.id}&versionHash=${record.contentSha256}`,
    holds: [],
  };
}

/**
 * GET …/files/[artifactId] — the only read path into the finance archive:
 * admin, tenant, provider-org and case checks have already run. No signed or
 * public URL is ever produced; the bytes are verified against the row.
 */
export async function downloadFile<P>(ctx: TwoStageContext<P>, artifactId: string): Promise<Response> {
  const row = await prisma.billingArtifact.findFirst({ where: { id: artifactId, caseId: ctx.billingCase!.id, organizationId: ctx.member.organizationId } });
  if (!row) throw apiError(404, 'FILE_NOT_FOUND', 'This item was not found.');
  const bytes = await readArchived(row);
  return new Response(new Blob([new Uint8Array(bytes)]), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${row.fileName.replace(/["\\]/gu, '_')}"`,
      'X-Billing-Sha256': row.sha256,
      ...FRAME_HEADERS,
      ...NO_STORE_HEADERS,
    },
  });
}

export async function payment<P>(ctx: TwoStageContext<P>): Promise<PaymentDto> {
  return casePaymentDto(await snapshotOf(ctx), ctx.now);
}

/** POST …/payment/received */
export async function paymentReceived<P>(ctx: TwoStageContext<P>, body: unknown): Promise<PaymentDto> {
  const b = (body && typeof body === 'object' ? body : {}) as { j6RecordId?: unknown; receivedOn?: unknown; evidence?: unknown };
  const snapshot = await snapshotOf(ctx);
  const everSent = new Set(snapshot.records.filter((r: BillingStageRecord) => r.stage === 'j6' && r.sentAt).map((r) => r.id));
  const events = snapshot.paymentEvents.filter((e) => everSent.has(e.j6RecordId)).map(toPaymentEvent);
  const current = currentCasePaymentEvent(events);
  if (current && current.status === 'pending' && b.j6RecordId !== current.j6RecordId) {
    throw apiError(409, 'PAYMENT_J6_CHANGED', 'The J6 this payment belongs to changed. Reload before recording it.');
  }
  const receivedOn = typeof b.receivedOn === 'string' ? b.receivedOn : '';
  const result = recordPaymentReceived(current, { receivedOn, evidence: typeof b.evidence === 'string' ? b.evidence : '', now: ctx.now });
  if (!result.ok) {
    const code = !current
      ? 'PAYMENT_NOT_TRACKED'
      : current.status === 'received'
        ? 'PAYMENT_ALREADY_RECEIVED'
        : !isIsoDate(receivedOn)
          ? 'PAYMENT_DATE_INVALID'
          : compareIsoDates(receivedOn, billingToday(ctx.now)) > 0
            ? 'PAYMENT_RECEIVED_IN_FUTURE'
            : 'PAYMENT_EVIDENCE_REQUIRED';
    throw apiError(code === 'PAYMENT_NOT_TRACKED' || code === 'PAYMENT_ALREADY_RECEIVED' ? 409 : 422, code, result.error);
  }
  ctx.effects.mark();
  await prisma.$transaction(async (tx) => {
    const row = await tx.billingPaymentEvent.create({
      data: {
        organizationId: ctx.member.organizationId,
        caseId: ctx.billingCase!.id,
        j6RecordId: current!.j6RecordId,
        status: 'received',
        receivedOn: dateColumn(result.event.receivedOn),
        evidence: result.event.evidence,
        recordedBySubjectId: ctx.user.id,
      },
    });
    await auditLog(
      { actorUserId: ctx.user.id, action: 'billing.two_stage.payment_received', targetType: 'billing_case', targetId: ctx.billingCase!.id, metadata: { paymentEventId: row.id, j6RecordId: row.j6RecordId, receivedOn: result.event.receivedOn } },
      tx,
    );
  });
  return casePaymentDto(await snapshotOf(ctx), ctx.now);
}

export { json, isoDate };
