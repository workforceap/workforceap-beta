import 'server-only';

/**
 * Signing gate for two-stage documents. Only the executive signer, Michael
 * A. Brown, may sign, as his own authenticated action.
 *
 *  - Identity binding: the single source of truth is the database row
 *    `billing_designated_signers` (one per organization, unset by default,
 *    written only by an ops-reviewed change, read-only to the app). The route
 *    reads it and passes `designatedSignerUserId`; the database triggers
 *    enforce the same row at sign/send, so the two can never disagree.
 *    `BILLING_EXECUTIVE_SIGNER_USER_ID` (server env) is only an optional
 *    cross-check: when set it must equal the database row, else deny. Unset,
 *    blank or different from the verified session user means deny. No
 *    default id ships anywhere.
 *  - The caller must also be an active admin of the provider organization.
 *    Being an admin is necessary, never sufficient.
 *  - The printed name/title are server constants, never request input. There
 *    is no drawn-signature or free-text signer field.
 *  - Review then sign: the signer previews a draft, then signs over that
 *    exact version by echoing its content hash and confirming the intent
 *    statement. A stale or different hash is refused.
 *  - Delegation is modeled (billing_signer_delegations) but disabled here and
 *    has no UI; an approved signature image slot exists but is disabled and
 *    has no approved asset, so the signature is a typed attestation block.
 */
import { authorizedSignerLine, AUTHORIZED_SIGNER, type BillingStage } from './constants';
import type { StageStatus } from './stateMachine';

export const SIGNER_ENV = 'BILLING_EXECUTIVE_SIGNER_USER_ID';

/** Delegated signing stays off until Mike separately approves it. */
export const SIGNER_DELEGATION_ENABLED = false;

/** No approved WAP signature image exists yet; the slot stays disabled. */
export const SIGNATURE_IMAGE_ENABLED = false;

