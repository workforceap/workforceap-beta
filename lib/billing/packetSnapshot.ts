import type { TrainingProviderIdentity } from './providerIdentity';
import type { ProgramPricing } from './packetDefaults';
import type { FundingApproval } from './packetSchema';

/**
 * Identity and pricing facts frozen when a packet is signed. The PDFs and
 * emails render from this, so a later edit to the member, the program catalog
 * or the BILLING_* provider settings cannot change a signed document.
 */
export type SignedPacketSnapshot = {
  version: 1;
  provider: TrainingProviderIdentity;
  member: { fullName: string; email: string };
  programTitle: string;
  /** Whether a counselor was assigned at signing; drives the J6 cc line. */
  counselorAssigned: boolean;
  pricing: {
    /** Where the prefilled tuition came from (the $7,500 fallback is `price_list_default`). */
    source: ProgramPricing['source'];
    /** Tuition + catalog fees the form was prefilled with. */
    defaultTotal: number;
  };
  /** What the signer recorded as reviewed before signing. */
  fundingApproval: FundingApproval;
};

export function buildSignedSnapshot(args: Omit<SignedPacketSnapshot, 'version'>): SignedPacketSnapshot {
  return { version: 1, ...args };
}

function str(v: unknown): v is string {
  return typeof v === 'string';
}

/** Read the JSON column back; null for legacy rows or anything malformed. */
export function parseSignedSnapshot(value: unknown): SignedPacketSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const provider = v.provider as Record<string, unknown> | undefined;
  const member = v.member as Record<string, unknown> | undefined;
  if (v.version !== 1 || !provider || !member || !str(v.programTitle) || typeof v.counselorAssigned !== 'boolean') return null;
  const providerKeys = ['legalName', 'shortName', 'phone', 'email', 'website', 'ein', 'entityLine'] as const;
  if (!providerKeys.every((k) => str(provider[k])) || !Array.isArray(provider.addressLines) || !provider.addressLines.every(str)) return null;
  if (!str(member.fullName) || !str(member.email)) return null;
  return value as SignedPacketSnapshot;
}
