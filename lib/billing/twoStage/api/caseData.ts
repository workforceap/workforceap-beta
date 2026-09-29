import 'server-only';

/**
 * Loads one billing case and everything the M3 routes derive from it, with
 * the organization named in every query, and converts database rows to the
 * M1 pure-function inputs (ISO date strings, Attestation, ArtifactSummary).
 */
import type {
  BillingArtifact,
  BillingAttestation,
  BillingCase,
  BillingDeliveryEvent,
  BillingPaymentEvent,
  BillingSignerSignatureAsset,
  BillingStageRecipient,
  BillingStageRecord,
  BillingStageSend,
  BillingVoucherReceiptSignature,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { activeSignatureAsset, type SignerSignatureAsset } from '../signatureAsset';
import { voucherReceiptSignatureStatus, type VoucherReceiptSignatureMethod, type VoucherReceiptSignatureStatus } from '../voucherReceipt';
import type { Attestation, AttestationKind } from '../attestations';
import type { BillingStage } from '../constants';
import type { J5Content, J6Content } from '../content';
import type { J6Prerequisites, StageStatus, SystemJ5 } from '../stateMachine';
import type { ArtifactSummary } from '../stateMachine';
import type { Actor } from '../dto';

export type RecordWithRelations = BillingStageRecord & {
  recipients: BillingStageRecipient[];
  sends: Array<BillingStageSend & { deliveryEvents: BillingDeliveryEvent[] }>;
};

export type CaseSnapshot = {
  billingCase: BillingCase;
  attestations: BillingAttestation[];
  artifacts: BillingArtifact[];
  records: RecordWithRelations[];
  paymentEvents: BillingPaymentEvent[];
  /** Designated-signer receipt-signature attestations on this case's vouchers (append-only). */
  receiptSignatures: BillingVoucherReceiptSignature[];
  /** The organization's designated signer principal (M1 billing_designated_signers), or null (unset: J6 stays closed). */
  designatedSignerUserId: string | null;
  /**
   * The organization's signature images, newest first (org-level, not case
   * data). At most one is active; a revoked row is history and never signs.
   */
  signatureAssets: BillingSignerSignatureAsset[];
  /** subjectId -> display name, for every actor id on the rows (null when the account is gone). */
  actorNames: Map<string, string | null>;
};

type Db = Pick<
  typeof prisma,
  | 'billingCase'
  | 'billingAttestation'
  | 'billingArtifact'
  | 'billingStageRecord'
  | 'billingPaymentEvent'
  | 'billingVoucherReceiptSignature'
  | 'billingDesignatedSigner'
  | 'billingSignerSignatureAsset'
>;

export async function loadCaseSnapshot(db: Db, organizationId: string, caseId: string): Promise<CaseSnapshot | null> {
  const billingCase = await db.billingCase.findFirst({ where: { id: caseId, organizationId } });
  if (!billingCase) return null;
  const [attestations, artifacts, records, paymentEvents, receiptSignatures, designated, signatureAssets] = await Promise.all([
    db.billingAttestation.findMany({ where: { caseId, organizationId }, orderBy: { attestedAt: 'desc' } }),
    db.billingArtifact.findMany({ where: { caseId, organizationId }, orderBy: { createdAt: 'desc' } }),
    db.billingStageRecord.findMany({
      where: { caseId, organizationId },
      orderBy: [{ stage: 'asc' }, { version: 'desc' }],
      include: { recipients: true, sends: { include: { deliveryEvents: true }, orderBy: { attemptNo: 'asc' } } },
    }),
    db.billingPaymentEvent.findMany({ where: { caseId, organizationId }, orderBy: { recordedAt: 'asc' } }),
    db.billingVoucherReceiptSignature.findMany({ where: { caseId, organizationId }, orderBy: { attestedAt: 'desc' } }),
    db.billingDesignatedSigner.findFirst({ where: { organizationId }, select: { userId: true } }),
    db.billingSignerSignatureAsset.findMany({ where: { organizationId }, orderBy: { uploadedAt: 'desc' }, take: 50 }),
  ]);
  const ids = new Set<string>([billingCase.createdBySubjectId]);
  for (const a of attestations) ids.add(a.attestedBySubjectId);
  for (const f of artifacts) ids.add(f.createdBySubjectId);
  for (const r of records) {
    ids.add(r.createdBySubjectId);
    if (r.signedBySubjectId) ids.add(r.signedBySubjectId);
    if (r.closedBySubjectId) ids.add(r.closedBySubjectId);
    if (r.sendCancelledBySubjectId) ids.add(r.sendCancelledBySubjectId);
    for (const s of r.sends) if (s.reconciledBySubjectId) ids.add(s.reconciledBySubjectId);
  }
  for (const p of paymentEvents) ids.add(p.recordedBySubjectId);
  for (const r of receiptSignatures) ids.add(r.attestedByUserId);
  const users = await withTenantScope(organizationId, (scoped) =>
    scoped.user.findMany({ where: { id: { in: [...ids] }, organizationId }, select: { id: true, fullName: true } }),
  );
  const names = new Map<string, string | null>([...ids].map((id) => [id, null]));
  for (const u of users) names.set(u.id, u.fullName);
  return {
    billingCase,
    attestations,
    artifacts,
    records: records as RecordWithRelations[],
    paymentEvents,
    receiptSignatures,
    designatedSignerUserId: designated?.userId ?? null,
    signatureAssets,
    actorNames: names,
  };
}

export function toSignerAsset(row: BillingSignerSignatureAsset): SignerSignatureAsset {
  return { id: row.id, organizationId: row.organizationId, signerUserId: row.signerUserId, sha256: row.sha256, revokedAt: row.revokedAt };
}

/** The designated signer's one active signature image row, or null (no image approved: signing stays closed). */
export function activeSignatureRow(snapshot: Pick<CaseSnapshot, 'signatureAssets' | 'designatedSignerUserId'>): BillingSignerSignatureAsset | null {
  const active = activeSignatureAsset(snapshot.signatureAssets.map(toSignerAsset), snapshot.designatedSignerUserId);
  return active ? snapshot.signatureAssets.find((row) => row.id === active.id) ?? null : null;
}

export function actor(snapshot: Pick<CaseSnapshot, 'actorNames'>, subjectId: string): Actor {
  return { subjectId, displayName: snapshot.actorNames.get(subjectId) ?? null };
}

/** A DATE column as `YYYY-MM-DD` (Prisma reads DATE as midnight UTC). */
export function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** `YYYY-MM-DD` to the Date Prisma writes to a DATE column. */
export function dateColumn(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toAttestation(row: BillingAttestation): Attestation {
  return {
    id: row.id,
    kind: row.kind as AttestationKind,
    statement: row.statement,
    evidenceReference: row.evidenceReference,
    classStartDate: isoDate(row.classStartDate),
    classEndDate: isoDate(row.classEndDate),
    artifactId: row.artifactId,
    voucherReference: row.voucherReference,
    authorizedAmountCents: row.authorizedAmountCents,
    authorizedStartDate: isoDate(row.authorizedStartDate),
    authorizedEndDate: isoDate(row.authorizedEndDate),
    receivedOn: isoDate(row.receivedOn),
    receivingSignaturePresent: row.receivingSignaturePresent,
    externalReference: row.externalReference,
    externalQuoteDate: isoDate(row.externalQuoteDate),
    quotedProgramSlug: row.quotedProgramSlug,
    quotedClassName: row.quotedClassName,
    authorizedProgramSlug: row.authorizedProgramSlug,
    authorizedClassName: row.authorizedClassName,
    studentReadyConfirmed: row.studentReadyConfirmed,
    counselorRequestedBy: row.counselorRequestedBy,
    counselorRequestedOn: isoDate(row.counselorRequestedOn),
    counselorRequestReference: row.counselorRequestReference,
    attestedBySubjectId: row.attestedBySubjectId,
    attestedAt: row.attestedAt.toISOString(),
  };
}

export function toArtifactSummary(row: BillingArtifact): ArtifactSummary {
  return { id: row.id, kind: row.kind, fileName: row.fileName, mimeType: row.mimeType, byteLength: row.byteLength, sha256: row.sha256 };
}

export function latestAttestation(snapshot: Pick<CaseSnapshot, 'attestations'>, kind: AttestationKind): BillingAttestation | null {
  return snapshot.attestations.filter((a) => a.kind === kind).sort((a, b) => b.attestedAt.getTime() - a.attestedAt.getTime())[0] ?? null;
}

export function stageRecords(snapshot: Pick<CaseSnapshot, 'records'>, stage: BillingStage): RecordWithRelations[] {
  return snapshot.records.filter((r) => r.stage === stage).sort((a, b) => b.version - a.version);
}

export function latestRecord(snapshot: Pick<CaseSnapshot, 'records'>, stage: BillingStage): RecordWithRelations | null {
  return stageRecords(snapshot, stage)[0] ?? null;
}

export function recordContent<T extends J5Content | J6Content>(record: BillingStageRecord): T {
  return record.content as unknown as T;
}

/**
 * The current voucher: the board-signed voucher file of the newest voucher
 * event, an upload (artifact created) or a data-entry attestation naming a
 * file. A new upload therefore replaces the previous voucher at once, and
 * every attestation made for the older file (data entry and Michael's
 * receipt signature) stops applying to the case. `attestation` is the newest
 * voucher_board_signed attestation of that exact file, or null.
 */
export function currentVoucher(
  snapshot: Pick<CaseSnapshot, 'attestations' | 'artifacts'>,
): { artifact: BillingArtifact; attestation: BillingAttestation | null } | null {
  const vouchers = snapshot.artifacts.filter((f) => f.kind === 'board_signed_voucher');
  const events: Array<{ at: number; artifactId: string }> = [
    ...vouchers.map((f) => ({ at: f.createdAt.getTime(), artifactId: f.id })),
    ...snapshot.attestations.filter((a) => a.kind === 'voucher_board_signed' && a.artifactId).map((a) => ({ at: a.attestedAt.getTime(), artifactId: a.artifactId as string })),
  ].sort((a, b) => b.at - a.at);
  const artifact = events.map((e) => vouchers.find((f) => f.id === e.artifactId)).find((f) => f !== undefined);
  if (!artifact) return null;
  const attestation =
    snapshot.attestations
      .filter((a) => a.kind === 'voucher_board_signed' && a.artifactId === artifact.id)
      .sort((a, b) => b.attestedAt.getTime() - a.attestedAt.getTime())[0] ?? null;
  return { artifact, attestation };
}

/** Whether `userId` is the organization's billing_designated_signers principal (false while none is configured). */
export function isDesignatedSigner(snapshot: Pick<CaseSnapshot, 'designatedSignerUserId'>, userId: string): boolean {
  return snapshot.designatedSignerUserId !== null && snapshot.designatedSignerUserId.toLowerCase() === userId.toLowerCase();
}

export type ReceiptSignatureState = {
  status: VoucherReceiptSignatureStatus;
  /** The valid designated-signer attestation on the current voucher's exact bytes, or null. */
  valid: BillingVoucherReceiptSignature | null;
};

/** M1 voucherReceiptSignatureStatus() for the current voucher (null when there is no voucher yet). */
export function receiptSignatureState(snapshot: Pick<CaseSnapshot, 'attestations' | 'artifacts' | 'receiptSignatures' | 'designatedSignerUserId'>): ReceiptSignatureState | null {
  const voucher = currentVoucher(snapshot);
  if (!voucher) return null;
  const rows = snapshot.receiptSignatures.filter((r) => r.voucherArtifactId === voucher.artifact.id);
  const status = voucherReceiptSignatureStatus({
    voucher: { artifactId: voucher.artifact.id, sha256: voucher.artifact.sha256 },
    designatedSignerUserId: snapshot.designatedSignerUserId,
    attestations: rows.map((r) => ({
      voucherArtifactId: r.voucherArtifactId,
      voucherSha256: r.voucherSha256,
      attestedByUserId: r.attestedByUserId,
      method: r.method as VoucherReceiptSignatureMethod,
      representation: r.representationArtifactId && r.representationSha256 ? { artifactId: r.representationArtifactId, sha256: r.representationSha256 } : null,
      attestedAt: r.attestedAt.toISOString(),
    })),
  });
  const valid = status.ok
    ? rows.find((r) => r.attestedByUserId === snapshot.designatedSignerUserId && r.voucherSha256 === voucher.artifact.sha256) ?? null
    : null;
  return { status, valid };
}

/** The prior quote a J6 follows: the case's sent system J5 wins over an attested external quote. */
export function priorQuote(snapshot: Pick<CaseSnapshot, 'records' | 'attestations'>): J6Prerequisites['priorJ5'] {
  const sent = stageRecords(snapshot, 'j5').find((r) => r.status === 'sent');
  if (sent) {
    const j5: SystemJ5 = { recordId: sent.id, status: sent.status as StageStatus, content: recordContent<J5Content>(sent), contentSha256: sent.contentSha256 };
    return { source: 'system', j5 };
  }
  const external = latestAttestation(snapshot, 'external_j5_reference');
  return external ? { source: 'external', attestation: toAttestation(external) } : null;
}

/** J6 prerequisites from the latest evidence; `editingRecordId` is the draft being updated (not "another open J6"). */
export function j6Prerequisites(
  snapshot: CaseSnapshot,
  args: { now: Date; boardInvoiceArtifactId: string | null; editingRecordId: string | null },
): J6Prerequisites {
  const voucher = currentVoucher(snapshot);
  const classStarted = latestAttestation(snapshot, 'class_started');
  const invoice = args.boardInvoiceArtifactId ? snapshot.artifacts.find((f) => f.id === args.boardInvoiceArtifactId) ?? null : null;
  const hasOpenJ6 = stageRecords(snapshot, 'j6').some((r) => ['draft', 'signed', 'sent'].includes(r.status) && r.id !== args.editingRecordId);
  return {
    now: args.now,
    hasOpenJ6,
    programSlug: snapshot.billingCase.programSlug,
    priorJ5: priorQuote(snapshot),
    classStarted: classStarted ? toAttestation(classStarted) : null,
    voucher: voucher ? toArtifactSummary(voucher.artifact) : null,
    voucherAttestation: voucher?.attestation ? toAttestation(voucher.attestation) : null,
    boardInvoice: invoice ? toArtifactSummary(invoice) : args.boardInvoiceArtifactId ? { id: args.boardInvoiceArtifactId, kind: 'missing', fileName: '', mimeType: '', byteLength: 0, sha256: '' } : null,
  };
}
