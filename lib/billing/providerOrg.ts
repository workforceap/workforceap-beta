import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';

/**
 * J5/J6 documents carry one training provider's identity (the WAP letterhead
 * and executive signer), which is deployment-wide, not per tenant. Issuance is
 * therefore limited to one provider organization: the default WorkforceAP org
 * (DEFAULT_ORG_ID) unless BILLING_PACKET_PROVIDER_ORG_ID overrides it. This
 * keeps other tenants out; it does not make billing multi-tenant. Org ids
 * passed in must come from the server session or stored rows, never from
 * client input. Ported from draft #2687 (lib/billing/providerOrg.ts).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BillingProviderOrgCheck = { ok: true } | { ok: false; status: 403 | 503; error: string };

export const BILLING_PROVIDER_ORG_ONLY_ERROR = 'J5/J6 billing is only available to the training-provider organization.';

/** The provider org id, or null when the override is set but is not a UUID (misconfigured, fail closed). */
export function getBillingProviderOrgId(env: Record<string, string | undefined> = process.env): string | null {
  const override = env.BILLING_PACKET_PROVIDER_ORG_ID?.trim();
  if (!override) return DEFAULT_ORG_ID;
  return UUID.test(override) ? override.toLowerCase() : null;
}

/** Every given org id must be the provider org. Fails closed on misconfiguration or no ids. */
export function checkBillingProviderOrg(
  orgIds: ReadonlyArray<string | null | undefined>,
  env: Record<string, string | undefined> = process.env,
): BillingProviderOrgCheck {
  const provider = getBillingProviderOrgId(env);
  if (!provider) return { ok: false, status: 503, error: 'J5/J6 billing is misconfigured (BILLING_PACKET_PROVIDER_ORG_ID). Contact an administrator.' };
  const ok = orgIds.length > 0 && orgIds.every((id) => typeof id === 'string' && id.toLowerCase() === provider);
  return ok ? { ok: true } : { ok: false, status: 403, error: BILLING_PROVIDER_ORG_ONLY_ERROR };
}
