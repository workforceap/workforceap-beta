// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), user: vi.fn(), begin: vi.fn(), release: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: mocks.user },
  emailSendLog: { upsert: vi.fn(async () => ({})) },
} }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/member/uploadLifecycle', () => ({
  beginMemberUpload: mocks.begin,
  releaseMemberUpload: mocks.release,
  MemberUploadLifecycleError: class MemberUploadLifecycleError extends Error {},
}));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));
import { sendMilestoneCascadeEmail } from '@/lib/email';
import { sendBrandedEmail } from '@/lib/email/send';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-only');
  vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-only');
  mocks.send.mockResolvedValue({ data: { id: 'synthetic-receipt' }, error: null });
  mocks.begin.mockResolvedValue('synthetic-claim');
  mocks.release.mockResolvedValue(undefined);
  mocks.user.mockResolvedValue({
    email: 'member@workforceap.org', deletedAt: null,
    billingDeletionPendingAt: null, billingDeletionOperationId: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('milestone provider idempotency boundary', () => {
  const message = { to: 'member@workforceap.org', recipientUserId: 'member-1', subject: 'Synthetic milestone', bodyText: 'Synthetic body', idempotencyKey: 'milestone/synthetic/0/stable' };
  it('threads the exact stable key to Resend and returns its acceptance receipt', async () => {
    const result = await sendMilestoneCascadeEmail(message);
    expect(result).toEqual({ ok: true, messageId: 'synthetic-receipt' });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'member@workforceap.org', subject: message.subject }), { idempotencyKey: message.idempotencyKey });
    expect(mocks.begin).toHaveBeenCalledWith('member-1', 'email', message.idempotencyKey);
    expect(mocks.release).toHaveBeenCalledWith('member-1', 'synthetic-claim');
    expect(mocks.user).toHaveBeenCalledWith({ where: { id: 'member-1' }, select: {
      email: true, deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true,
    } });
  });
  it('checks deletion at the sender boundary and never calls Resend for an inactive member', async () => {
    mocks.user.mockResolvedValue({
      email: 'member@workforceap.org', deletedAt: new Date(),
      billingDeletionPendingAt: new Date(), billingDeletionOperationId: null,
    });
    expect(await sendMilestoneCascadeEmail(message)).toMatchObject({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not report accepted when Resend returns no receipt', async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    expect(await sendMilestoneCascadeEmail(message)).toMatchObject({ ok: false, error: 'Email provider outcome needs reconciliation' });
    expect(mocks.release).toHaveBeenCalledWith('member-1', 'synthetic-claim');
  });
  it('keeps a conflicting provider reply uncertain without reporting acceptance', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: 'invalid_idempotent_request', message: 'Synthetic changed payload' } });
    expect(await sendMilestoneCascadeEmail(message)).toMatchObject({ ok: false, error: 'Email provider outcome needs reconciliation' });
    expect(mocks.release).toHaveBeenCalledWith('member-1', 'synthetic-claim');
  });
  it('derives a stable idempotency key for unkeyed mail instead of an unkeyed SDK call', async () => {
    // Send-path hardening (2026-09-20): every provider request carries a key so
    // a transient-error retry can never double-deliver. Unkeyed callers get
    // `email/<sha256 of recipients + subject + body + UTC day>`; the caller's
    // own key (asserted above) still wins when supplied.
    const resend = { emails: { send: mocks.send } } as unknown as import('resend').Resend;
    const args = { from: 'test@workforceap.org', to: 'member@workforceap.org', subject: message.subject, html: '<p>Synthetic</p>' };
    await sendBrandedEmail(resend, args);
    await sendBrandedEmail(resend, args);
    expect(mocks.send.mock.calls[0]).toHaveLength(2);
    const [, options] = mocks.send.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: expect.stringMatching(/^email\/[0-9a-f]{64}$/) });
    expect(mocks.send.mock.calls[1][1]).toEqual(options);
  });
});
