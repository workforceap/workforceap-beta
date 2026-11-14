// @vitest-environment node
/**
 * The weekly partner digest (app/api/cron/partner-outcome-digest/route.ts)
 * says a referred member was placed only once staff verified the start date,
 * in the partner portal's own words (partnerPlacementLabel,
 * lib/partner/partnerVisibleEvents.ts). A member self-report is an
 * unverified placement: it is neither announced nor counted as the "Placed"
 * stage, the same rule as lib/partner/referralBundle.ts. A restricted
 * (referral-track) partner never gets employer or job title.
 *
 * The pipeline stage helper and the placement label are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  partnerFindMany: vi.fn(),
  referralFindMany: vi.fn(),
  digestEmail: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_name: string, handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findMany: mocks.partnerFindMany },
    partnerReferral: { findMany: mocks.referralFindMany },
  },
}));
vi.mock('@/lib/email', () => ({ sendPartnerWeeklyDigestEmail: mocks.digestEmail }));
vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: vi.fn(),
  getCurrentCronExecutionId: vi.fn(() => null),
}));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn(), captureApiResponseError: vi.fn() }));

import { GET as partnerDigest } from '@/app/api/cron/partner-outcome-digest/route';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

const thisWeek = () => new Date(Date.now() - 2 * 86400000);

function referral(
  fullName: string,
  placementRecord: Record<string, unknown> | null,
  profile: { isMinor?: boolean; dob?: Date | null; ferpaConsentGiven?: boolean } = {},
) {
  return {
    partnerId: 'partner-1',
    member: {
      id: `member-${fullName}`,
      fullName,
      email: `${fullName.toLowerCase()}@example.test`,
      enrolledProgram: 'it-support',
      courseEnrollments: [],
      enrolledAt: new Date('2026-08-01'),
      assessmentCompleted: true,
      deletedAt: null,
      placementRecord,
      profile: {
        isMinor: profile.isMinor ?? false,
        dob: profile.dob ?? null,
        ferpaConsentGiven: profile.ferpaConsentGiven ?? false,
      },
      userCertifications: [],
      applications: [],
      memberProgramProgress: [],
    },
  };
}

const unverified = () => ({
  employerName: 'Acme Corp',
  jobTitle: 'Help Desk Technician',
  salaryOffered: 52000,
  placedAt: thisWeek(),
  startDateVerified: false,
});
const verified = () => ({ ...unverified(), employerName: 'Globex', jobTitle: 'Support Analyst', startDateVerified: true });

async function runDigest(partnerType: string, referrals: ReturnType<typeof referral>[]) {
  mocks.partnerFindMany.mockResolvedValue([
    { id: 'partner-1', name: 'Partner', contactEmail: 'partner@workforceap.org', partnerType },
  ]);
  mocks.referralFindMany.mockResolvedValue(referrals);
  await partnerDigest(new Request('http://test/api/cron/partner-outcome-digest'));
  expect(mocks.digestEmail).toHaveBeenCalledTimes(1);
  return mocks.digestEmail.mock.calls[0]![0] as { stageLines: string[]; successLines: string[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.digestEmail.mockResolvedValue({ ok: true });
});

describe('partner outcome digest placements', () => {
  it('reads startDateVerified with the placement', async () => {
    await runDigest('community', [referral('Pat', null)]);
    const select = mocks.referralFindMany.mock.calls[0]![0].include.member.select;
    expect(select.placementRecord.select).toMatchObject({ placedAt: true, startDateVerified: true });
  });

  it('a full-tier partner is not told about an unverified placement, and it is not the Placed stage', async () => {
    const email = await runDigest('community', [referral('Sam', unverified())]);
    expect(email.successLines).toEqual([]);
    expect(JSON.stringify(email)).not.toContain('Acme Corp');
    expect(JSON.stringify(email)).not.toContain('Help Desk Technician');
    expect(email.stageLines).toEqual(['1 in Enrolled']);
  });

  it('a full-tier partner gets a verified placement in the portal wording, employer and role included', async () => {
    const email = await runDigest('community', [referral('Sam', verified()), referral('Lee', unverified())]);
    expect(email.successLines).toEqual(['Sam: Placed at Globex — Support Analyst']);
    expect(email.stageLines.sort()).toEqual(['1 in Enrolled', '1 in Placed']);
  });

  it('a restricted partner gets "Placed" for a verified placement and never the employer or role', async () => {
    const email = await runDigest('referral', [referral('Sam', verified()), referral('Lee', unverified())]);
    expect(email.successLines).toEqual(['Sam: Placed']);
    const text = JSON.stringify(email);
    for (const secret of ['Globex', 'Support Analyst', 'Acme Corp', 'Help Desk Technician', '52000']) {
      expect(text).not.toContain(secret);
    }
  });

  it('a verified placement from before this week is counted as a stage but not announced', async () => {
    const email = await runDigest('community', [referral('Sam', { ...verified(), placedAt: new Date('2026-01-05') })]);
    expect(email.successLines).toEqual([]);
    expect(email.stageLines).toEqual(['1 in Placed']);
  });
});

describe('partner outcome digest contact, minors and send failures', () => {
  it('does not load referrals or send when no partner has a contact email', async () => {
    mocks.partnerFindMany.mockResolvedValue([
      { id: 'partner-1', name: 'Blank', contactEmail: '   ', partnerType: 'community' },
      { id: 'partner-2', name: 'Missing', contactEmail: null, partnerType: 'community' },
    ]);

    const res = await partnerDigest(new Request('http://test/api/cron/partner-outcome-digest'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, results: [] });
    expect(mocks.referralFindMany).not.toHaveBeenCalled();
    expect(mocks.digestEmail).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(0);
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_partner_digest',
      expect.objectContaining({ skippedReason: 'no_contactable_partners', sent: 0 }),
    );
  });

  it('hides a minor from a community partner and skips the email when that is the only referral', async () => {
    mocks.partnerFindMany.mockResolvedValue([
      { id: 'partner-1', name: 'Community', contactEmail: 'partner@workforceap.org', partnerType: 'community' },
    ]);
    mocks.referralFindMany.mockResolvedValue([referral('Sam', null, { isMinor: true })]);

    const body = await (await partnerDigest(new Request('http://test/api/cron/partner-outcome-digest'))).json();

    expect(mocks.digestEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      ok: true,
      results: [{ partnerId: 'partner-1', emailSent: false, error: 'no_referrals' }],
    });
  });

  it('still emails a high-school partner about a referred minor', async () => {
    await runDigest('high_school', [referral('Sam', null, { isMinor: true })]);
    expect(mocks.digestEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        partnerName: 'Partner',
        stageLines: ['1 in Enrolled'],
      }),
    );
  });

  it('includes a minor when a community partner has FERPA consent', async () => {
    await runDigest('community', [referral('Sam', null, { isMinor: true, ferpaConsentGiven: true })]);
    expect(mocks.digestEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ stageLines: ['1 in Enrolled'] }),
    );
  });

  it('captures a thrown send, keeps other accounting, and logs the run as error', async () => {
    mocks.partnerFindMany.mockResolvedValue([
      { id: 'partner-1', name: 'Partner', contactEmail: 'partner@workforceap.org', partnerType: 'community' },
    ]);
    mocks.referralFindMany.mockResolvedValue([referral('Pat', null)]);
    mocks.digestEmail.mockRejectedValue(new Error('SMTP down'));

    const res = await partnerDigest(new Request('http://test/api/cron/partner-outcome-digest'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      results: [{ partnerId: 'partner-1', emailSent: false, error: 'SMTP down' }],
    });
    expect(captureApiError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'SMTP down' }),
      expect.objectContaining({ route: 'cron/partner-outcome-digest', extra: { partnerId: 'partner-1' } }),
    );
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_partner_digest',
      expect.objectContaining({ ok: false, sent: 0, failed: 1 }),
      'error',
    );
  });
});
