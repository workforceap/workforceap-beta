/**
 * Partner data tiers (lib/partner/dataAccess.ts) enforced in the data
 * loaders: the real referral bundle and the real CSV export route, with only
 * Prisma mocked. A referral-track (payout) partner never loads or exports
 * contact, location, employment, education or job details; a community
 * partner's view is unchanged; minors are hidden from non-school partners.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  partnerType: 'community' as string | null,
  partnerFindFirst: vi.fn(),
  referralFindMany: vi.fn(),
  userFindMany: vi.fn(),
  referrals: [] as unknown[],
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'partner-user-1' }) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: async () => ({
    partnerId: 'partner-1',
    partner: { organizationId: 'org-1', name: 'Fixture Partner', slug: 'fixture', logoUrl: null, partnerType: h.partnerType },
  }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {} }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findFirst: h.partnerFindFirst },
    partnerReferral: { findMany: h.referralFindMany },
    memberEvent: { findMany: async () => [] },
    $transaction: (cb: (tx: unknown) => unknown) => cb({ user: { findMany: h.userFindMany } }),
  },
}));

import { loadPartnerReferralBundle, toPartnerMembersListRows } from '@/lib/partner/referralBundle';
import { GET as exportGET } from '@/app/api/partner/export/referrals/route';

const date = new Date('2026-08-01T00:00:00Z');

/** What Prisma would return for the select it was given (fields outside the select are absent). */
function referralRow(select: Record<string, unknown>) {
  const full = {
    id: 'member-1',
    fullName: 'Fixture Member',
    enrolledProgram: 'it-support',
    enrolledAt: date,
    updatedAt: date,
    deletedAt: null,
    assessmentCompleted: true,
    courseEnrollments: [],
    userCertifications: [{ certName: 'CompTIA A+', earnedAt: date }],
    applications: [{ status: 'APPROVED', submittedAt: date }],
    memberProgramProgress: [],
    placementRecord: {
      employerName: 'SECRET_EMPLOYER', jobTitle: 'SECRET_ROLE', salaryOffered: 98765,
      placedAt: date, startDateVerified: true, onboardingWindowEnd: date, retentionDecision: 'SECRET_RETENTION',
    },
    profile: { city: 'SECRET_CITY', state: 'TX', zip: '78701', employmentStatus: 'SECRET_EMPLOYMENT', educationLevel: 'SECRET_EDUCATION' },
  };
  const member: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (!value) continue;
    const source = (full as Record<string, unknown>)[key];
    const nested = (value as { select?: Record<string, boolean> }).select;
    if (nested && source && typeof source === 'object' && !Array.isArray(source)) {
      member[key] = Object.fromEntries(Object.keys(nested).map((k) => [k, (source as Record<string, unknown>)[k]]));
    } else {
      member[key] = source;
    }
  }
  return { id: 'ref-1', referredAt: date, member };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.partnerType = 'community';
  h.partnerFindFirst.mockImplementation(async () => ({ partnerType: h.partnerType }));
  h.referralFindMany.mockImplementation(async (args: { include: { member: { select: Record<string, unknown> } } }) => [
    referralRow(args.include.member.select),
  ]);
  h.userFindMany.mockResolvedValue([{ id: 'member-1', email: 'member-1@example.test' }]);
});

async function exportCsv(preset?: string) {
  const url = new URL('http://localhost/api/partner/export/referrals');
  if (preset) url.searchParams.set('preset', preset);
  const res = await exportGET(new NextRequest(url));
  const text = await res.text();
  const lines = text.split('\r\n').filter((line) => !line.startsWith('#'));
  return { status: res.status, text, header: lines[0]?.split(',') ?? [], rows: lines.slice(1) };
}

