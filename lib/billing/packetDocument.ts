import type { TrainingBillingPacket } from '@prisma/client';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { loadLetterheadLogo, type PacketDocumentInput } from './packetPdf';
import { getTrainingProviderIdentity } from './providerIdentity';
import { parseLineItems } from './packetSchema';
import { parseSignedSnapshot, snapshotLogoBytes } from './packetSnapshot';
import { buildJ6Facts } from './packetText';

export function resolveProgramTitle(programSlug: string, catalogName?: string | null): string {
  return getProgramBySlug(programSlug)?.title ?? catalogName ?? programDisplayTitle(programSlug);
}

/**
 * Turn a stored packet row into the renderer input (shared by the PDF route
 * and the emails). A packet with a signed snapshot renders only from the row
 * and that snapshot; a corrupt snapshot throws SignedSnapshotCorruptError
 * before anything live is read. Only LEGACY packets (null snapshot, signed
 * before snapshots existed) fall back to the live member, provider, program
 * title and logo file.
 */
export async function packetToDocumentInput(
  packet: TrainingBillingPacket,
  liveMember: { fullName: string; email: string },
  loadLiveLogo: () => Promise<Uint8Array | null> = loadLetterheadLogo,
): Promise<PacketDocumentInput> {
  const snapshot = parseSignedSnapshot(packet.signedSnapshot);
  const lineItems = parseLineItems(packet.lineItems);
  const common = {
    packetNumber: packet.packetNumber,
    invoiceDate: packet.invoiceDate,
    dueDate: packet.dueDate,
    billToName: packet.billToName,
    billToAttention: packet.billToAttention,
    billToAddress: packet.billToAddress,
    billToEmail: packet.billToEmail,
    referenceNumber: packet.referenceNumber,
    lineItems,
    totalAmount: packet.totalAmount,
    coverLetterBody: packet.coverLetterBody,
    signerName: packet.signerName,
    signerTitle: packet.signerTitle,
    signatureImage: packet.signatureImage,
    signedAt: packet.signedAt,
  };
  if (snapshot) {
    return {
      ...common,
      coverLetterBody: snapshot.j6.narrative,
      j6Facts: snapshot.j6.facts,
      member: snapshot.member,
      programTitle: snapshot.programTitle,
      provider: snapshot.provider,
      counselorAssigned: snapshot.counselor !== null,
      logoPng: snapshotLogoBytes(snapshot),
    };
  }
  // LEGACY: no snapshot. Live values; the letter body is used as-is.
  return {
    ...common,
    j6Facts: buildJ6Facts({ ...common, funding: null }),
    member: liveMember,
    programTitle: resolveProgramTitle(packet.programSlug),
    provider: getTrainingProviderIdentity(),
    logoPng: await loadLiveLogo(),
  };
}
