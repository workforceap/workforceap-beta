// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), diagnostic: vi.fn(), referral: vi.fn(), member: vi.fn(), partner: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partnerReferral: { findFirst: mocks.referral }, user: { findUnique: mocks.member }, partner: { findUnique: mocks.partner } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.diagnostic }));
import { sendPartnerMilestoneEmail, sendPartnerNewMemberAssignedEmail } from '@/lib/notifications/partner-notify';

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RESEND_API_KEY', 'synthetic-only'); vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-secret');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.referral.mockResolvedValue({ member: { fullName: 'Synthetic Member' }, partner: { name: 'Synthetic Partner', contactEmail: 'partner@workforceap.org', notifyOnEnrollment: true } });
  mocks.member.mockResolvedValue({ fullName: 'Synthetic Member' });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Partner', contactEmail: 'partner@workforceap.org' });
  mocks.send.mockResolvedValue({ data: { id: 'accepted-receipt' }, error: null });
  mocks.diagnostic.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const channels = [
  ['milestone', () => sendPartnerMilestoneEmail('member-1', 'Program enrollment')],
  ['assignment', () => sendPartnerNewMemberAssignedEmail('member-1', 'partner-1')],
] as const;
describe.each(channels)('%s partner email', (_name, action) => {
  it('surfaces a resolved SDK error and records safe recipient/subject metadata', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Rate limited', name: 'rate_limit_exceeded' } });
    await expect(action()).rejects.toThrow('Rate limited');
    expect(mocks.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'email_send', status: 'error', provider: 'resend', failureReason: 'Rate limited', metadata: { to: ['partner@workforceap.org'], subject: expect.any(String) } }));
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain('RESEND_API_KEY');
  });
  it('surfaces transport exceptions through the same failure path', async () => {
    mocks.send.mockRejectedValue(new Error('Synthetic network failure'));
    await expect(action()).rejects.toThrow('Synthetic network failure');
    expect(mocks.diagnostic).toHaveBeenCalledTimes(1);
  });
  it('awaits the failure diagnostic before settling', async () => {
    let release!: () => void;
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Rejected' } });
    mocks.diagnostic.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    let settled = false;
    const operation = action().catch(() => { settled = true; });
    for (let i = 0; i < 15 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf('function'); expect(settled).toBe(false);
    release(); await operation; expect(settled).toBe(true);
  });
  it('retains successful sends without false error diagnostics', async () => {
    await action(); expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.diagnostic).not.toHaveBeenCalled();
  });
});
it('respects a partner opting out of milestone email', async () => {
  mocks.referral.mockResolvedValue({ member: { fullName: 'Synthetic' }, partner: { contactEmail: 'partner@workforceap.org', notifyOnEnrollment: false } });
  await sendPartnerMilestoneEmail('member-1', 'Program enrollment');
  expect(mocks.send).not.toHaveBeenCalled();
});

it('skips fixture partner recipients before Resend without a failure diagnostic', async () => {
  mocks.referral.mockResolvedValue({
    member: { fullName: 'Synthetic Member' },
    partner: { name: 'Synthetic Partner', contactEmail: 'partner@example.invalid', notifyOnEnrollment: true },
  });
  await sendPartnerMilestoneEmail('member-1', 'Program enrollment');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.diagnostic).not.toHaveBeenCalled();
});

describe('partner data tier in milestone email (lib/partner/dataAccess.ts)', () => {
  const sentText = () => (mocks.send.mock.calls[0]?.[0] as { text?: string } | undefined)?.text ?? '';

  it('a referral (restricted) partner never receives employer or role', async () => {
    mocks.referral.mockResolvedValue({
      member: { fullName: 'Synthetic Member', profile: null },
      partner: { name: 'Affiliate', contactEmail: 'partner@workforceap.org', notifyOnPlaced: true, partnerType: 'referral' },
    });
    await sendPartnerMilestoneEmail('member-1', 'Job placement', { Employer: 'SECRET_EMPLOYER', Role: 'SECRET_ROLE' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(sentText()).toContain('Milestone: Job placement');
    expect(sentText()).not.toMatch(/SECRET_/);
  });

  it('a community partner keeps today’s details', async () => {
    mocks.referral.mockResolvedValue({
      member: { fullName: 'Synthetic Member', profile: null },
      partner: { name: 'Community', contactEmail: 'partner@workforceap.org', notifyOnPlaced: true, partnerType: 'community' },
    });
    await sendPartnerMilestoneEmail('member-1', 'Job placement', { Employer: 'Acme', Role: 'Tech' });
    expect(sentText()).toContain('Employer: Acme');
  });

  it('a minor without FERPA consent is never announced to a non-school partner', async () => {
    mocks.referral.mockResolvedValue({
      member: { fullName: 'Synthetic Minor', profile: { isMinor: true, dob: null, ferpaConsentGiven: false } },
      partner: { name: 'Community', contactEmail: 'partner@workforceap.org', notifyOnEnrollment: true, partnerType: 'community' },
    });
    await sendPartnerMilestoneEmail('member-1', 'Program enrollment', { Program: 'IT Support' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('a school partner is still told about its minor student', async () => {
    mocks.referral.mockResolvedValue({
      member: { fullName: 'Synthetic Minor', profile: { isMinor: true, dob: null, ferpaConsentGiven: false } },
      partner: { name: 'School', contactEmail: 'partner@workforceap.org', notifyOnEnrollment: true, partnerType: 'high_school' },
    });
    await sendPartnerMilestoneEmail('member-1', 'Program enrollment', { Program: 'IT Support' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
