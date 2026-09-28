import 'server-only';

/**
 * Evidence routes: the J5 readiness and J6 class-started attestations, the
 * external prior quote, and the PDF uploads (board-signed voucher, board
 * invoice, manual quote copy). Uploads store the original bytes untouched
 * through the finance archive, then write the artifact row, the attestation
 * and the audit row in one transaction.
 */
import type { BillingArtifact, BillingAttestation, Prisma } from '@prisma/client';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import {
  recordClassStarted,
  recordExternalJ5Reference,
  recordJ5Readiness,
  recordVoucherBoardSigned,
  type AttestationDraft,
} from '../attestations';
import { classEndDate } from '../dates';
import { getBillingProviderOrgId } from '../../providerOrg';
import { AUTHORIZED_SIGNER } from '../constants';
import type {
  AttestationDto,
  BoardInvoiceUploadDto,
  ClassStartedDto,
  ExternalQuoteDto,
  VoucherReceiptAttestationDto,
  VoucherReceiptStatementDto,
  VoucherUploadDto,
} from '../dto';
import { authorizeSigner } from '../signing';
import type { FinanceArchiveKind } from '../storageArchive';
import { validateFinanceUpload, type ArtifactKind } from '../financeStorage';
import { resolveProgramTerms } from '../hours';
import { VOUCHER_REFERENCE_MAX } from '../rendererAdapter';
import type { TwoStageContext } from './access';
import { archiveErrorCode, financeArchive, type FinanceArchiveRef } from './archive';
import { currentVoucher, dateColumn, isDesignatedSigner, loadCaseSnapshot } from './caseData';
import { apiError, MAX_UPLOAD_FILE_BYTES, type MultipartUpload } from './http';
import { artifactView, buildCaseSummary, voucherAttestationView } from './summary';
import { allGates, GATE_MESSAGES } from './gates';

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const s = (v: unknown) => (typeof v === 'string' ? v : '');

function attestationData(draft: AttestationDraft) {
  const d = (v: string | null) => (v ? dateColumn(v) : null);
  return {
    kind: draft.kind,
    statement: draft.statement,
    evidenceReference: draft.evidenceReference,
    classStartDate: d(draft.classStartDate),
    classEndDate: d(draft.classEndDate),
    artifactId: draft.artifactId,
    voucherReference: draft.voucherReference,
    authorizedAmountCents: draft.authorizedAmountCents,
    authorizedStartDate: d(draft.authorizedStartDate),
    authorizedEndDate: d(draft.authorizedEndDate),
    receivedOn: d(draft.receivedOn),
    receivingSignaturePresent: draft.receivingSignaturePresent,
    externalReference: draft.externalReference,
    externalQuoteDate: d(draft.externalQuoteDate),
    quotedProgramSlug: draft.quotedProgramSlug,
    quotedClassName: draft.quotedClassName,
    authorizedProgramSlug: draft.authorizedProgramSlug,
    authorizedClassName: draft.authorizedClassName,
    studentReadyConfirmed: draft.studentReadyConfirmed,
    counselorRequestedBy: draft.counselorRequestedBy,
    counselorRequestedOn: d(draft.counselorRequestedOn),
    counselorRequestReference: draft.counselorRequestReference,
    attestedBySubjectId: draft.attestedBySubjectId,
  };
}

function invalid(errors: string[]): never {
  throw apiError(422, 'ATTESTATION_INVALID', errors[0] ?? 'Check the highlighted fields.', {
    blockers: errors.map((message) => ({ code: 'PREREQUISITE_UNMET' as const, message, hardHold: false })),
  });
}

function programClassName<P>(ctx: TwoStageContext<P>): string {
  const terms = resolveProgramTerms(ctx.billingCase!.programSlug);
  if (!terms.ok) throw apiError(422, 'PROGRAM_TERMS_UNAVAILABLE', terms.message);
  return terms.className;
}

function attestationDto<P>(_ctx: TwoStageContext<P>, row: BillingAttestation): AttestationDto {
  return {
    attestation: {
      id: row.id,
      kind: row.kind as AttestationDto['attestation']['kind'],
      statement: row.statement,
      attestedBy: { subjectId: row.attestedBySubjectId, displayName: null },
      attestedAt: row.attestedAt.toISOString(),
    },
  };
}

