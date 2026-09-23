/**
 * WAP-171 — the partner referrals CSV matches privacy policy §3.3: enrollment
 * status, progress and outcomes. Ethnicity and veteran status are not columns.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'partner-user-1' }) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: async () => ({ partnerId: 'partner-1', partner: { organizationId: 'org-1', name: 'Fixture Partner', slug: 'fixture-partner', logoUrl: null } }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {} }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (cb: (tx: unknown) => unknown) => cb({ user: { findMany: async () => [{ id: 'm1', email: 'm1@example.test' }] } }) },
}));
vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: async () => ({
    pipelineMembers: [{
      member: {
        id: 'm1',
        fullName: 'Member One',
        enrolledProgram: 'it-support',
        enrolledAt: new Date('2026-01-01T00:00:00Z'),
        courseEnrollments: [],
        userCertifications: [],
        memberProgramProgress: [],
        placementRecord: { employerName: 'Acme', jobTitle: 'Technician', placedAt: new Date('2026-01-02T00:00:00Z'), startDateVerified: true, onboardingWindowEnd: new Date('2026-04-02T00:00:00Z'), retentionDecision: 'retained', salaryOffered: 52000 },
        // A profile that still carries the demographic fields must not leak them into the CSV.
        profile: { city: 'Austin', state: 'TX', zip: '78701', employmentStatus: 'unemployed', educationLevel: 'high_school', ethnicity: 'ETHNICITY_MARKER', veteranStatus: 'VETERAN_MARKER' },
      },
      referredAt: new Date('2026-01-01T00:00:00Z'),
      stage: 'placed',
      programTitle: 'IT Support',
    }],
  }),
  countPartnerReferrals: async () => 1,
  toPartnerMembersListRows: () => [{ id: 'm1', fullName: 'Member One', stageLabel: 'Enrolled', programTitle: 'IT Support', progress: 40, story: '40% through IT Support', referredAtLabel: '1/1/2026' }],
}));

import { GET } from '@/app/api/partner/export/referrals/route';

async function exportCsv(preset?: string) {
  const url = new URL('http://localhost/api/partner/export/referrals');
  if (preset) url.searchParams.set('preset', preset);
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(200);
  const text = await response.text();
  const lines = text.split('\r\n').filter((line) => !line.startsWith('#'));
  return { text, header: lines[0].split(','), rows: lines.slice(1) };
}

const BASE = ['Member name', 'Email', 'Stage', 'Program', 'Progress pct', 'Story', 'Referred date'];
const OUTCOMES = ['Placed employer', 'Job title', 'Placed date'];

describe('partner referrals export columns (WAP-171)', () => {
  it('demographics preset carries location, status and outcomes — never ethnicity or veteran status', async () => {
    const { text, header, rows } = await exportCsv('demographics');
    expect(header).toEqual([...BASE, 'City', 'State', 'ZIP', 'Employment status', 'Education level', ...OUTCOMES, 'Onboarding window end', 'Retention decision']);
    expect(rows).toHaveLength(1);
    expect(rows[0].split(',')).toHaveLength(header.length);
    expect(text).not.toMatch(/ethnicity|veteran/i);
    expect(text).not.toContain('ETHNICITY_MARKER');
    expect(text).not.toContain('VETERAN_MARKER');
    expect(text).not.toContain('52000');
  });

  it('outcomes and default presets are unchanged', async () => {
    expect((await exportCsv('outcomes')).header).toEqual([...BASE, ...OUTCOMES]);
    expect((await exportCsv()).header).toEqual(BASE);
  });

  it('packet preset (V12) has no ethnicity, veteran, salary or email columns, and the other presets keep theirs', async () => {
    const { text } = await exportCsv('packet');
    const lines = text.split('\r\n');
    const rowHeader = lines[lines.indexOf('') + 1].split(',');
    expect(rowHeader).toEqual([
      'Member name',
      'Referred at',
      'Stage',
      'Program',
      'Enrolled',
      'Training completed',
      'Credential record (member-reported)',
      'Placement status',
      'Placed employer (start date verified)',
      'Job title (start date verified)',
    ]);
    expect(rowHeader.join(',')).not.toMatch(/ethnicity|veteran|salary|email|story|city|zip/i);
    expect(text).not.toMatch(/ETHNICITY_MARKER|VETERAN_MARKER|52000|m1@example\.test/);
    expect((await exportCsv('outcomes')).header).toEqual([...BASE, ...OUTCOMES]);
  });
});