describe('referral bundle loader', () => {
  it('reads the tier from the stored partner row in the tenant', async () => {
    await loadPartnerReferralBundle('partner-1', 'org-1');
    expect(h.partnerFindFirst).toHaveBeenCalledWith({
      where: { id: 'partner-1', organizationId: 'org-1' },
      select: { partnerType: true },
    });
  });

  it('restricted (referral) partner: no profile or job field is selected or returned', async () => {
    h.partnerType = 'referral';
    const bundle = await loadPartnerReferralBundle('partner-1', 'org-1');
    const select = h.referralFindMany.mock.calls[0][0].include.member.select;
    expect(select).not.toHaveProperty('profile');
    expect(select).not.toHaveProperty('email');
    expect(select.placementRecord).toEqual({ select: { placedAt: true, startDateVerified: true } });
    expect(bundle.access.tier).toBe('restricted');
    const member = bundle.members[0];
    expect(member.profile).toBeNull();
    expect(member.placementRecord).toEqual({
      employerName: null, jobTitle: null, salaryOffered: null, placedAt: date,
      startDateVerified: true, onboardingWindowEnd: null, retentionDecision: null,
    });
    const rows = toPartnerMembersListRows(bundle.pipelineMembers);
    expect(rows[0].story).toBe('Placed');
    expect(JSON.stringify({ bundle, rows })).not.toMatch(/SECRET_|98765/);
  });

  it('community partner: today’s view (profile + verified job details) is unchanged', async () => {
    const bundle = await loadPartnerReferralBundle('partner-1', 'org-1');
    const select = h.referralFindMany.mock.calls[0][0].include.member.select;
    expect(select.profile).toEqual({ select: { city: true, state: true, zip: true, employmentStatus: true, educationLevel: true } });
    expect(bundle.access.tier).toBe('full');
    expect(bundle.members[0].placementRecord?.employerName).toBe('SECRET_EMPLOYER');
    expect(bundle.members[0].profile?.city).toBe('SECRET_CITY');
    expect(toPartnerMembersListRows(bundle.pipelineMembers)[0].story).toBe('Placed at SECRET_EMPLOYER as SECRET_ROLE');
  });

  it('hides minors (without FERPA consent) from non-school partners in the query itself', async () => {
    for (const type of ['community', 'referral']) {
      h.partnerType = type;
      h.referralFindMany.mockClear();
      await loadPartnerReferralBundle('partner-1', 'org-1');
      const memberWhere = h.referralFindMany.mock.calls[0][0].where.member;
      expect(memberWhere.NOT).toContainEqual({
        profile: {
          is: expect.objectContaining({
            ferpaConsentGiven: false,
            OR: [{ isMinor: true }, { dob: { gt: expect.any(Date) } }],
          }),
        },
      });
      expect(memberWhere).toMatchObject({ organizationId: 'org-1', deletedAt: null });
    }
  });

  it('school partners keep seeing the minors they referred', async () => {
    h.partnerType = 'high_school';
    await loadPartnerReferralBundle('partner-1', 'org-1');
    const memberWhere = h.referralFindMany.mock.calls[0][0].where.member;
    expect(JSON.stringify(memberWhere)).not.toContain('ferpaConsentGiven');
  });

  it('returns nothing for a partner outside the tenant', async () => {
    h.partnerFindFirst.mockResolvedValue(null);
    const bundle = await loadPartnerReferralBundle('partner-1', 'org-2');
    expect(bundle.pipelineMembers).toEqual([]);
    expect(h.referralFindMany).not.toHaveBeenCalled();
  });
});

describe('referrals CSV export', () => {
  it('restricted partner: status-only columns for every preset, no email lookup', async () => {
    h.partnerType = 'referral';
    for (const preset of [undefined, 'outcomes']) {
      const { status, header, rows, text } = await exportCsv(preset);
      expect(status).toBe(200);
      expect(header).toEqual([
        'Member name', 'Application status', 'Application submitted', 'Program', 'Progress stage',
        'Certifications earned', 'Placed', 'Placed date', 'Referred date',
      ]);
      expect(rows[0]).toContain('Fixture Member');
      expect(rows[0]).toContain('Application approved');
      expect(rows[0]).toContain('CompTIA A+');
      expect(rows[0]).toContain('Yes');
      expect(rows[0]).toContain(date.toISOString());
      expect(text).not.toMatch(/SECRET_|98765|@example\.test|Email|City|ZIP|Employer|Job title|Salary/);
    }
    expect(h.userFindMany).not.toHaveBeenCalled();
  });

  it('restricted partner: the demographics preset is refused before any member is loaded', async () => {
    h.partnerType = 'referral';
    const { status } = await exportCsv('demographics');
    expect(status).toBe(403);
    expect(h.referralFindMany).not.toHaveBeenCalled();
  });

  it('community partner: columns and values unchanged', async () => {
    const base = ['Member name', 'Email', 'Stage', 'Program', 'Progress pct', 'Story', 'Referred date'];
    expect((await exportCsv()).header).toEqual(base);
    const outcomes = await exportCsv('outcomes');
    expect(outcomes.header).toEqual([...base, 'Placed employer', 'Job title', 'Placed date']);
    expect(outcomes.rows[0]).toContain('SECRET_EMPLOYER');
    expect(outcomes.rows[0]).toContain('member-1@example.test');
    const demographics = await exportCsv('demographics');
    expect(demographics.status).toBe(200);
    expect(demographics.rows[0]).toContain('SECRET_CITY');
  });
});