async function insertAttestation<P>(ctx: TwoStageContext<P>, draft: AttestationDraft, tx: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient): Promise<BillingAttestation> {
  const row = await tx.billingAttestation.create({ data: { ...attestationData(draft), organizationId: ctx.member.organizationId, caseId: ctx.billingCase!.id } });
  await auditLog(
    { actorUserId: ctx.user.id, action: 'billing.two_stage.attested', targetType: 'billing_case', targetId: ctx.billingCase!.id, metadata: { kind: draft.kind, attestationId: row.id, artifactId: draft.artifactId } },
    tx,
  );
  return row;
}

/** POST …/attestations/j5-readiness */
export async function attestJ5Readiness<P>(ctx: TwoStageContext<P>, body: unknown): Promise<AttestationDto> {
  const b = asObj(body);
  const result = recordJ5Readiness({
    studentName: ctx.member.fullName,
    className: programClassName(ctx),
    classStartDate: s(b.classStartDate),
    studentReadyConfirmed: b.studentReadyConfirmed === true,
    counselorRequestedBy: s(b.counselorRequestedBy),
    counselorRequestedOn: s(b.counselorRequestedOn),
    counselorRequestReference: s(b.counselorRequestReference),
    evidenceReference: s(b.evidenceReference),
    attestedBySubjectId: ctx.user.id,
    confirmed: b.confirmed === true,
    now: ctx.now,
  });
  if (!result.ok) invalid(result.errors);
  ctx.effects.mark();
  const row = await prisma.$transaction((tx) => insertAttestation(ctx, result.attestation, tx));
  return attestationDto(ctx, row);
}

/** POST …/attestations/class-started */
export async function attestClassStarted<P>(ctx: TwoStageContext<P>, body: unknown): Promise<ClassStartedDto> {
  const b = asObj(body);
  const result = recordClassStarted({
    studentName: ctx.member.fullName,
    className: programClassName(ctx),
    classStartDate: s(b.classStartDate),
    classEndDate: s(b.classEndDate),
    evidenceReference: s(b.evidenceReference),
    attestedBySubjectId: ctx.user.id,
    confirmed: b.confirmed === true,
    now: ctx.now,
  });
  if (!result.ok) invalid(result.errors);
  ctx.effects.mark();
  const row = await prisma.$transaction((tx) => insertAttestation(ctx, result.attestation, tx));
  const start = result.attestation.classStartDate!;
  return { ...attestationDto(ctx, row), endDateIsContract: result.attestation.classEndDate === classEndDate(start) };
}

export const VOUCHER_PDF_ONLY_MESSAGE = 'Upload the signed voucher as a PDF.';
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * PDF only (#2700 / storageArchive store PDFs only). The declared MIME type
 * must be application/pdf and the bytes must start with %PDF-; the file name
 * and extension are never trusted. Nothing is converted.
 */
export function requirePdfUpload(upload: MultipartUpload['file'], kind: ArtifactKind): NonNullable<MultipartUpload['file']> {
  const voucher = kind === 'board_signed_voucher';
  if (!upload) throw apiError(422, 'UPLOAD_EMPTY', 'The file is empty.', { field: 'file' });
  if (upload.bytes.byteLength === 0) throw apiError(422, 'UPLOAD_EMPTY', 'The file is empty.', { field: 'file' });
  if (upload.bytes.byteLength > MAX_UPLOAD_FILE_BYTES) {
    throw apiError(413, 'UPLOAD_TOO_LARGE', 'The file is larger than 4 MB. Upload a smaller PDF (scan at a lower resolution).', { field: 'file' });
  }
  const declaredPdf = upload.declaredType.trim().toLowerCase() === 'application/pdf';
  const magicPdf = PDF_MAGIC.every((byte, i) => upload.bytes[i] === byte);
  if (!declaredPdf || !magicPdf) {
    throw voucher
      ? apiError(415, 'VOUCHER_PDF_ONLY', VOUCHER_PDF_ONLY_MESSAGE, { field: 'file' })
      : apiError(415, 'UPLOAD_NOT_PDF', 'Upload this file as a PDF.', { field: 'file' });
  }
  return upload;
}

/** Archive the exact bytes (storage is not transactional: this runs before the database transaction). */
async function archive<P>(ctx: TwoStageContext<P>, kind: FinanceArchiveKind, upload: NonNullable<MultipartUpload['file']>) {
  const validated = validateFinanceUpload({ bytes: upload.bytes, fileName: upload.fileName });
  if (!validated.ok) throw apiError(415, kind === 'board_signed_voucher' ? 'VOUCHER_PDF_ONLY' : 'UPLOAD_NOT_PDF', validated.error, { field: 'file' });
  ctx.effects.mark();
  try {
    const { ref, reused } = await financeArchive().archiveFinancePdf({ caseId: ctx.billingCase!.id, kind, bytes: validated.upload.bytes });
    if (ref.sha256 !== validated.upload.sha256 || ref.byteLength !== validated.upload.byteLength) {
      throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'An archived file failed its integrity check. Contact an administrator.');
    }
    return { ref, reused, fileName: validated.upload.fileName };
  } catch (error) {
    const code = archiveErrorCode(error);
    if (code === 'INTEGRITY_MISMATCH') throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'An archived file failed its integrity check. Contact an administrator.');
    if (code) {
      throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive is not available. Reload the case before trying again; the file may or may not have been stored.');
    }
    throw error;
  }
}

