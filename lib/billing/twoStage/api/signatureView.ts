import 'server-only';

/**
 * Pure views of the designated signer's signature image (no I/O, no
 * imports of the route modules, so the summary can use them without an import
 * cycle): the DTOs, the two blocker messages and the sign-time gate error.
 */
import type { BillingSignerSignatureAsset } from '@prisma/client';
import type { SignatureAssetDto, SignatureStatusDto } from '../dto';
import { signatureApprovalStatement, type SignatureAssetGate } from '../signatureAsset';
import { activeSignatureRow, type CaseSnapshot } from './caseData';
import { GATE_MESSAGES } from './gates';
import { ApiError, apiError } from './http';

export const SIGNATURE_MISSING_MESSAGE = 'Michael A. Brown must upload his signature image, signed in as himself, before any J5 or J6 can be signed.';
export const SIGNATURE_MISMATCH_MESSAGE = 'The signature image changed since this draft was saved. Save the draft again and review the new preview.';

export function signatureAssetDto(row: BillingSignerSignatureAsset): SignatureAssetDto {
  return {
    id: row.id,
    sha256: row.sha256,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    byteLength: row.byteLength,
    uploadedAt: row.uploadedAt.toISOString(),
    approvedAt: row.approvedAt.toISOString(),
  };
}

/** The organization's signature image status for any admin (metadata only; the image is never served). */
export function signatureStatus(snapshot: Pick<CaseSnapshot, 'signatureAssets' | 'designatedSignerUserId'>, viewerIsDesignatedSigner: boolean): SignatureStatusDto {
  const active = activeSignatureRow(snapshot);
  return { active: active ? signatureAssetDto(active) : null, approvalStatement: signatureApprovalStatement(), viewerCanUpload: viewerIsDesignatedSigner };
}

/** A failed sign-time image check as the route error (same rule the database enforces). */
export function signatureGateError(gate: Exclude<SignatureAssetGate, { ok: true }>): ApiError {
  switch (gate.code) {
    case 'SIGNER_PRINCIPAL_UNSET':
      return apiError(503, 'SIGNER_PRINCIPAL_UNSET', GATE_MESSAGES.SIGNER_PRINCIPAL_UNSET);
    case 'SIGNATURE_ASSET_MISSING':
      return apiError(409, 'SIGNATURE_ASSET_MISSING', SIGNATURE_MISSING_MESSAGE, {
        blockers: [{ code: 'SIGNATURE_ASSET_MISSING', message: SIGNATURE_MISSING_MESSAGE, hardHold: false }],
      });
    case 'SIGNATURE_ASSET_MISMATCH':
      return apiError(409, 'SIGNATURE_ASSET_MISMATCH', SIGNATURE_MISMATCH_MESSAGE, {
        blockers: [{ code: 'SIGNATURE_ASSET_MISMATCH', message: SIGNATURE_MISMATCH_MESSAGE, hardHold: false }],
      });
    case 'SIGNATURE_ASSET_WRONG_PRINCIPAL':
      return apiError(403, 'SIGNATURE_ASSET_WRONG_PRINCIPAL', gate.error);
  }
}
