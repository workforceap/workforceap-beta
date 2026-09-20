import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Org branding is served from a per-isolate process cache in front of Next's
 * tagged data cache so custom-domain HTML never Prisma-reads primaryColor /
 * logo on every request. The `getRequestOrgBranding` cases below were
 * formerly asserted by reading lib/platform/defaultOrgTheme.ts as text.
 */
const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(
    (fn: (...args: unknown[]) => Promise<unknown>, keys: string[], opts: unknown) => {
      mocks.dataCacheRegistrations.push({ keys, opts });
      return (...args: unknown[]) => fn(...args);
    },
  ),
  dataCacheRegistrations: [] as Array<{ keys: string[]; opts: unknown }>,
  findUnique: vi.fn(),
  defaultOrgId: vi.fn(),
  skipBuild: vi.fn(() => false),
}));

vi.mock('next/cache', () => ({ unstable_cache: mocks.unstableCache }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { organization: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/db/optionalBuildDb', () => ({ shouldSkipOptionalDbQueriesAtBuild: mocks.skipBuild }));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: mocks.defaultOrgId }));
vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (_bucket: string, value: string | null) => value,
}));

import {
  ORG_BRANDING_CACHE_TTL_MS,
  ORG_BRANDING_CACHE_TTL_SECONDS,
  cachedOrgBranding,
  clearOrgBrandingCache,
  getCachedOrgBranding,
} from './orgBrandingCache';
import { getRequestOrgBranding } from './defaultOrgTheme';

describe('cachedOrgBranding', () => {
  beforeEach(() => clearOrgBrandingCache());

  it('hits the process cache within the TTL (mock clock)', async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return { primaryColor: '#c41e3a', logo: 'logo.png' };
    };

    const first = await cachedOrgBranding('org-custom', load, 1_000);
    const second = await cachedOrgBranding('org-custom', load, 1_000 + 30_000);
    expect(first).toEqual({ primaryColor: '#c41e3a', logo: 'logo.png' });
    expect(second).toEqual(first);
    expect(loads).toBe(1);
    expect(getCachedOrgBranding('org-custom', 1_000 + 30_000)).toEqual(first);
  });

  it('misses after the TTL and reloads', async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return { primaryColor: loads === 1 ? '#111111' : '#222222', logo: null };
    };

    const t0 = 10_000;
    const first = await cachedOrgBranding('org-ttl', load, t0);
    expect(first.primaryColor).toBe('#111111');
    expect(getCachedOrgBranding('org-ttl', t0 + ORG_BRANDING_CACHE_TTL_MS)).toBeNull();
    const expired = await cachedOrgBranding('org-ttl', load, t0 + ORG_BRANDING_CACHE_TTL_MS);
    expect(expired.primaryColor).toBe('#222222');
    expect(loads).toBe(2);
  });

  it('isolates orgs', async () => {
    const a = await cachedOrgBranding('org-a', async () => ({ primaryColor: '#aaaaaa', logo: null }), 0);
    const b = await cachedOrgBranding('org-b', async () => ({ primaryColor: '#bbbbbb', logo: null }), 0);
    expect(a.primaryColor).toBe('#aaaaaa');
    expect(b.primaryColor).toBe('#bbbbbb');
  });
});

describe('getRequestOrgBranding', () => {
  const customHeaders = new Headers({ 'x-wap-org-id': 'org-custom' });

  beforeEach(() => {
    clearOrgBrandingCache();
    mocks.findUnique.mockReset();
    mocks.defaultOrgId.mockReset();
    mocks.dataCacheRegistrations.length = 0;
    vi.stubEnv('__PRISMA_PLACEHOLDER_DB', '');
    mocks.findUnique.mockResolvedValue({ primaryColor: '#c41e3a', logo: 'org-custom/logo.png' });
    mocks.defaultOrgId.mockResolvedValue('org-default');
  });

  it('serves a custom-domain org from the process cache instead of a raw Prisma read per request', async () => {
    const first = await getRequestOrgBranding(customHeaders, 1_000);
    const second = await getRequestOrgBranding(customHeaders, 1_000 + 30_000);

    expect(first).toEqual({ primaryColor: '#c41e3a', logo: 'org-custom/logo.png' });
    expect(second).toEqual(first);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-custom' },
      select: { primaryColor: true, logo: true },
    });
    expect(mocks.defaultOrgId).not.toHaveBeenCalled();
    // The Prisma read sits behind Next's tagged data cache with the shared TTL.
    expect(mocks.dataCacheRegistrations).toContainEqual({
      keys: ['org-branding', 'org-custom'],
      opts: { revalidate: ORG_BRANDING_CACHE_TTL_SECONDS, tags: ['org-branding:org-custom'] },
    });
  });

  it('re-reads once the process cache TTL has elapsed', async () => {
    await getRequestOrgBranding(customHeaders, 1_000);
    mocks.findUnique.mockResolvedValue({ primaryColor: '#222222', logo: null });

    const refreshed = await getRequestOrgBranding(customHeaders, 1_000 + ORG_BRANDING_CACHE_TTL_MS);

    expect(refreshed).toEqual({ primaryColor: '#222222', logo: null });
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it('returns neutral branding for read-only audits without touching Prisma or the data cache', async () => {
    const custom = await getRequestOrgBranding(customHeaders, 1_000, { readOnlyAudit: true });
    const canonical = await getRequestOrgBranding(new Headers(), 1_000, { readOnlyAudit: true });

    expect(custom).toEqual({ primaryColor: null, logo: null });
    expect(canonical).toEqual({ primaryColor: null, logo: null });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.defaultOrgId).not.toHaveBeenCalled();
    expect(mocks.dataCacheRegistrations.some((entry) => entry.keys[0] === 'org-branding')).toBe(false);
    expect(getCachedOrgBranding('org-custom', 1_000)).toBeNull();
  });

  it('falls back to the default org for canonical hosts without the tenant header', async () => {
    const branding = await getRequestOrgBranding(new Headers(), 1_000);

    expect(mocks.defaultOrgId).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org-default' } }));
    expect(branding).toEqual({ primaryColor: '#c41e3a', logo: 'org-custom/logo.png' });
  });
});