/** Reviewed signature assets by SHA-256. Empty until an asset is approved through review. */
export const APPROVED_SIGNATURE_ASSETS: ReadonlyArray<{ sha256: string; approvalReference: string }> = Object.freeze([]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The configured executive signer's user id, or null (signing disabled). */
export function readExecutiveSignerUserId(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[SIGNER_ENV]?.trim();
  return raw && UUID.test(raw) ? raw.toLowerCase() : null;
}

export type SignerActor = {
  /** Verified Supabase Auth user id from the server session (never from the request body). */
  userId: string;
  organizationId: string | null;
  isActive: boolean;
  isAdmin: boolean;
};

export type SignerDelegation = {
  id: string;
  principalSubjectId: string;
  delegateSubjectId: string;
  stage: BillingStage;
  validFrom: Date;
  validUntil: Date;
  revokedAt: Date | null;
};

export type SignerDecision =
  | { ok: true; via: 'executive'; signerSubjectId: string; delegationId: null }
  | { ok: true; via: 'delegation'; signerSubjectId: string; delegationId: string }
  | { ok: false; status: 403 | 503; reason: 'signer_not_configured' | 'not_provider_org' | 'inactive' | 'not_admin' | 'not_signer'; message: string };

export function authorizeSigner(input: {
  actor: SignerActor | null;
  providerOrgId: string | null;
  stage: BillingStage;
  now: Date;
  env?: Record<string, string | undefined>;
  delegation?: SignerDelegation | null;
  delegationEnabled?: boolean;
  /** The provider organization's billing_designated_signers.user_id (null/undefined = unset: deny). */
  designatedSignerUserId?: string | null;
}): SignerDecision {
  const designated = input.designatedSignerUserId?.trim().toLowerCase() || null;
  const envSigner = input.env?.[SIGNER_ENV]?.trim() ? readExecutiveSignerUserId(input.env) ?? 'invalid' : null;
  const notConfigured: SignerDecision = { ok: false, status: 503, reason: 'signer_not_configured', message: 'Signing is disabled until the executive signer account is configured.' };
  if (!designated || !input.providerOrgId) return notConfigured;
  // The env var, when present, is a cross-check only: any disagreement fails closed.
  if (envSigner !== null && envSigner !== designated) return notConfigured;
  const signerUserId = designated;
  const actor = input.actor;
  if (!actor || !actor.organizationId || actor.organizationId.toLowerCase() !== input.providerOrgId.toLowerCase()) {
    return { ok: false, status: 403, reason: 'not_provider_org', message: 'Only the training-provider organization can sign J5/J6 documents.' };
  }
  if (!actor.isActive) return { ok: false, status: 403, reason: 'inactive', message: 'This account is not active.' };
  if (!actor.isAdmin) return { ok: false, status: 403, reason: 'not_admin', message: 'Only an administrator can sign.' };
  const userId = actor.userId.trim().toLowerCase();
  if (userId === signerUserId) return { ok: true, via: 'executive', signerSubjectId: userId, delegationId: null };

  const d = input.delegation;
  if (
    (input.delegationEnabled ?? SIGNER_DELEGATION_ENABLED) &&
    d &&
    d.principalSubjectId.toLowerCase() === signerUserId &&
    d.delegateSubjectId.toLowerCase() === userId &&
    d.stage === input.stage &&
    !d.revokedAt &&
    d.validFrom <= input.now &&
    input.now < d.validUntil
  ) {
    return { ok: true, via: 'delegation', signerSubjectId: userId, delegationId: d.id };
  }
  return { ok: false, status: 403, reason: 'not_signer', message: `Only ${AUTHORIZED_SIGNER.name} can sign this document.` };
}

/** The exact statement the signer confirms. Bound to the document and the version hash. */
export function signerIntentStatement(args: { documentTitle: string; documentNumber: string; contentSha256: string }): string {
  return (
    `I, ${authorizedSignerLine()}, have reviewed ${args.documentTitle} ${args.documentNumber} ` +
    `(version ${args.contentSha256.slice(0, 12)}) and sign it as my own act on behalf of Workforce Advancement Project.`
  );
}

export type SignRequest = { recordId: string; version: number; contentSha256: string; intentConfirmed: boolean; intentText: string };
export type SignTarget = { id: string; version: number; status: StageStatus; contentSha256: string; documentTitle: string; documentNumber: string };

/** The sign request must echo the exact version the signer previewed and confirm the intent statement. */
export function validateSignRequest(target: SignTarget, request: SignRequest): { ok: true; intent: string } | { ok: false; status: 409 | 422; message: string } {
  if (target.status !== 'draft') return { ok: false, status: 409, message: `This document is already ${target.status}.` };
  if (request.recordId !== target.id || request.version !== target.version || request.contentSha256 !== target.contentSha256) {
    return { ok: false, status: 409, message: 'The document changed since you reviewed it. Review the current version and sign again.' };
  }
  const intent = signerIntentStatement(target);
  if (request.intentConfirmed !== true || request.intentText !== intent) {
    return { ok: false, status: 422, message: 'Confirm the signing statement to sign.' };
  }
  return { ok: true, intent };
}

export type SignatureBlock = {
  method: 'typed_attestation';
  name: string;
  title: string;
  signedAt: string;
  attestation: string;
  image: null;
};

/**
 * The block printed on the signed PDF: typed name, title, signed-at and the
 * attestation. No image until an approved asset exists and the slot is enabled.
 */
export function buildSignatureBlock(args: { signedAt: Date; intent: string }): SignatureBlock {
  return {
    method: 'typed_attestation',
    name: AUTHORIZED_SIGNER.name,
    title: AUTHORIZED_SIGNER.title,
    signedAt: args.signedAt.toISOString(),
    attestation: `Electronically signed by ${AUTHORIZED_SIGNER.name} (typed signature). ${args.intent}`,
    image: null,
  };
}

/** Whether an image may be placed in the signature slot. False until review enables it. */
export function isApprovedSignatureAsset(sha256: string, enabled: boolean = SIGNATURE_IMAGE_ENABLED): boolean {
  return enabled && APPROVED_SIGNATURE_ASSETS.some((a) => a.sha256 === sha256);
}
