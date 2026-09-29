import 'server-only';

/**
 * The designated signer's approved handwritten-signature image (M1 aade34e).
 *
 * The image is organization-level, not case data: one active PNG per
 * organization, uploaded only by the designated signer signed in as himself.
 * That upload, after he confirms the exact approval statement, is his approval;
 * the database enforces the same (SIGNATURE_ASSET_WRONG_PRINCIPAL, one active
 * row, append-only). Replacing it revokes the old row (who and why) in the
 * same transaction; a revoke or replacement never alters a signed record,
 * which keeps the hash it froze.
 *
 * Nothing here signs anything: the image never authorizes a document. The
 * sign route still requires the designated signer's own authenticated act.
 */
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { getBillingProviderOrgId } from '../../providerOrg';
import { canEmbedSignaturePng } from '../documentPdf';
import type { SignatureStatusDto, SignatureUploadDto } from '../dto';
import { canUploadSignatureAsset, inspectSignaturePng, SIGNATURE_ASSET_MIME, signatureApprovalStatement } from '../signatureAsset';
import { authorizeSigner } from '../signing';
import { isUniqueViolation, type TwoStageContext } from './access';
import { archiveErrorCode, signatureStore } from './archive';
import { activeSignatureRow } from './caseData';
import { SIGNER_CODES } from './evidence';
import { envGates, GATE_MESSAGES } from './gates';
import { apiError, parseJsonField, type MultipartUpload } from './http';
import { signatureAssetDto, signatureStatus } from './signatureView';

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

const MAX_REVOKE_REASON = 500;

async function loadOrgSignatureState(organizationId: string) {
  const [designated, signatureAssets] = await Promise.all([
    prisma.billingDesignatedSigner.findFirst({ where: { organizationId }, select: { userId: true } }),
    prisma.billingSignerSignatureAsset.findMany({ where: { organizationId }, orderBy: { uploadedAt: 'desc' }, take: 50 }),
  ]);
  return { designatedSignerUserId: designated?.userId ?? null, signatureAssets };
}

/** GET …/signature */
export async function getSignature<P>(ctx: TwoStageContext<P>): Promise<SignatureStatusDto> {
  const state = await loadOrgSignatureState(ctx.member.organizationId);
  const designated = state.designatedSignerUserId;
  return signatureStatus(state, designated !== null && designated.toLowerCase() === ctx.user.id.toLowerCase());
}

/** The attestation part of the upload: the exact statement, echoed back, and (for a replacement) why. */
function parseAttestation(part: unknown): { replace: boolean; revokeReason: string } {
  const b = asObj(part);
  if (b.statementConfirmed !== true || b.statementText !== signatureApprovalStatement()) {
    throw apiError(422, 'SIGNATURE_STATEMENT_NOT_CONFIRMED', 'Confirm the approval statement to approve your signature image.', { field: 'attestation' });
  }
  const revokeReason = typeof b.revokeReason === 'string' ? b.revokeReason.trim() : '';
  if (revokeReason.length > MAX_REVOKE_REASON) throw apiError(422, 'VALIDATION_FAILED', `The reason is limited to ${MAX_REVOKE_REASON} characters.`, { field: 'revokeReason' });
  return { replace: b.replace === true, revokeReason };
}

/**
 * POST …/signature (multipart: PNG `file`, `attestation`). Approve the
 * designated signer's signature image, or replace the active one.
 */
