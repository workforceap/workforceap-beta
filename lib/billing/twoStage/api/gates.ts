import 'server-only';

/**
 * Release gates for the two-stage routes. Every gate defaults off and is
 * read from server-only environment variables on every request; a closed
 * gate is checked before any claim row, storage write or provider call.
 */
import { getBillingProviderOrgId } from '../../providerOrg';
import type { BillingStage, GateCode, GateName, GateState } from '../dto';
import { readExecutiveSignerUserId } from '../signing';
import { apiError } from './http';

type Env = Record<string, string | undefined>;

/**
 * The signed (final) renderer exists (rendererAdapter renderSignedFromContent).
 * This is the code-level switch that keeps it off if it must be withdrawn; it
 * authorizes nothing by itself: signing still needs the migration, the
 * designated signer, that signer's approved signature image, his own
 * authenticated act and the archive.
 */
export const SIGNED_RENDERER_AVAILABLE = true;

const on = (env: Env, name: string) => env[name]?.trim() === 'true';

export const GATE_MESSAGES: Readonly<Record<GateCode, string>> = {
  MIGRATION_NOT_APPLIED: 'J5/J6 billing is not available in this environment yet (its database migration is not applied).',
  PROVIDER_ORG_MISCONFIGURED: 'J5/J6 billing is misconfigured (BILLING_PACKET_PROVIDER_ORG_ID). Contact an administrator.',
  FINANCE_ARCHIVE_UNAVAILABLE: 'The billing finance archive is not available. No file was stored, signed or sent.',
  SIGNER_NOT_CONFIGURED: 'Signing is disabled until the executive signer account is configured.',
  SIGNED_RENDERER_UNAVAILABLE: 'Signed J5/J6 PDFs cannot be produced in this environment.',
  SIGNER_PRINCIPAL_UNSET: 'No signer principal is designated yet; the voucher receipt attestation, J5 and J6 signing, and J6 sending stay closed.',
  EMAIL_NOT_ENABLED: 'J5/J6 email delivery is not enabled yet.',
};

function state(enabled: boolean, code: GateCode): GateState {
  return enabled ? { enabled: true, code: null, message: null } : { enabled: false, code, message: GATE_MESSAGES[code] };
}

/**
 * Every gate except the two that need a database or storage read: the
 * finance archive (bucket preflight) and the receipt-signature principal
 * (M1 billing_designated_signers row).
 */
export function envGates(env: Env = process.env): Record<Exclude<GateName, 'financeArchive' | 'receiptSignaturePrincipal'>, GateState> {
  return {
    migration: state(on(env, 'BILLING_TWO_STAGE_MIGRATION_APPLIED'), 'MIGRATION_NOT_APPLIED'),
    providerOrg: state(getBillingProviderOrgId(env) !== null, 'PROVIDER_ORG_MISCONFIGURED'),
    signing: state(readExecutiveSignerUserId(env) !== null, 'SIGNER_NOT_CONFIGURED'),
    signedRenderer: state(SIGNED_RENDERER_AVAILABLE, 'SIGNED_RENDERER_UNAVAILABLE'),
    realEmail: state(on(env, 'BILLING_TWO_STAGE_EMAIL_ENABLED'), 'EMAIL_NOT_ENABLED'),
  };
}

export const FINANCE_ARCHIVE_UNCHECKED_MESSAGE = 'Checked when a file is stored or read; this view does not call Storage.';

/** `financeArchiveReady: null` reports the archive gate as unknown (not checked here). */
export function allGates(args: { financeArchiveReady: boolean | null; designatedSigner: boolean }, env: Env = process.env): Record<GateName, GateState> {
  return {
    ...envGates(env),
    financeArchive:
      args.financeArchiveReady === null ? { enabled: null, code: null, message: FINANCE_ARCHIVE_UNCHECKED_MESSAGE } : state(args.financeArchiveReady, 'FINANCE_ARCHIVE_UNAVAILABLE'),
    receiptSignaturePrincipal: state(args.designatedSigner, 'SIGNER_PRINCIPAL_UNSET'),
  };
}

function throwIfClosed(gate: GateState): void {
  if (!gate.enabled && gate.code) throw apiError(503, gate.code, gate.message ?? GATE_MESSAGES[gate.code]);
}

/** Step 1 of every route. */
export function requireMigrationApplied(env: Env = process.env): void {
  throwIfClosed(envGates(env).migration);
}

export function requireDesignatedSigner(designatedSigner: boolean): void {
  throwIfClosed(state(designatedSigner, 'SIGNER_PRINCIPAL_UNSET'));
}

/** Sign gates in contract order (signer account, signed renderer, designated principal: both stages since M1 55a0562). */
export function requireSignGates(_stage: BillingStage, designatedSigner: boolean, env: Env = process.env): void {
  const g = envGates(env);
  throwIfClosed(g.signing);
  throwIfClosed(g.signedRenderer);
  requireDesignatedSigner(designatedSigner);
}

/** Send gates in contract order (real email, J6: designated principal). */
export function requireSendGates(stage: BillingStage, designatedSigner: boolean, env: Env = process.env): void {
  const g = envGates(env);
  throwIfClosed(g.realEmail);
  if (stage === 'j6') requireDesignatedSigner(designatedSigner);
}
