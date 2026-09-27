/**
 * The exact files each copy carries, in a fixed order (the database trigger
 * billing_stage_send_attachments_guard checks the same order):
 *   J5: the signed J5 PDF.
 *   J6: the signed J6 cover letter, the board-signed voucher exactly as
 *       uploaded, then the optional board invoice.
 * Every file's bytes must hash to its archived sha256, or nothing is sent.
 */
import type { BillingStage } from './constants';
import { verifyArchivedBytes, type ArtifactKind } from './financeStorage';

export type ArchivedFile = { kind: ArtifactKind; fileName: string; sha256: string; byteLength: number; bytes: Uint8Array };
export type Attachment = { filename: string; content: Uint8Array; sha256: string };

export function stageAttachments(
  stage: BillingStage,
  files: { signed: ArchivedFile; voucher?: ArchivedFile | null; boardInvoice?: ArchivedFile | null },
): { ok: true; attachments: Attachment[]; sha256s: string[] } | { ok: false; error: string } {
  const expectedSigned: ArtifactKind = stage === 'j5' ? 'j5_signed_pdf' : 'j6_signed_pdf';
  if (files.signed.kind !== expectedSigned) return { ok: false, error: `The ${stage.toUpperCase()} copy must attach its own signed PDF.` };
  const ordered: ArchivedFile[] = [files.signed];
  if (stage === 'j5') {
    if (files.voucher || files.boardInvoice) return { ok: false, error: 'A J5 carries only the signed quote/voucher request.' };
  } else {
    if (!files.voucher || files.voucher.kind !== 'board_signed_voucher') return { ok: false, error: 'A J6 must attach the received signed voucher.' };
    ordered.push(files.voucher);
    if (files.boardInvoice) {
      if (files.boardInvoice.kind !== 'board_invoice') return { ok: false, error: 'The optional attachment must be the board invoice.' };
      ordered.push(files.boardInvoice);
    }
  }
  for (const file of ordered) {
    if (!verifyArchivedBytes(file.bytes, file)) return { ok: false, error: `${file.fileName} does not match its archived copy; nothing was sent.` };
  }
  return {
    ok: true,
    attachments: ordered.map((f) => ({ filename: f.fileName, content: f.bytes, sha256: f.sha256 })),
    sha256s: ordered.map((f) => f.sha256),
  };
}
