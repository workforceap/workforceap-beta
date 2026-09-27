import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';

/**
 * J5/J6 packets carry one training provider's legal identity and default
 * payer (lib/billing/providerIdentity.ts), which are deployment-wide, not
 * per-tenant. Issuance is therefore limited to one provider organization: the
 * default WorkforceAP org (DEFAULT_ORG_ID) unless
 * BILLING_PACKET_PROVIDER_ORG_ID overrides it. This does not make billing safe
 * for other tenants; it keeps them out. Org ids passed in must be resolved
 * server-side from the session / stored rows, never from client input.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BillingProviderOrgCheck =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string };

export const BILLING_PROVIDER_ORG_ONLY_ERROR =
  'J5/J6 billing packets are only available to the training-provider organization.';

/** The provider org id, or null when the override is set but not a UUID (misconfigured). */
export function getBillingProviderOrgId(): string | null {
  const override = process.env.BILLING_PACKET_PROVIDER_ORG_ID?.trim();
  if (!override) return DEFAULT_ORG_ID;
  if (UUID.test(override)) return override.toLowerCase();
  console.error('[billing] BILLING_PACKET_PROVIDER_ORG_ID is set but is not a UUID; J5/J6 billing is disabled until it is fixed.');
  return null;
}

/** Every given org id must be the provider org. Fails closed on misconfiguration. */
export function checkBillingProviderOrg(...orgIds: Array<string | null | undefined>): BillingProviderOrgCheck {
  const provider = getBillingProviderOrgId();
  if (!provider) return { ok: false, status: 503, error: 'J5/J6 billing is misconfigured (BILLING_PACKET_PROVIDER_ORG_ID). Contact an administrator.' };
  const ok = orgIds.length > 0 && orgIds.every((id) => typeof id === 'string' && id.toLowerCase() === provider);
  return ok ? { ok: true } : { ok: false, status: 403, error: BILLING_PROVIDER_ORG_ONLY_ERROR };
}
