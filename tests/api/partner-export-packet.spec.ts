/**
 * Vision C4 / V12 — `GET /api/partner/export/referrals?preset=packet`.
 * The packet CSV carries an ISO generated_at line, definitions and the
 * metric block, never an email, salary, Story text or an unverified employer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPartnerForUser: vi.fn(),
  loadPartnerReferralBundle: vi.fn(),
  countPartnerReferrals: vi.fn(),
  auditLog: vi.fn(async () => {}),
  logAuditEvent: vi.fn(async () => {}),
  userFindMany: vi.fn(async () => [{ id: 'm-verified', email: 'verified.member@example.test' }]),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: mocks.getPartnerForUser }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (cb: (tx: unknown) => unknown) => cb({ user: { findMany: mocks.userFindMany } }) },
}));
vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: mocks.loadPartnerReferralBundle,
  countPartnerReferrals: mocks.countPartnerReferrals,
  toPartnerMembersListRows: () => [],
}));

import { GET } from '@/app/api/partner/export/referrals/route';

function pipelineRow(id: string, fullName: string, startDateVerified: boolean | null) {
  return {
    member: {
      id,
      fullName,
      enrolledProgram: 'it-support',
      enrolledAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      deletedAt: null,
      assessmentCompleted: true,
      courseEnrollments: [],
      placementRecord:
        startDateVerified === null
          ? null
          : {
              employerName: startDateVerified ? 'Verified Employer' : 'Unverified Employer',
              jobTitle: startDateVerified ? 'Verified Technician' : 'Unverified Analyst',
              salaryOffered: 52000,
              placedAt: new Date('2026-08-01T00:00:00Z'),
              startDateVerified,
              onboardingWindowEnd: null,
              retentionDecision: null,
            },
      profile: { city: 'Austin', state: 'TX', zip: '78701', employmentStatus: 'unemployed', educationLevel: 'hs', ethnicity: 'ETHNICITY_MARKER', veteranStatus: 'VETERAN_MARKER' },
      userCertifications: [],
      applications: [],
      memberProgramProgress: [],
    },
    referredAt: new Date('2026-01-15T00:00:00Z'),
    stage: startDateVerified === null ? 'enrolled' : 'placed',
    progress: 0,
    programTitle: 'IT Support',
    allProgramTitles: ['IT Support'],
  };
}

const CTX = {
  partnerId: 'partner-1',
  partner: { organizationId: 'org-partner', name: 'Fixture Partner', slug: 'fixture-partner', logoUrl: null },
};

async function get(preset?: string) {
  const url = new URL('http://localhost/api/partner/export/referrals');
  if (preset) url.searchParams.set('preset', preset);
  return GET(new NextRequest(url));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'partner-user-1' });
  mocks.getPartnerForUser.mockResolvedValue(CTX);
  mocks.loadPartnerReferralBundle.mockResolvedValue({
    pipelineMembers: [
      pipelineRow('m-verified', 'Verified Member', true),
      pipelineRow('m-unverified', 'Unverified Member', false),
      pipelineRow('m-none', 'Enrolled Member', null),
    ],
  });
  mocks.countPartnerReferrals.mockResolvedValue(3);
});

describe('partner export preset=packet', () => {
  it('(e) prints provenance, the X of N block and privacy-safe rows', async () => {
    const response = await get('packet');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('workforceap-outcome-packet-fixture-partner.csv');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const text = await response.text();
    const lines = text.split('\r\n');

    expect(lines).toContain('# partner=Fixture Partner');
    expect(lines.some((l) => /^# generated_at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(l))).toBe(true);
    expect(lines).toContain('# period=All referrals to date (by referral date)');
    expect(lines).toContain('# definitions_version=partner-packet-v1');
    expect(lines).toContain('# source: docs/OUTCOMES-METHODOLOGY.md §2/§4/§7');
    expect(text).not.toContain('WARNING');

    const summaryStart = lines.indexOf('metric,count,denominator,display');
    expect(summaryStart).toBeGreaterThan(0);
    expect(lines.slice(summaryStart + 1, summaryStart + 8)).toEqual([
      'referred,3,3,3 of 3',
      'enrolled,3,3,3 of 3',
      'trainingCompleted,0,3,0 of 3',
      'credentialRecordsMemberReported,0,3,0 of 3',
      'placementRecords,2,3,2 of 3',
      'placementStartDateVerified,1,3,1 of 3',
      'placementStartDateNotVerified,1,3,1 of 3',
    ]);
    expect(lines[summaryStart + 8]).toBe('');

    const rowBlock = lines.slice(summaryStart + 9);
    const unverified = rowBlock.find((l) => l.startsWith('Unverified Member,'));
    expect(unverified).toBeDefined();
    expect(unverified).toContain('recorded_start_not_verified');
    expect(unverified).not.toMatch(/Unverified Employer|Unverified Analyst/);
    expect(rowBlock.find((l) => l.startsWith('Verified Member,'))).toContain('start_date_verified,Verified Employer,Verified Technician');

    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toContain('52000');
    expect(text).not.toContain('Placed at');
    expect(text).not.toMatch(/ETHNICITY_MARKER|VETERAN_MARKER/);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it('keeps member- and partner-typed values from running as spreadsheet formulas', async () => {
    mocks.getPartnerForUser.mockResolvedValue({
      ...CTX,
      partner: { ...CTX.partner, name: 'Evil Partner\r\nInjected,=HYPERLINK("http://x")' },
    });
    mocks.loadPartnerReferralBundle.mockResolvedValue({
      pipelineMembers: [pipelineRow('m-verified', '=cmd|calc', true)],
    });
    mocks.countPartnerReferrals.mockResolvedValue(1);
    const text = await (await get('packet')).text();
    const lines = text.split('\r\n');
    expect(lines).toContain('# partner=Evil Partner Injected,\'=HYPERLINK("http://x")');
    expect(lines.some((l) => l.startsWith("'=cmd|calc,"))).toBe(true);
    for (const line of lines) {
      for (const cell of line.split(',')) expect(cell).not.toMatch(/^[=+\-@\t]/);
    }
  });

  it('warns when the capped load is smaller than the referral count', async () => {
    mocks.countPartnerReferrals.mockResolvedValue(612);
    const text = await (await get('packet')).text();
    expect(text).toContain('# WARNING: this packet includes the 3 most recent of 612 referrals.');
    expect(text).toContain('referred,612,612,612 of 612');
  });

  it('audits the packet preset with the loaded row count', async () => {
    mocks.countPartnerReferrals.mockResolvedValue(612);
    await get('packet');
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner_referrals_export',
        targetId: 'partner-1',
        metadata: expect.objectContaining({ preset: 'packet', rows: 3, totalReferrals: 612 }),
      }),
    );
  });

  it('(g) scopes both reads to the session partner and its organization', async () => {
    await get('packet');
    expect(mocks.loadPartnerReferralBundle).toHaveBeenCalledWith('partner-1', 'org-partner');
    expect(mocks.countPartnerReferrals).toHaveBeenCalledWith('partner-1', 'org-partner');
  });

  it('(g) no session gives 401 and reads nothing', async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await get('packet');
    expect(response.status).toBe(401);
    expect(mocks.loadPartnerReferralBundle).not.toHaveBeenCalled();
    expect(mocks.countPartnerReferrals).not.toHaveBeenCalled();
  });

  it('(g) a non-partner gives 403 and reads nothing', async () => {
    mocks.getPartnerForUser.mockResolvedValue(null);
    const response = await get('packet');
    expect(response.status).toBe(403);
    expect(mocks.loadPartnerReferralBundle).not.toHaveBeenCalled();
    expect(mocks.countPartnerReferrals).not.toHaveBeenCalled();
  });
});