async function upsertArtifact<P>(
  ctx: TwoStageContext<P>,
  tx: Prisma.TransactionClient,
  kind: FinanceArchiveKind,
  ref: FinanceArchiveRef,
  fileName: string,
): Promise<{ row: BillingArtifact; reused: boolean }> {
  const existing = await tx.billingArtifact.findFirst({ where: { organizationId: ctx.member.organizationId, caseId: ctx.billingCase!.id, storageBucket: ref.bucket, storageKey: ref.key } });
  if (existing) return { row: existing, reused: true };
  const row = await tx.billingArtifact.create({
    data: {
      organizationId: ctx.member.organizationId,
      caseId: ctx.billingCase!.id,
      kind,
      source: 'uploaded',
      fileName,
      mimeType: 'application/pdf',
      byteLength: ref.byteLength,
      sha256: ref.sha256,
      storageBucket: ref.bucket,
      storageKey: ref.key,
      createdBySubjectId: ctx.user.id,
    },
  });
  await auditLog(
    { actorUserId: ctx.user.id, action: 'billing.two_stage.uploaded', targetType: 'billing_case', targetId: ctx.billingCase!.id, metadata: { kind, artifactId: row.id, sha256: ref.sha256, byteLength: ref.byteLength } },
    tx,
  );
  return { row, reused: false };
}

/**
 * M1: a voucher_board_signed attestation (the voucher data entry) and the
 * receipt-signature attestation are made only by the organization's
 * designated signer principal. Checked here so the route answers with a
 * clear code before the database refuses.
 */
async function requireDesignatedSigner<P>(ctx: TwoStageContext<P>): Promise<string> {
  const designated = await prisma.billingDesignatedSigner.findFirst({ where: { organizationId: ctx.member.organizationId }, select: { userId: true } });
  if (!designated) throw apiError(503, 'SIGNER_PRINCIPAL_UNSET', GATE_MESSAGES.SIGNER_PRINCIPAL_UNSET);
  if (designated.userId.toLowerCase() !== ctx.user.id.toLowerCase()) {
    throw apiError(403, 'VOUCHER_ATTESTER_NOT_DESIGNATED', 'Only the designated signer can attest a board-signed voucher.');
  }
  return designated.userId;
}

