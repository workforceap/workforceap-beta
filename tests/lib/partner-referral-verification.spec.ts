import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  referrals: [] as unknown[],
  findMany: vi.fn(),
  pendingFindMany: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findMany: h.findMany },
    memberEvent: { findMany: h.pendingFindMany },
  },
}));

import { loadPartnerReferralBundle, toPartnerMembersListRows } from '@/lib/partner/referralBundle';

const date = new Date('2026-09-20T12:00:00Z');
function referral(id: string, verified: boolean) {
  return {
    id: `ref-${id}`,
    referredAt: date,
    member: {
      id,
      fullName: 'Fixture Member',
      enrolledProgram: 'it-support',
      enrolledAt: date,
      updatedAt: date,
      deletedAt: null,
      assessmentCompleted: false,
      courseEnrollments: [],
      placementRecord: {
        employerName: 'SECRET_EMPLOYER', jobTitle: 'SECRET_ROLE', salaryOffered: 98765,
        placedAt: date, startDateVerified: verified, onboardingWindowEnd: null, retentionDecision: null,
      },
      profile: null,
      userCertifications: [],
      applications: [],
      memberProgramProgress: [],
    },
  };
}

beforeEach(() => {
  h.referrals = [referral('pending', false), referral('verified', true)];
  h.findMany.mockImplementation(async () => h.referrals);
  h.pendingFindMany.mockResolvedValue([]);
});

describe('partner referral placement verification', () => {
  it('does not classify or narrate a self-reported placement as verified', async () => {
    const bundle = await loadPartnerReferralBundle('partner-1', 'org-1');
    const rows = toPartnerMembersListRows(bundle.pipelineMembers);
    const pending = rows.find((row) => row.id === 'pending');
    const verified = rows.find((row) => row.id === 'verified');

    expect(pending).toMatchObject({
      stage: 'enrolled',
      stageLabel: 'Enrolled',
      placementVerified: false,
      story: 'Placement reported, pending verification',
    });
    expect(JSON.stringify(pending)).not.toContain('SECRET_EMPLOYER');
    expect(JSON.stringify(pending)).not.toContain('SECRET_ROLE');
    expect(JSON.stringify(pending)).not.toContain('98765');
    expect(verified).toMatchObject({ stage: 'placed', stageLabel: 'Placed', placementVerified: true });
    expect(verified?.story).toContain('SECRET_EMPLOYER');
    const pendingQuery = h.pendingFindMany.mock.calls[0][0];
    expect(pendingQuery.where.userId.in).toEqual(['pending']);
    expect(pendingQuery.distinct).toEqual(['userId']);
    expect(pendingQuery.select).not.toHaveProperty('metadata');
  });
});
