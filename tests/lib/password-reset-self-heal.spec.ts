import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  findMany: vi.fn(),
  reenable: vi.fn(),
  sendBrandedEmail: vi.fn(),
  getResend: vi.fn(),
  beginClaim: vi.fn(),
  releaseClaim: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { generateLink: mocks.generateLink } } }),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({ user: { findMany: mocks.findMany } })),
  },
}));
vi.mock('@/lib/admin/authUserLifecycle', () => ({
  reenableAuthUserAfterRestore: mocks.reenable,
}));
vi.mock('@/lib/member/uploadLifecycle', () => ({
  beginMemberUpload: mocks.beginClaim,
  releaseMemberUpload: mocks.releaseClaim,
  MemberUploadLifecycleError: class MemberUploadLifecycleError extends Error {
    reason: string;
    constructor(reason = 'member_inactive') { super(reason); this.reason = reason; }
  },
}));
vi.mock('@/lib/email', () => ({ getResend: mocks.getResend }));
// `lib/auth/passwordReset.ts` imports `sendBrandedEmailOrThrowOnSkip` (aliased
// to `sendBrandedEmail`) since WAP-14 made a skipped recipient throw rather
// than return quietly. Both export names resolve to the same spy so this mock
// keeps intercepting whichever the module imports — otherwise the import is
// undefined, the call throws, and the route silently falls back to the
// Supabase path, which is what made these tests report `via: 'supabase'`.
vi.mock('@/lib/email/send', () => ({
  sendBrandedEmail: mocks.sendBrandedEmail,
  sendBrandedEmailOrThrowOnSkip: mocks.sendBrandedEmail,
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: () => '<html/>' }));
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: vi.fn(async () => ({
    name: 'WorkforceAP',
    domain: 'https://www.workforceap.org',
    supportEmail: 'hello@workforceap.org',
  })),
}));
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';

const USER_NOT_FOUND = {
  data: { properties: null },
  error: { message: 'User not found', code: 'user_not_found' },
};
const MINTED = { data: { properties: { hashed_token: 'hash-1' } }, error: null };