function voucherAttestationInput<P>(ctx: TwoStageContext<P>, part: unknown, artifact: { id: string; kind: string }) {
  const b = asObj(part);
  const reference = s(b.voucherReference).trim();
  if (reference.length > VOUCHER_REFERENCE_MAX) {
    throw apiError(422, 'VOUCHER_REFERENCE_TOO_LONG', `The voucher/PO reference is limited to ${VOUCHER_REFERENCE_MAX} characters.`, { field: 'voucherReference' });
  }
  const result = recordVoucherBoardSigned({
    boardName: s(b.boardName),
    voucherReference: reference,
    artifact,
    authorizedAmountCents: typeof b.authorizedAmountCents === 'number' ? b.authorizedAmountCents : Number.NaN,
    authorizedProgramSlug: s(b.authorizedProgramSlug),
    authorizedClassName: s(b.authorizedClassName),
    authorizedStartDate: s(b.authorizedStartDate),
    authorizedEndDate: s(b.authorizedEndDate),
    receivedOn: s(b.receivedOn),
    receivingSignaturePresent: b.receivingSignaturePresent === true,
    evidenceReference: s(b.evidenceReference),
    attestedBySubjectId: ctx.user.id,
    confirmed: b.confirmed === true,
    now: ctx.now,
  });
  if (!result.ok) invalid(result.errors);
  return result.attestation;
}

async function voucherResponse<P>(ctx: TwoStageContext<P>, artifactId: string, reused: boolean): Promise<VoucherUploadDto> {
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  if (!snapshot) throw new Error('case vanished');
  const artifact = snapshot.artifacts.find((f) => f.id === artifactId)!;
  const current = currentVoucher(snapshot);
  const isCurrent = current?.artifact.id === artifactId;
  const summary = buildCaseSummary({
    snapshot,
    memberId: ctx.member.id,
    member: ctx.member,
    assignedCounselor: null,
    gates: allGates({ financeArchiveReady: true, designatedSigner: snapshot.designatedSignerUserId !== null }),
    viewerIsExecutiveSigner: false,
    viewerIsDesignatedSigner: isDesignatedSigner(snapshot, ctx.user.id),
    now: ctx.now,
  });
  const attestation = snapshot.attestations
    .filter((a) => a.kind === 'voucher_board_signed' && a.artifactId === artifactId)
    .sort((a, b) => b.attestedAt.getTime() - a.attestedAt.getTime())[0];
  return {
    artifact: artifactView(snapshot, ctx.member.id, artifact),
    reused,
    attestation: attestation ? voucherAttestationView(snapshot, attestation) : null,
    current: isCurrent,
    // A replaced voucher has no receipt attestation until Michael makes one on its exact hash.
    receiptAttestation: isCurrent ? summary.j6.voucher?.receiptAttestation ?? null : null,
    matches: isCurrent ? summary.j6.matches : null,
    holds: isCurrent ? summary.j6.holds : [],
    waitingOnDesignatedSigner: isCurrent ? summary.waitingOnDesignatedSigner : [],
  };
}

/**
 * POST …/voucher (multipart: `file`, optional `attestation`). Any admin may
 * upload the original voucher file (stored byte for byte, PDF only). The
 * data-entry `attestation` part is accepted only from the designated signer
 * (M1 rule); staff upload the file alone and Michael attests it.
 */
export async function uploadVoucher<P>(ctx: TwoStageContext<P>, upload: MultipartUpload, attestationPart: unknown | undefined): Promise<VoucherUploadDto> {
  // Validate everything before any storage write, so a bad form stores nothing.
  if (attestationPart !== undefined) {
    await requireDesignatedSigner(ctx);
    voucherAttestationInput(ctx, attestationPart, { id: 'pending-upload', kind: 'board_signed_voucher' });
  }
  const file = requirePdfUpload(upload.file, 'board_signed_voucher');
  const archived = await archive(ctx, 'board_signed_voucher', file);
  const result = await prisma.$transaction(async (tx) => {
    const { row, reused } = await upsertArtifact(ctx, tx, 'board_signed_voucher', archived.ref, archived.fileName);
    if (attestationPart !== undefined) await insertAttestation(ctx, voucherAttestationInput(ctx, attestationPart, { id: row.id, kind: row.kind }), tx);
    return { artifactId: row.id, reused: reused || archived.reused };
  });
  return voucherResponse(ctx, result.artifactId, result.reused);
}

