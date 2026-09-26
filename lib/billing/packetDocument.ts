import type { TrainingBillingPacket } from '@prisma/client';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import type { PacketDocumentInput } from './packetPdf';
import { getTrainingProviderIdentity } from './providerIdentity';
import { parseLineItems } from './packetSchema';
import { parseSignedSnapshot } from './packetSnapshot';

export function resolveProgramTitle(programSlug: string, catalogName?: string | null): string {
  return getProgramBySlug(programSlug)?.title ?? catalogName ?? programDisplayTitle(programSlug);
}

/**
 * Turn a stored packet row into the renderer input (shared by the PDF route
 * and the emails). Identity comes from the snapshot frozen at signing; only
 * rows signed before snapshots existed fall back to the live values.
 */
export function packetToDocumentInput(
  packet: TrainingBillingPacket,
  member: { fullName: string; email: string },
  logoPng: Uint8Array | null,
): PacketDocumentInput {
  const snapshot = parseSignedSnapshot(packet.signedSnapshot);
  return {
    packetNumber: packet.packetNumber,
    invoiceDate: packet.invoiceDate,
    dueDate: packet.dueDate,
    billToName: packet.billToName,
    billToAttention: packet.billToAttention,
    billToAddress: packet.billToAddress,
    billToEmail: packet.billToEmail,
    referenceNumber: packet.referenceNumber,
    lineItems: parseLineItems(packet.lineItems),
    totalAmount: packet.totalAmount,
    coverLetterBody: packet.coverLetterBody,
    signerName: packet.signerName,
    signerTitle: packet.signerTitle,
    signatureImage: packet.signatureImage,
    signedAt: packet.signedAt,
    member: snapshot ? snapshot.member : member,
    programTitle: snapshot ? snapshot.programTitle : resolveProgramTitle(packet.programSlug),
    provider: snapshot ? snapshot.provider : getTrainingProviderIdentity(),
    counselorAssigned: snapshot ? snapshot.counselorAssigned : undefined,
    logoPng,
  };
}
