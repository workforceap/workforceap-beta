/**
 * Michael's receiving signature on the board-signed voucher (pure rules; the
 * database enforces the same in billing_voucher_receipt_signatures).
 *
 *  - The original uploaded voucher bytes are kept unchanged (append-only
 *    billing_artifacts, content-addressed key); the attestation is bound to
 *    that exact (voucher artifact id, sha256).
 *  - Only the designated signer principal (billing_designated_signers, one per
 *    organization, unset by default) may attest, either that his receiving
 *    signature is present on the original, or by an approved signature
 *    representation (its own artifact id + hash).
 *  - A generic staff flag (voucher_board_signed.receiving_signature_present)
 *    never satisfies it. A replacement voucher is a new artifact, so an older
 *    attestation no longer applies. Until the principal is designated, J6
 *    sign and send stay closed.
 */
export const VOUCHER_RECEIPT_SIGNATURE_METHODS = ['present_on_original', 'approved_signature_representation'] as const;
export type VoucherReceiptSignatureMethod = (typeof VOUCHER_RECEIPT_SIGNATURE_METHODS)[number];

export type VoucherReceiptSignatureCode =
  | 'SIGNER_PRINCIPAL_UNSET'
  | 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED'
  | 'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL'
  | 'VOUCHER_RECEIPT_SIGNATURE_HASH_MISMATCH'
  | 'VOUCHER_RECEIPT_SIGNATURE_METHOD_INVALID';

export type VoucherReceiptSignature = {
  voucherArtifactId: string;
  voucherSha256: string;
  attestedByUserId: string;
  method: VoucherReceiptSignatureMethod;
  representation: { artifactId: string; sha256: string } | null;
  attestedAt: string;
};

export type VoucherReceiptSignatureStatus = { ok: true } | { ok: false; code: VoucherReceiptSignatureCode; error: string };

const HEX64 = /^[0-9a-f]{64}$/;

/** Whether the current voucher (exact artifact + hash) carries a valid receipt-signature attestation. */
export function voucherReceiptSignatureStatus(input: {
  voucher: { artifactId: string; sha256: string };
  designatedSignerUserId: string | null | undefined;
  attestations: readonly VoucherReceiptSignature[];
}): VoucherReceiptSignatureStatus {
  const principal = input.designatedSignerUserId?.trim();
  if (!principal) return { ok: false, code: 'SIGNER_PRINCIPAL_UNSET', error: 'No signer principal is designated yet; J6 signing and sending stay closed.' };
  const forVoucher = input.attestations.filter((a) => a.voucherArtifactId === input.voucher.artifactId);
  if (forVoucher.length === 0) {
    return { ok: false, code: 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED', error: 'The designated signer has not attested his receiving signature on this voucher.' };
  }
  const byPrincipal = forVoucher.filter((a) => a.attestedByUserId === principal);
  if (byPrincipal.length === 0) {
    return { ok: false, code: 'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL', error: 'Only the designated signer can attest the receiving signature.' };
  }
  const exact = byPrincipal.filter((a) => HEX64.test(a.voucherSha256) && a.voucherSha256 === input.voucher.sha256);
  if (exact.length === 0) {
    return { ok: false, code: 'VOUCHER_RECEIPT_SIGNATURE_HASH_MISMATCH', error: 'The attestation is for other voucher bytes.' };
  }
  const valid = exact.some((a) =>
    a.method === 'present_on_original'
      ? a.representation === null
      : a.method === 'approved_signature_representation' && !!a.representation && HEX64.test(a.representation.sha256) && !!a.representation.artifactId,
  );
  return valid ? { ok: true } : { ok: false, code: 'VOUCHER_RECEIPT_SIGNATURE_METHOD_INVALID', error: 'The receipt-signature method is not valid.' };
}