/** POST …/voucher/[artifactId]/attestation (JSON, designated signer only): the voucher data entry for that exact file. */
export async function attestVoucher<P>(ctx: TwoStageContext<P>, artifactId: string, body: unknown): Promise<Omit<VoucherUploadDto, 'reused'>> {
  await requireDesignatedSigner(ctx);
  const artifact = await prisma.billingArtifact.findFirst({ where: { id: artifactId, caseId: ctx.billingCase!.id, organizationId: ctx.member.organizationId, kind: 'board_signed_voucher' } });
  if (!artifact) throw apiError(404, 'FILE_NOT_FOUND', 'This item was not found.');
  const draft = voucherAttestationInput(ctx, body, { id: artifact.id, kind: artifact.kind });
  ctx.effects.mark();
  await prisma.$transaction((tx) => insertAttestation(ctx, draft, tx));
  const { reused: _reused, ...rest } = await voucherResponse(ctx, artifact.id, false);
  return rest;
}

/** The exact statement Michael confirms for one voucher file. */
export function receiptStatement(args: { signerName: string; voucherReference: string; sha256: string }): string {
  return `I, ${args.signerName}, confirm that my receiving signature is on board voucher ${args.voucherReference} exactly as uploaded (sha256 ${args.sha256.slice(0, 12)}).`;
}

async function receiptTarget<P>(ctx: TwoStageContext<P>, artifactId: string) {
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  if (!snapshot) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
  const artifact = snapshot.artifacts.find((f) => f.id === artifactId && f.kind === 'board_signed_voucher');
  if (!artifact) throw apiError(404, 'FILE_NOT_FOUND', 'This item was not found.');
  const current = currentVoucher(snapshot);
  if (current?.artifact.id !== artifact.id) throw apiError(409, 'VOUCHER_NOT_CURRENT', 'A newer voucher was uploaded for this case. Attest the current voucher.');
  if (!current.attestation) {
    throw apiError(409, 'NOT_READY', 'Record the voucher details (reference, dates, amount) before attesting the receiving signature.', {
      blockers: [{ code: 'J6_VOUCHER_ATTESTATION_INCOMPLETE', message: 'Confirm the uploaded board-signed voucher: reference, received date, authorized program/class, amount and period.', hardHold: false }],
    });
  }
  return { snapshot, artifact, reference: current.attestation.voucherReference ?? '' };
}

/** GET …/voucher/[artifactId]/receipt-attestation: the statement text to confirm (no write). */
export async function receiptStatementFor<P>(ctx: TwoStageContext<P>, artifactId: string): Promise<VoucherReceiptStatementDto> {
  const { artifact, reference } = await receiptTarget(ctx, artifactId);
  return { artifactId: artifact.id, sha256: artifact.sha256, statementText: receiptStatement({ signerName: AUTHORIZED_SIGNER.name, voucherReference: reference, sha256: artifact.sha256 }) };
}

/**
 * POST …/voucher/[artifactId]/receipt-attestation — Michael's own
 * attestation that his receiving signature is on this exact uploaded file.
 * Designated signer principal only (and the configured signer account);
 * bound to the file's sha256; the database stamps attested_at.
 */
export async function attestReceiptSignature<P>(ctx: TwoStageContext<P>, artifactId: string, body: unknown): Promise<VoucherReceiptAttestationDto> {
  const principal = await requireDesignatedSigner(ctx);
  const signer = authorizeSigner({
    actor: { userId: ctx.user.id, organizationId: ctx.actorOrgId, isActive: true, isAdmin: true },
    providerOrgId: getBillingProviderOrgId(),
    stage: 'j6',
    now: ctx.now,
  });
  if (!signer.ok) throw apiError(signer.status, SIGNER_CODES[signer.reason], signer.message);
  const b = asObj(body);
  if (b.method !== undefined && b.method !== 'present_on_original') {
    throw apiError(503, 'RECEIPT_SIGNATURE_METHOD_UNAVAILABLE', 'Only "my receiving signature is on the original" can be attested in this release; no signature representation is approved.');
  }
  const { artifact, reference } = await receiptTarget(ctx, artifactId);
  if (s(b.expectedSha256) !== artifact.sha256) throw apiError(409, 'VOUCHER_HASH_MISMATCH', 'This voucher file changed since you reviewed it. Reload and review the current file.');
  const statement = receiptStatement({ signerName: AUTHORIZED_SIGNER.name, voucherReference: reference, sha256: artifact.sha256 });
  if (b.statementConfirmed !== true || s(b.statementText) !== statement) throw apiError(422, 'INTENT_NOT_CONFIRMED', 'Confirm the receiving-signature statement to attest it.');
  ctx.effects.mark();
  const row = await prisma.$transaction(async (tx) => {
    // attested_at is stamped by the database (M1 877466f); it is never passed.
    const created = await tx.billingVoucherReceiptSignature.create({
      data: {
        organizationId: ctx.member.organizationId,
        caseId: ctx.billingCase!.id,
        voucherArtifactId: artifact.id,
        voucherSha256: artifact.sha256,
        attestedByUserId: principal,
        method: 'present_on_original',
        statement,
      },
      select: { id: true, voucherArtifactId: true, voucherSha256: true, attestedByUserId: true, attestedAt: true },
    });
    await auditLog(
      {
        actorUserId: ctx.user.id,
        action: 'billing.two_stage.voucher_receipt_attested',
        targetType: 'billing_case',
        targetId: ctx.billingCase!.id,
        metadata: { voucherArtifactId: artifact.id, voucherSha256: artifact.sha256, method: 'present_on_original', receiptSignatureId: created.id },
      },
      tx,
    );
    return created;
  });
  return {
    receiptAttestation: {
      attestationId: row.id,
      artifactId: row.voucherArtifactId,
      sha256: row.voucherSha256,
      attestedBy: { subjectId: row.attestedByUserId, displayName: null },
      attestedAt: row.attestedAt.toISOString(),
      method: 'present_on_original',
    },
  };
}

