// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  send: vi.fn(), diagnostic: vi.fn(), referral: vi.fn(), member: vi.fn(), partner: vi.fn(),
  userFindFirst: vi.fn(), lock: vi.fn(), createClaim: vi.fn(), deleteClaim: vi.fn(), markClaim: vi.fn(),
  emailLog: vi.fn(),
  claims: [] as Array<{
    id: string; memberId: string; kind: string; providerIdempotencyKey: string;
    status: string; reason: string | null;
  }>,
}));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/tenant/scopeProxy', () => ({ makeScopedProxy: (_org: unknown, tx: unknown) => tx }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: <T>(fn: () => T) => fn() }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    $executeRaw: mocks.lock,
    user: { findFirst: mocks.userFindFirst },
    memberExternalEffectClaim: {
      create: mocks.createClaim,
      deleteMany: mocks.deleteClaim,
      updateMany: mocks.markClaim,
    },
  };
  return { prisma: {
    $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    partnerReferral: { findFirst: mocks.referral },
    user: { findUnique: mocks.member },
    partner: { findUnique: mocks.partner },
    emailSendLog: { upsert: mocks.emailLog },
  } };
});
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.diagnostic }));
import { sendPartnerMilestoneEmail, sendPartnerNewMemberAssignedEmail } from '@/lib/notifications/partner-notify';

beforeEach(() => {
  vi.resetAllMocks(); mocks.claims.length = 0;
  vi.stubEnv('RESEND_API_KEY', 'synthetic-only'); vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-secret');
  vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', 'synthetic-unsubscribe-secret');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.referral.mockResolvedValue({ member: { fullName: 'Synthetic Member' }, partner: { name: 'Synthetic Partner', contactEmail: 'partner@workforceap.org', notifyOnEnrollment: true } });
  mocks.member.mockResolvedValue({ fullName: 'Synthetic Member' });
  mocks.partner.mockResolvedValue({ name: 'Synthetic Partner', contactEmail: 'partner@workforceap.org' });
  mocks.lock.mockResolvedValue(0);
  mocks.userFindFirst.mockImplementation(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
    const user = { id: 'member-1', organizationId: 'org-1', deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };
    if (Object.entries(where).some(([key, value]) => user[key as keyof typeof user] !== value)) return null;
    return Object.fromEntries(Object.keys(select).map((key) => [key, user[key as keyof typeof user]]));
  });
  mocks.createClaim.mockImplementation(async ({ data }: { data: Omit<(typeof mocks.claims)[number], 'status' | 'reason'> }) => {
    mocks.claims.push({ ...data, status: 'in_flight', reason: null });
    return data;
  });
  mocks.deleteClaim.mockImplementation(async ({ where }: { where: { id: string; memberId: string; status: string } }) => {
    const index = mocks.claims.findIndex((claim) => claim.id === where.id && claim.memberId === where.memberId && claim.status === where.status);
    if (index < 0) return { count: 0 };
    mocks.claims.splice(index, 1);
    return { count: 1 };
  });
  mocks.markClaim.mockImplementation(async ({ where, data }: { where: { id: string; memberId: string; status: string }; data: { status: string; reason: string } }) => {
    const claim = mocks.claims.find((row) => row.id === where.id && row.memberId === where.memberId && row.status === where.status);
    if (!claim) return { count: 0 };
    Object.assign(claim, data);
    return { count: 1 };
  });
  mocks.emailLog.mockResolvedValue({});
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
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Rate limited', name: 'rate_limit_exceeded', statusCode: 429 } });
    await expect(action()).rejects.toThrow('Rate limited');
    expect(mocks.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'email_send', status: 'error', provider: 'resend', failureReason: 'Rate limited', metadata: { to: ['partner@workforceap.org'], subject: expect.any(String) } }));
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain('RESEND_API_KEY');
    expect(mocks.claims).toHaveLength(0);
  });
  it('holds an uncertain transport outcome for reconciliation while retaining its cause', async () => {
    mocks.send.mockRejectedValue(new Error('Synthetic network failure'));
    await expect(action()).rejects.toMatchObject({
      name: 'MemberEmailOutcomeUncertainError',
      causeValue: expect.objectContaining({ message: 'Synthetic network failure' }),
    });
    expect(mocks.diagnostic).toHaveBeenCalledTimes(1);
    expect(mocks.claims).toEqual([expect.objectContaining({
      memberId: 'member-1', kind: 'email', status: 'needs_reconciliation',
      providerIdempotencyKey: expect.any(String),
    })]);
  });
  it('awaits the failure diagnostic before settling', async () => {
    let release!: () => void;
    mocks.send.mockResolvedValue({ data: null, error: { message: 'Rejected', statusCode: 400 } });
    mocks.diagnostic.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    let settled = false;
    const operation = action().catch(() => { settled = true; });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(settled).toBe(false);
    release(); await operation; expect(settled).toBe(true);
  });
  it('retains successful sends without false error diagnostics', async () => {
    mocks.send.mockImplementation(async (_payload, options: { idempotencyKey: string }) => {
      expect(mocks.claims).toEqual([expect.objectContaining({
        memberId: 'member-1', kind: 'email', status: 'in_flight',
        providerIdempotencyKey: options.idempotencyKey,
      })]);
      return { data: { id: 'accepted-receipt' }, error: null };
    });
    await action(); expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.diagnostic).not.toHaveBeenCalled();
    expect(mocks.claims).toHaveLength(0);
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
