import { createHash } from 'node:crypto';
import type { TrainingProviderIdentity } from './providerIdentity';
import type { ProgramPricing } from './packetDefaults';
import type { FundingBasis } from './packetText';

/** Upper bound for the letterhead logo frozen into a snapshot. */
export const MAX_SNAPSHOT_LOGO_BYTES = 256 * 1024;

/**
 * Everything a signed J5/J6 renders from, frozen when the packet is signed.
 * The PDFs and the email recipients come only from this and the packet row,
 * so later edits to the member, counselor assignment, program catalog, logo
 * file or BILLING_* settings cannot change a signed document. Not frozen
 * here: the email template, branding and from address (frozen per send
 * attempt instead, see sendAttempts.ts) and the unsubscribe header (live).
 */
export type SignedPacketSnapshot = {
  version: 1;
  provider: TrainingProviderIdentity;
  member: { fullName: string; email: string };
  programSlug: string;
  programTitle: string;
  /** Counselor assigned at signing: the J6 cc line and the send recipient. */
  counselor: { userId: string; fullName: string; email: string } | null;
  /** Letterhead logo bytes and their SHA-256; null when none was available. */
  logo: { pngBase64: string; sha256: string } | null;
  pricing: {
    /** Where the form's default rows came from (`price_list_default` = no price on file). */
    source: ProgramPricing['source'];
    /** Price-list maximum shown as a reference when no price was on file. */
    priceListMaximum: number | null;
  };
  /** Staff-recorded attestation plus reference; not proof of Board or contract approval. */
  fundingAttestation: {
    fundingBasis: FundingBasis;
    approvedAmount: number;
    reference: string;
    reviewed: true;
    tuitionMatches: true;
    /** Staff-noted exception, unverified. */
    staffNotedExceptionUnverified: string | null;
    /** Fingerprint of the values staff reviewed (see attestationFingerprint). */
    reviewedFingerprint: string;
  };
  j6: {
    /** Generated facts block (not editable). */
    facts: string[];
    /** Staff-edited narrative printed around the facts block. */
    narrative: string;
    factsReviewed: true;
  };
  /** Non-blocking review warnings shown to the signer. */
  warnings: string[];
};

export class SignedSnapshotCorruptError extends Error {
  constructor(detail: string) {
    super(`The signed snapshot for this packet is unreadable (${detail}); it cannot be rendered or sent.`);
    this.name = 'SignedSnapshotCorruptError';
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Freeze the logo bytes, or null when missing or over the size bound. */
export function freezeLogo(logo: Uint8Array | null): SignedPacketSnapshot['logo'] {
  if (!logo || logo.byteLength === 0 || logo.byteLength > MAX_SNAPSHOT_LOGO_BYTES) return null;
  return { pngBase64: Buffer.from(logo).toString('base64'), sha256: sha256Hex(logo) };
}

export function snapshotLogoBytes(snapshot: SignedPacketSnapshot): Uint8Array | null {
  return snapshot.logo ? new Uint8Array(Buffer.from(snapshot.logo.pngBase64, 'base64')) : null;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/**
 * Read the JSON column back.
 *  - null / undefined: a legacy packet signed before snapshots existed. Only
 *    then may callers fall back to live values.
 *  - anything else must be a complete, valid snapshot whose logo matches its
 *    hash; otherwise this throws SignedSnapshotCorruptError and nothing is
 *    rendered or sent from live data.
 */
export function parseSignedSnapshot(value: unknown): SignedPacketSnapshot | null {
  if (value === null || value === undefined) return null;
  const fail = (detail: string): never => {
    throw new SignedSnapshotCorruptError(detail);
  };
  if (!isObj(value) || value.version !== 1) fail('unknown version');
  const v = value as Record<string, unknown>;
  const provider = v.provider;
  if (!isObj(provider)) return fail('provider');
  for (const key of ['legalName', 'shortName', 'phone', 'email', 'website', 'ein', 'entityLine'] as const) {
    if (!isStr(provider[key])) fail(`provider.${key}`);
  }
  if (!isStrArray(provider.addressLines)) fail('provider.addressLines');
  if (!isObj(v.member) || !isStr(v.member.fullName) || !isStr(v.member.email)) fail('member');
  if (!isStr(v.programSlug) || !isStr(v.programTitle)) fail('program');
  if (v.counselor !== null && (!isObj(v.counselor) || !isStr(v.counselor.userId) || !isStr(v.counselor.fullName) || !isStr(v.counselor.email))) {
    fail('counselor');
  }
  if (v.logo !== null) {
    if (!isObj(v.logo) || !isStr(v.logo.pngBase64) || !isStr(v.logo.sha256)) fail('logo');
    const logo = v.logo as { pngBase64: string; sha256: string };
    if (sha256Hex(Buffer.from(logo.pngBase64, 'base64')) !== logo.sha256) fail('logo hash mismatch');
  }
  if (!isObj(v.pricing) || !isStr(v.pricing.source) || !(v.pricing.priceListMaximum === null || isNum(v.pricing.priceListMaximum))) fail('pricing');
  const f = v.fundingAttestation;
  if (
    !isObj(f)
    || (f.fundingBasis !== 'wioa_ita' && f.fundingBasis !== 'separate_contract')
    || !isNum(f.approvedAmount)
    || !isStr(f.reference)
    || f.reviewed !== true
    || f.tuitionMatches !== true
    || !(f.staffNotedExceptionUnverified === null || isStr(f.staffNotedExceptionUnverified))
    || !isStr(f.reviewedFingerprint)
  ) {
    fail('fundingAttestation');
  }
  if (!isObj(v.j6) || !isStrArray(v.j6.facts) || !isStr(v.j6.narrative) || v.j6.factsReviewed !== true) fail('j6');
  if (!isStrArray(v.warnings)) fail('warnings');
  return value as SignedPacketSnapshot;
}
