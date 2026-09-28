/**
 * The apply-funnel partner disclosure is resolved on the server with the same
 * organization + active-partner lookup signup uses; the partner name never
 * comes from the client, and unknown / inactive refs disclose nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  partnerFindFirst: vi.fn(),
  resolveOrg: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { partner: { findFirst: h.partnerFindFirst } } }));
vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({ resolveProvisionOrganizationId: h.resolveOrg }));
vi.mock('@/lib/rate-limit', () => ({ checkPublicPartnerDisclosureRateLimit: h.rateLimit }));

import { resolvePartnerReferralDisclosure } from '@/lib/apply/partnerReferralDisclosure';
import { activeReferralPartnerWhere } from '@/lib/partner/referralPartnerLookup';
import { GET } from '@/app/api/apply/partner-disclosure/route';

beforeEach(() => {
  vi.clearAllMocks();
  h.resolveOrg.mockResolvedValue('org-1');
  h.rateLimit.mockResolvedValue({ success: true });
  h.partnerFindFirst.mockResolvedValue({ name: 'Acme Workforce Center', partnerType: 'referral' });
});

describe('resolvePartnerReferralDisclosure', () => {
  it('uses the signup lookup (active partner, same organization) and the stored partner name', async () => {
    const headers = new Headers({ host: 'www.workforceap.org' });
    const disclosure = await resolvePartnerReferralDisclosure(' ACME ', { headers, programSlug: 'it-support' });
    expect(h.resolveOrg).toHaveBeenCalledWith({ headers, programSlug: 'it-support' });
    expect(h.partnerFindFirst).toHaveBeenCalledWith({
      where: activeReferralPartnerWhere('acme', 'org-1'),
      select: { name: true, partnerType: true },
    });
    expect(activeReferralPartnerWhere('acme', 'org-1')).toEqual({
      active: true,
      organizationId: 'org-1',
      OR: [{ referralCode: 'acme' }, { slug: 'acme' }],
    });
    expect(disclosure).toEqual({ ref: 'acme', partnerName: 'Acme Workforce Center', tier: 'restricted' });
  });

  it('full tier for a community partner', async () => {
    h.partnerFindFirst.mockResolvedValue({ name: 'Community Org', partnerType: 'community' });
    expect(await resolvePartnerReferralDisclosure('community')).toMatchObject({ tier: 'full', partnerName: 'Community Org' });
  });

  it('discloses nothing for an unknown or inactive ref (the lookup finds no active partner)', async () => {
    h.partnerFindFirst.mockResolvedValue(null);
    expect(await resolvePartnerReferralDisclosure('inactive-partner')).toBeNull();
  });

  it('never queries for a missing or malformed ref', async () => {
    expect(await resolvePartnerReferralDisclosure(null)).toBeNull();
    expect(await resolvePartnerReferralDisclosure('<script>')).toBeNull();
    expect(h.partnerFindFirst).not.toHaveBeenCalled();
  });

  it('fails closed (no disclosure) when the lookup errors', async () => {
    h.partnerFindFirst.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolvePartnerReferralDisclosure('acme')).toBeNull();
  });
});

describe('GET /api/apply/partner-disclosure', () => {
  const call = (query: string) => GET(new NextRequest(`http://localhost/api/apply/partner-disclosure?${query}`));

  it('returns only the resolved name and tier, uncached', async () => {
    const res = await call('ref=acme&program=it-support');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ disclosure: { ref: 'acme', partnerName: 'Acme Workforce Center', tier: 'restricted' } });
    expect(h.resolveOrg).toHaveBeenCalledWith(expect.objectContaining({ programSlug: 'it-support' }));
  });

  it('ignores any client-supplied name', async () => {
    const res = await call('ref=acme&name=Evil%20Corp&partnerName=Evil');
    expect(JSON.stringify(await res.json())).not.toContain('Evil');
  });

  it('returns null for an unknown ref and 429 when rate limited', async () => {
    h.partnerFindFirst.mockResolvedValue(null);
    expect(await (await call('ref=unknown')).json()).toEqual({ disclosure: null });
    h.rateLimit.mockResolvedValue({ success: false });
    expect((await call('ref=acme')).status).toBe(429);
  });
});