export async function uploadSignature<P>(ctx: TwoStageContext<P>, upload: MultipartUpload): Promise<{ status: 200 | 201; body: SignatureUploadDto }> {
  const organizationId = ctx.member.organizationId;
  const state = await loadOrgSignatureState(organizationId);

  // Who: the designated signer, signed in as himself (same guards as signing and the receipt attestation).
  const allowed = canUploadSignatureAsset({ actorUserId: ctx.user.id, designatedSignerUserId: state.designatedSignerUserId });
  if (!allowed.ok) {
    if (allowed.code === 'SIGNER_PRINCIPAL_UNSET') throw apiError(503, 'SIGNER_PRINCIPAL_UNSET', GATE_MESSAGES.SIGNER_PRINCIPAL_UNSET);
    throw apiError(403, 'SIGNATURE_ASSET_WRONG_PRINCIPAL', allowed.error);
  }
  if (!envGates().signing.enabled) throw apiError(503, 'SIGNER_NOT_CONFIGURED', GATE_MESSAGES.SIGNER_NOT_CONFIGURED);
  const signer = authorizeSigner({
    actor: { userId: ctx.user.id, organizationId: ctx.actorOrgId, isActive: true, isAdmin: true },
    providerOrgId: getBillingProviderOrgId(),
    stage: 'j5',
    now: ctx.now,
    designatedSignerUserId: state.designatedSignerUserId,
    env: process.env,
  });
  if (!signer.ok) throw apiError(signer.status, SIGNER_CODES[signer.reason], signer.message);
  const signerUserId = state.designatedSignerUserId as string;

  // What: validate everything before any storage write, so a bad form stores nothing.
  const attestation = parseAttestation(parseJsonField(upload.fields, 'attestation'));
  const file = upload.file;
  if (!file || file.bytes.byteLength === 0) throw apiError(422, 'UPLOAD_EMPTY', 'Choose your signature image (a PNG) to upload.', { field: 'file' });
  if (file.declaredType && file.declaredType.toLowerCase() !== SIGNATURE_ASSET_MIME) {
    throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload the signature as a PNG image.', { field: 'file' });
  }
  const inspected = inspectSignaturePng(file.bytes);
  if (!inspected.ok) throw apiError(422, 'SIGNATURE_IMAGE_INVALID', inspected.error, { field: 'file' });
  if (!(await canEmbedSignaturePng(file.bytes))) {
    throw apiError(422, 'SIGNATURE_IMAGE_INVALID', 'This PNG cannot be placed on a PDF. Export it again as a standard, non-interlaced PNG.', { field: 'file' });
  }

  const active = activeSignatureRow(state);
  if (active && active.sha256 === inspected.png.sha256) {
    // The same image again: nothing to change.
    return { status: 200, body: { signature: signatureAssetDto(active), replaced: null } };
  }
  if (active) {
    if (!attestation.replace) {
      throw apiError(409, 'SIGNATURE_ASSET_EXISTS', 'An approved signature image already exists. To replace it, confirm the replacement and say why.', { field: 'attestation' });
    }
    if (!attestation.revokeReason) {
      throw apiError(422, 'SIGNATURE_REVOKE_REASON_REQUIRED', 'Record why the current signature image is being replaced.', { field: 'revokeReason' });
    }
  }

  // Store the exact bytes first (content-addressed, private, never overwritten), then record the approval.
  ctx.effects.mark();
  let stored: Awaited<ReturnType<ReturnType<typeof signatureStore>['storeSignaturePng']>>;
  try {
    stored = await signatureStore().storeSignaturePng({ organizationId, signerUserId, bytes: file.bytes });
    ctx.effects.committed();
  } catch (error) {
    const code = archiveErrorCode(error);
    if (code === 'INTEGRITY_MISMATCH') throw apiError(502, 'ARCHIVE_INTEGRITY_MISMATCH', 'The signature image failed its integrity check. Nothing was approved. Contact an administrator.');
    if (code) throw apiError(503, 'FINANCE_ARCHIVE_UNAVAILABLE', 'The billing finance archive is not available. Nothing was approved.');
    throw error;
  }
  const { ref, png } = stored;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (active) {
        // The database stamps revoked_at; only who and why are passed.
        const revoked = await tx.billingSignerSignatureAsset.updateMany({
          where: { id: active.id, organizationId, revokedAt: null },
          data: { revokedBySubjectId: ctx.user.id, revokeReason: attestation.revokeReason },
        });
        if (revoked.count !== 1) throw apiError(409, 'SIGNATURE_ASSET_EXISTS', 'The signature image changed. Reload and try again.');
      }
      // uploaded_at / approved_at are stamped by the database (the signer's own upload is his approval).
      const created = await tx.billingSignerSignatureAsset.create({
        data: {
          organizationId,
          signerUserId,
          uploadedByUserId: ctx.user.id,
          storageBucket: ref.bucket,
          storageKey: ref.key,
          mimeType: SIGNATURE_ASSET_MIME,
          byteLength: png.byteLength,
          sha256: png.sha256,
          widthPx: png.widthPx,
          heightPx: png.heightPx,
          pngHeader: Buffer.from(png.pngHeader),
          approvalStatement: signatureApprovalStatement(),
        },
      });
      await auditLog(
        {
          actorUserId: ctx.user.id,
          action: 'billing.two_stage.signature_asset_approved',
          targetType: 'billing_signer_signature_asset',
          targetId: created.id,
          metadata: { sha256: created.sha256, replacedAssetId: active?.id ?? null },
        },
        tx,
      );
      return created;
    });
    return { status: 201, body: { signature: signatureAssetDto(result), replaced: active ? signatureAssetDto(active) : null } };
  } catch (error) {
    // A concurrent approval hit the one-active-per-organization index.
    if (isUniqueViolation(error)) throw apiError(409, 'SIGNATURE_ASSET_EXISTS', 'The signature image changed. Reload and try again.');
    throw error;
  }
}