const SIGNER_CODES = {
  signer_not_configured: 'SIGNER_NOT_CONFIGURED',
  not_provider_org: 'SIGNER_NOT_PROVIDER_ORG',
  inactive: 'SIGNER_INACTIVE',
  not_admin: 'SIGNER_NOT_ADMIN',
  not_signer: 'NOT_SIGNER',
} as const;
export { SIGNER_CODES };

/** POST …/board-invoice (multipart: file). */
export async function uploadBoardInvoice<P>(ctx: TwoStageContext<P>, upload: MultipartUpload): Promise<BoardInvoiceUploadDto> {
  const file = requirePdfUpload(upload.file, 'board_invoice');
  const archived = await archive(ctx, 'board_invoice', file);
  const { row, reused } = await prisma.$transaction((tx) => upsertArtifact(ctx, tx, 'board_invoice', archived.ref, archived.fileName));
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  return { artifact: artifactView(snapshot!, ctx.member.id, row), reused: reused || archived.reused };
}

/** POST …/attestations/external-quote (multipart: attestation + optional file). */
export async function attestExternalQuote<P>(ctx: TwoStageContext<P>, upload: MultipartUpload, part: unknown): Promise<ExternalQuoteDto> {
  const b = asObj(part);
  const input = (copy: { id: string; kind: string } | null) => {
    const result = recordExternalJ5Reference({
      externalReference: s(b.externalReference),
      externalQuoteDate: s(b.externalQuoteDate),
      quotedProgramSlug: s(b.quotedProgramSlug),
      quotedClassName: s(b.quotedClassName),
      copy,
      evidenceReference: s(b.evidenceReference),
      attestedBySubjectId: ctx.user.id,
      confirmed: b.confirmed === true,
      now: ctx.now,
    });
    if (!result.ok) invalid(result.errors);
    return result.attestation;
  };
  input(upload.file ? { id: 'pending-upload', kind: 'external_j5_copy' } : null);
  const archived = upload.file ? await archive(ctx, 'external_j5_copy', requirePdfUpload(upload.file, 'external_j5_copy')) : null;
  if (!archived) ctx.effects.mark();
  const result = await prisma.$transaction(async (tx) => {
    const copy = archived ? await upsertArtifact(ctx, tx, 'external_j5_copy', archived.ref, archived.fileName) : null;
    const attestation = await insertAttestation(ctx, input(copy ? { id: copy.row.id, kind: copy.row.kind } : null), tx);
    return { copy, attestation };
  });
  const snapshot = await loadCaseSnapshot(prisma, ctx.member.organizationId, ctx.billingCase!.id);
  return {
    ...attestationDto(ctx, result.attestation),
    copy: result.copy ? artifactView(snapshot!, ctx.member.id, result.copy.row) : null,
    reused: Boolean(result.copy?.reused || archived?.reused),
  };
}
