// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ referrals: vi.fn(), logs: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findMany: db.referrals },
    partnerOutreachLog: { findMany: db.logs },
  },
}));

import { memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';
import { partnerAttentionRows } from '@/lib/partner/attentionQueue';
import { buildAttentionPageQuery } from '@/lib/partner/attentionPagination';

async function loadFixtureRows() { return partnerAttentionRows(await db.referrals(), new Map(), now); }
import { programDisplayTitle } from '@/lib/content/programTitle';

const programSlug = 'it-support-professional-certificate-ibm';
const now = new Date('2026-09-09T12:00:00Z');
function referral(id: string, overrides: Record<string, unknown> = {}) {
  return {
    memberId: id,
    assignedPartnerUserId: null,
    assignedPartnerUser: null,
    member: {
      id, fullName: `Synthetic ${id}`, enrolledProgram: programSlug,
      courseEnrollments: [{ programSlug, curriculumVersion: 'legacy-v1', isPrimary: true }],
      enrolledAt: new Date('2026-07-01'), updatedAt: new Date('2026-08-01'),
      deletedAt: null, assessmentCompleted: true, courseraEnrollmentApproved: true,
      placementRecord: null, userCertifications: [], applications: [], memberProgramProgress: [],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db.logs.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('partner follow-up eligibility', () => {
  it('retains a quiet learner after the first course and preserves an immutable assignment over a stale program pointer', async () => {
    db.referrals.mockResolvedValue([
      referral('active', {
        enrolledProgram: 'stale-program-pointer',
        memberProgramProgress: [{ programSlug, averagePercent: 10, coursesCompleted: 1 }],
      }),
    ]);
    const rows = await loadFixtureRows();
    expect(rows).toEqual([expect.objectContaining({
      memberId: 'active', stage: 'in_training', stageLabel: 'In Training', riskTier: 'high',
      nextBestAction: expect.stringContaining('latest course progress'),
    })]);
  });

  it('distinguishes approval pending from approved pre-training enrollment without inventing funding approval', async () => {
    db.referrals.mockResolvedValue([
      referral('pending', { courseraEnrollmentApproved: false }),
      referral('approved'),
    ]);
    const rows = await loadFixtureRows();
    expect(rows.find(row => row.memberId === 'pending')).toMatchObject({
      stage: 'approval_pending', stageLabel: 'Training approval pending',
      nextBestAction: expect.stringContaining('confirm enrollment approval and any funding steps'),
    });
    expect(rows.find(row => row.memberId === 'approved')).toMatchObject({
      stage: 'enrolled', nextBestAction: expect.stringContaining('Confirm they can open'),
    });
    expect(JSON.stringify(rows)).not.toMatch(/funding approved|fully funded/i);
  });

  it('keeps completed training without a recorded certificate in this queue', async () => {
    db.referrals.mockResolvedValue([referral('completed-coursework', {
      memberProgramProgress: [{ programSlug, averagePercent: 100, coursesCompleted: 99 }],
    })]);
    expect((await loadFixtureRows())[0]).toMatchObject({ memberId: 'completed-coursework', stage: 'in_training' });
  });

  it('does not hide observed training merely because a legacy approval flag is absent', async () => {
    db.referrals.mockResolvedValue([referral('legacy-active', {
      courseraEnrollmentApproved: false,
      memberProgramProgress: [{ programSlug, averagePercent: 20, coursesCompleted: 2 }],
    })]);
    expect(await loadFixtureRows()).toEqual([
      expect.objectContaining({ stage: 'in_training' }),
    ]);
  });

  it('keeps applicants and excludes closed, placed and certified members from this pre-placement queue', async () => {
    db.referrals.mockResolvedValue([
      referral('applicant', { enrolledProgram: null, courseEnrollments: [], enrolledAt: null }),
      referral('closed', { deletedAt: now }),
      referral('placed', { placementRecord: { employerName: 'Synthetic', jobTitle: 'Support', placedAt: now, startDateVerified: true } }),
      referral('certified', { userCertifications: [{ certName: 'Recorded certificate', earnedAt: now }] }),
    ]);
    expect((await loadFixtureRows()).map(row => row.memberId)).toEqual(['applicant']);
  });

  it('keeps an unverified self-report available for follow-up without calling the member placed', async () => {
    db.referrals.mockResolvedValue([
      referral('pending-placement', {
        placementRecord: {
          employerName: 'Private Employer', jobTitle: 'Private Role', placedAt: now,
          startDateVerified: false,
        },
      }),
      referral('verified-placement', {
        placementRecord: {
          employerName: 'Confirmed Employer', jobTitle: 'Confirmed Role', placedAt: now,
          startDateVerified: true,
        },
      }),
    ]);
    const rows = await loadFixtureRows();
    expect(rows.map(row => row.memberId)).toEqual(['pending-placement']);
    expect(rows[0].stage).toBe('enrolled');
    expect(JSON.stringify(rows)).not.toContain('Private Employer');
    expect(JSON.stringify(rows)).not.toContain('Private Role');
  });

  it('applies the active partner, same-tenant member and real-member predicates before paging', () => {
    const query = buildAttentionPageQuery('partner-1', 'org-1', { tier: 'all', asOf: now, limit: 50 });
    expect(query.text).toContain('p.active = true');
    expect(query.text).toContain('u.deleted_at IS NULL');
    // One definition of "a member" (WAP-182 item 3): the shared predicate,
    // not a hand-written `profile.role = 'member'`.
    expect(query.text).toContain(memberOnlyRoleSql('u').text);
    expect(query.text).toContain('NOT EXISTS (SELECT 1 FROM user_certifications');
    expect(query.text).toContain('placement.start_date_verified = true');
    expect(query.values).toContain('partner-1');
    expect(query.values.filter(value => value === 'org-1')).toHaveLength(2);
  });
});

describe('program titles on partner attention rows', () => {
  it('renders a catalog title for a known slug and readable words for an unknown one, never a dash', async () => {
    const unknownSlug = 'cybersecurity-google';
    db.referrals.mockResolvedValue([
      referral('known'),
      referral('unknown', { enrolledProgram: unknownSlug, courseEnrollments: [{ programSlug: unknownSlug, curriculumVersion: 'legacy-v1', isPrimary: true }] }),
    ]);
    const rows = await loadFixtureRows();
    const byId = new Map(rows.map(row => [row.memberId, row]));
    expect(byId.get('known')?.programTitle).toBe(programDisplayTitle(programSlug));
    expect(byId.get('known')?.programTitle).not.toMatch(/-/);
    expect(byId.get('unknown')?.programTitle).toBe('Cybersecurity Google');
    expect(rows.map(row => row.programTitle)).not.toContain('—');
  });
});
