/**
 * Resolve the organization to stamp on apply signup and orphan provision.
 *
 * `getDefaultOrganizationId()` is the last resort only. Custom-domain
 * hosts, trusted `x-wap-org-id` (with `x-wap-host`), server-controlled Auth
 * app metadata, and a unique program-catalog row win first so a second tenant is not
 * silently written into `workforceap` (`clm_secrets_apply_always_default_org`,
 * `clm_secrets_orphan_user_default_org`).
 *
 * Canonical / localhost / preview hosts still fall through to the
 * default `workforceap` org when no other signal is present.
 */

import { prisma } from '@/lib/db/prisma';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';
import {
  tryResolveOrgFromRequest,
  type HeadersLike,
  type ResolveOptions,
} from '@/lib/tenant/resolveOrgFromRequest';

export type ResolveProvisionOptions = {
  headers?: HeadersLike;
  /** Trusted caller-supplied org (already resolved). */
  explicitOrganizationId?: string | null;
  /** Supabase `app_metadata` — never user-editable `user_metadata`. */
  appMetadata?: Record<string, unknown> | null;
  programSlug?: string | null;
  tryResolveOrg?: typeof tryResolveOrgFromRequest;
  lookupProgramOrg?: (programSlug: string) => Promise<string | null>;
  defaultOrgId?: () => Promise<string>;
  resolveOrgOptions?: Omit<ResolveOptions, 'defaultOrgId'>;
};

const TRUSTED_METADATA_ORG_KEYS = ['organization_id', 'organizationId', 'org_id'] as const;

export function extractTrustedAppMetadataOrgId(
  appMetadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!appMetadata || typeof appMetadata !== 'object') return null;
  for (const key of TRUSTED_METADATA_ORG_KEYS) {
    const raw = appMetadata[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

const defaultProgramLookup = async (programSlug: string): Promise<string | null> => {
  try {
    const rows = await prisma.organizationProgramCatalog.findMany({
      where: { programSlug, status: 'active' },
      select: { organizationId: true },
      take: 2,
    });
    if (rows.length === 1) return rows[0].organizationId;
    return null;
  } catch {
    return null;
  }
};

/**
 * Order:
 *  1. explicitOrganizationId
 *  2. request host / x-wap-org-id (custom domain only)
 *  3. server-controlled Auth app metadata claim
 *  4. unique active program-catalog org for `programSlug`
 *  5. default org (`workforceap`)
 */
export async function resolveProvisionOrganizationId(
  input: ResolveProvisionOptions = {},
): Promise<string> {
  const explicit = input.explicitOrganizationId?.trim();
  if (explicit) return explicit;

  const tryResolve = input.tryResolveOrg ?? tryResolveOrgFromRequest;
  if (input.headers) {
    const fromRequest = await tryResolve(input.headers, input.resolveOrgOptions);
    if (fromRequest) return fromRequest;
  }

  const fromMeta = extractTrustedAppMetadataOrgId(input.appMetadata);
  if (fromMeta) return fromMeta;

  if (input.programSlug) {
    const lookup = input.lookupProgramOrg ?? defaultProgramLookup;
    const fromProgram = await lookup(input.programSlug);
    if (fromProgram) return fromProgram;
  }

  const fallback = input.defaultOrgId ?? getDefaultOrganizationId;
  return fallback();
}