describe('sendPasswordResetEmail — auth user self-heal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateLink.mockReset();
    mocks.findMany.mockReset();
    mocks.reenable.mockReset();
    mocks.sendBrandedEmail.mockReset();
    mocks.beginClaim.mockReset();
    mocks.releaseClaim.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    mocks.getResend.mockReturnValue({});
    mocks.sendBrandedEmail.mockResolvedValue(undefined);
    mocks.beginClaim.mockResolvedValue('claim-1');
    mocks.releaseClaim.mockResolvedValue(undefined);
  });

  it('re-creates a missing Supabase auth user for an active account, then sends the link', async () => {
    mocks.generateLink.mockResolvedValueOnce(USER_NOT_FOUND).mockResolvedValueOnce(MINTED);
    mocks.findMany.mockResolvedValue([{
      id: 'user-1',
      email: 'Admin@Example.org',
      fullName: 'Michael Brown',
      phone: null,
    }]);
    mocks.reenable.mockResolvedValue({ ok: true, action: 'recreated' });

    const result = await sendPasswordResetEmail('Admin@Example.org');

    expect(result).toEqual({ error: null, via: 'resend' });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { email: { equals: 'admin@example.org', mode: 'insensitive' }, deletedAt: null,
        billingDeletionPendingAt: null, billingDeletionOperationId: null },
      select: { id: true, email: true, fullName: true, phone: true },
      take: 25,
    });
    // The matched row's own stored address is what reaches auth, not the
    // request string. `reenableAuthUserAfterRestore` lowercases it itself.
    expect(mocks.reenable).toHaveBeenCalledWith(expect.anything(), {
      id: 'user-1',
      email: 'Admin@Example.org',
      fullName: 'Michael Brown',
      phone: null,
    });
    expect(mocks.generateLink).toHaveBeenCalledTimes(2);
    expect(mocks.beginClaim).toHaveBeenCalledWith('user-1', 'notification');
    expect(mocks.releaseClaim).toHaveBeenCalledWith('user-1', 'claim-1');
    expect(mocks.sendBrandedEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: 'admin@example.org', recipientUserId: 'user-1', memberEffectClaim: true }),
    );
  });

  it('still skips silently when no account exists for the address', async () => {
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    mocks.findMany.mockResolvedValue([]);

    const result = await sendPasswordResetEmail('nobody@example.org');

    expect(result.via).toBe('skipped');
    expect(mocks.reenable).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendBrandedEmail).not.toHaveBeenCalled();
  });

  it('does not resurrect a soft-deleted account', async () => {
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    // `deletedAt: null` is part of the lookup, so a deleted row is simply not found.
    mocks.findMany.mockResolvedValue([]);

    const result = await sendPasswordResetEmail('deleted@example.org');

    expect(result.via).toBe('skipped');
    expect(mocks.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    expect(mocks.reenable).not.toHaveBeenCalled();
  });

  it('reports skipped when the auth user cannot be re-created', async () => {
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    mocks.findMany.mockResolvedValue([{ id: 'user-1', email: 'a@b.org', fullName: 'A', phone: null }]);
    mocks.reenable.mockResolvedValue({ ok: false, message: 'auth service refused the id' });

    const result = await sendPasswordResetEmail('a@b.org');

    expect(result.via).toBe('skipped');
    expect(mocks.generateLink).toHaveBeenCalledTimes(1);
    expect(mocks.sendBrandedEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the users lookup itself fails', async () => {
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    mocks.findMany.mockRejectedValue(new Error('database unavailable'));

    await expect(sendPasswordResetEmail('a@b.org')).rejects.toThrow('database unavailable');
    expect(mocks.reenable).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  // `mode: 'insensitive'` compiles to ILIKE on PostgreSQL, so `%` and `_` in
  // the caller-supplied address are wildcards. This endpoint is
  // unauthenticated, so a pattern that matches a row must never be treated as
  // proof that the caller owns that account.
  it('refuses to self-heal when a wildcard pattern matches somebody else', async () => {
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    // What ILIKE '%@example.org' would return: real rows, none of which IS
    // the requested string.
    mocks.findMany.mockResolvedValue([
      { id: 'victim-1', email: 'someone@example.org', fullName: 'Someone', phone: null },
      { id: 'victim-2', email: 'another@example.org', fullName: 'Another', phone: null },
    ]);

    const result = await sendPasswordResetEmail('%@example.org');

    expect(result.via).toBe('skipped');
    // The critical assertion: no auth identity is created for anyone.
    expect(mocks.reenable).not.toHaveBeenCalled();
    expect(mocks.sendBrandedEmail).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it('never carries the request string into auth when it differs from the matched row', async () => {
    // Not `...Once`: the self-heal refuses, so the link is never re-minted and
    // a queued second value would leak into the following test.
    mocks.generateLink.mockResolvedValue(USER_NOT_FOUND);
    mocks.findMany.mockResolvedValue([
      { id: 'victim-1', email: 'real.person@example.org', fullName: 'Real', phone: null },
    ]);
    mocks.reenable.mockResolvedValue({ ok: true, action: 'recreated' });

    await sendPasswordResetEmail('real_person@example.org');

    // `real_person@…` ILIKE-matches `real.person@…` because `_` is a
    // single-character wildcard. Binding an auth identity under victim-1's id
    // carrying the attacker's address is the exact failure being guarded.
    expect(mocks.reenable).not.toHaveBeenCalled();
  });

  it('still self-heals a legitimate address that contains an underscore', async () => {
    mocks.generateLink.mockResolvedValueOnce(USER_NOT_FOUND).mockResolvedValueOnce(MINTED);
    // The exact row is present alongside a same-shaped collision, so rejecting
    // the whole batch would strand a real member.
    mocks.findMany.mockResolvedValue([
      { id: 'other-1', email: 'jane.doe@example.org', fullName: 'Collision', phone: null },
      { id: 'user-9', email: 'jane_doe@example.org', fullName: 'Jane Doe', phone: null },
    ]);
    mocks.reenable.mockResolvedValue({ ok: true, action: 'recreated' });

    const result = await sendPasswordResetEmail('jane_doe@example.org');

    expect(result).toEqual({ error: null, via: 'resend' });
    expect(mocks.reenable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'user-9', email: 'jane_doe@example.org' }),
    );
  });

  it('does not touch the auth user when the link mints normally', async () => {
    mocks.generateLink.mockResolvedValue(MINTED);
    mocks.findMany.mockResolvedValue([{ id: 'user-1', email: 'jane@example.org', fullName: 'Jane', phone: null }]);

    const result = await sendPasswordResetEmail('jane@example.org');

    expect(result).toEqual({ error: null, via: 'resend' });
    expect(mocks.findMany).toHaveBeenCalled();
    expect(mocks.reenable).not.toHaveBeenCalled();
  });

  it('does not touch Auth when erasure owns the lifecycle before the claim', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'user-1', email: 'jane@example.org', fullName: 'Jane', phone: null }]);
    const { MemberUploadLifecycleError } = await import('@/lib/member/uploadLifecycle');
    mocks.beginClaim.mockRejectedValue(new MemberUploadLifecycleError());

    expect(await sendPasswordResetEmail('jane@example.org')).toMatchObject({ via: 'skipped' });
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.reenable).not.toHaveBeenCalled();
    expect(mocks.sendBrandedEmail).not.toHaveBeenCalled();
  });

  it('refuses a changed address after claiming and before Auth I/O', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ id: 'user-1', email: 'jane@example.org', fullName: 'Jane', phone: null }])
      .mockResolvedValueOnce([]);

    expect(await sendPasswordResetEmail('jane@example.org')).toMatchObject({ via: 'skipped' });
    expect(mocks.releaseClaim).toHaveBeenCalledWith('user-1', 'claim-1');
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it('holds the claim through Auth self-heal and the awaited Resend call', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'user-1', email: 'jane@example.org', fullName: 'Jane', phone: null }]);
    mocks.generateLink.mockResolvedValueOnce(USER_NOT_FOUND).mockResolvedValueOnce(MINTED);
    mocks.reenable.mockImplementation(async () => {
      expect(mocks.releaseClaim).not.toHaveBeenCalled();
      return { ok: true, action: 'recreated' };
    });
    let finishSend!: () => void;
    mocks.sendBrandedEmail.mockImplementation(() => new Promise<void>((resolve) => { finishSend = resolve; }));

    const pending = sendPasswordResetEmail('jane@example.org');
    await vi.waitFor(() => expect(mocks.sendBrandedEmail).toHaveBeenCalledOnce());
    expect(mocks.releaseClaim).not.toHaveBeenCalled();
    finishSend();
    expect(await pending).toMatchObject({ via: 'resend' });
    expect(mocks.releaseClaim).toHaveBeenCalledWith('user-1', 'claim-1');
  });
});
