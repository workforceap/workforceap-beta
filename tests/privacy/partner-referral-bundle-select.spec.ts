/**
 * WAP-171 — the partner referral bundle never reads ethnicity or veteran
 * status from the profile, so no partner surface can render them.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findManyArgs: [] as any[] }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findMany: async (args: unknown) => { h.findManyArgs.push(args); return []; } },
    memberEvent: { findMany: async () => [] },
  },
}));

import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';

describe('partner referral bundle profile select (WAP-171)', () => {
  it('selects only location, employment and education from the profile', async () => {
    const bundle = await loadPartnerReferralBundle('partner-1', 'org-1');
    expect(bundle.pipelineMembers).toEqual([]);
    expect(h.findManyArgs).toHaveLength(1);
    const profileSelect = h.findManyArgs[0].include.member.select.profile.select;
    expect(profileSelect).toEqual({ city: true, state: true, zip: true, employmentStatus: true, educationLevel: true });
    expect(JSON.stringify(h.findManyArgs[0])).not.toMatch(/ethnicity|veteranStatus/);
  });
});
