import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  interactive: vi.fn(),
  getUserById: vi.fn(),
  resolveOrg: vi.fn(),
}));

const tx = { user: { findUnique: mocks.findUnique, upsert: mocks.upsert } };
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: mocks.interactive }));
vi.mock('@/lib/billing/erasureGuard', () => ({ lockBillingMemberLifecycle: mocks.lock }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { getUserById: mocks.getUserById } } }),
}));
vi.mock('@/lib/tenant/currentRequestHeaders', () => ({ tryCurrentRequestHeaders: async () => undefined }));
vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({ resolveProvisionOrganizationId: mocks.resolveOrg }));

import { ensureUserInDb } from '@/lib/auth/ensureUser';

const ID = '10000000-0000-4000-8000-000000000001';
const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const active = { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.interactive.mockReturnValue(true);
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.lock.mockResolvedValue(undefined);
  mocks.findUnique.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue(active);
  mocks.resolveOrg.mockResolvedValue(ORG);
  mocks.getUserById.mockResolvedValue({
    data: { user: { id: ID, email: 'fresh@example.test', user_metadata: { full_name: 'Fresh Member' } } },
    error: null,
  });
});

describe('ensureUserInDb lifecycle guard', () => {
  it('locks before reading and provisions a verified Auth identity with the resolved tenant', async () => {
    await ensureUserInDb({ id: ID, email: 'stale@example.test' }, { organizationId: ORG });

    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: ID },
      select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
    });
    expect(mocks.getUserById).toHaveBeenCalledExactlyOnceWith(ID);
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { id: ID },
      create: { id: ID, organizationId: ORG, email: 'fresh@example.test', fullName: 'Fresh Member' },
      update: {},
      select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.getUserById.mock.invocationCallOrder[0]);
    expect(mocks.getUserById.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });

  it('passes trusted tenant inputs through without changing an existing row', async () => {
    mocks.findUnique.mockResolvedValue(active);
    const headers = { get: (name: string) => name === 'x-wap-org-id' ? ORG : null };
    await ensureUserInDb({
      id: ID, email: 'member@example.test', app_metadata: { organization_id: ORG },
      user_metadata: { organization_id: 'untrusted-org' },
    }, { headers, programSlug: 'program-a' });

    expect(mocks.resolveOrg).toHaveBeenCalledWith({
      explicitOrganizationId: undefined,
      headers,
      appMetadata: { organization_id: ORG },
      programSlug: 'program-a',
    });
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['soft-deleted', { ...active, deletedAt: new Date('2026-09-01') }],
    ['deletion pending', { ...active, billingDeletionPendingAt: new Date('2026-09-01') }],
    ['operation owned', { ...active, billingDeletionOperationId: 'operation-1' }],
  ])('refuses an existing %s account before any downstream result can be saved', async (_name, row) => {
    mocks.findUnique.mockResolvedValue(row);
    await expect(ensureUserInDb({ id: ID, email: 'stale@example.test' }))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not resurrect a hard-deleted row from an in-flight stale Auth snapshot', async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: null }, error: { status: 404, message: 'User not found' },
    });
    await expect(ensureUserInDb({ id: ID, email: 'old-private@example.test' }))
      .rejects.toThrow('This sign-in account could not be verified.');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('refuses provisioning when erasure finishes while the request is still resolving its tenant', async () => {
    let resumeRequest: (() => void) | undefined;
    const tenantResolution = new Promise<string>((resolve) => {
      resumeRequest = () => resolve(ORG);
    });
    mocks.resolveOrg.mockReturnValueOnce(tenantResolution);

    // The initial request has an authenticated user snapshot. While it awaits
    // tenant resolution, Auth and the app row are permanently removed.
    const staleRequest = ensureUserInDb({ id: ID, email: 'removed-private@example.test' });
    await vi.waitFor(() => expect(mocks.resolveOrg).toHaveBeenCalledOnce());
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: null }, error: { status: 404, message: 'User not found' },
    });
    resumeRequest?.();

    await expect(staleRequest).rejects.toThrow('This sign-in account could not be verified.');
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('fails closed on an uncertain Auth lookup or identity mismatch', async () => {
    for (const reply of [
      { data: { user: null }, error: { status: 503, message: 'Auth unavailable' } },
      { data: { user: { id: 'another-id', email: 'member@example.test' } }, error: null },
    ]) {
      mocks.getUserById.mockResolvedValueOnce(reply);
      await expect(ensureUserInDb({ id: ID, email: 'old-private@example.test' }))
        .rejects.toThrow('This sign-in account could not be verified.');
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not treat an email uniqueness collision as permission to rebind another identity', async () => {
    mocks.upsert.mockRejectedValueOnce({ code: 'P2002' });
    await expect(ensureUserInDb({ id: ID, email: 'member@example.test' }))
      .rejects.toThrow('Account identity conflict.');
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('checks an existing row created by another signup instead of changing its tenant', async () => {
    mocks.upsert.mockResolvedValueOnce({ ...active, billingDeletionPendingAt: new Date('2026-09-01') });
    await expect(ensureUserInDb({ id: ID, email: 'member@example.test' }))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });

  it('rethrows database failures and does not retry a partial write', async () => {
    const failure = new Error('Database connection failed');
    mocks.upsert.mockRejectedValueOnce(failure);
    await expect(ensureUserInDb({ id: ID, email: 'member@example.test' })).rejects.toBe(failure);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('waits for a committed deletion barrier before reading the member', async () => {
    let releaseDeletion: (() => void) | undefined;
    const deletionOwnsLock = new Promise<void>((resolve) => { releaseDeletion = resolve; });
    let state: {
      deletedAt: Date | null;
      billingDeletionPendingAt: Date | null;
      billingDeletionOperationId: string | null;
    } = active;
    mocks.lock.mockImplementationOnce(async () => deletionOwnsLock);
    mocks.findUnique.mockImplementation(async () => state);

    const result = ensureUserInDb({ id: ID, email: 'old-private@example.test' });
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    expect(mocks.findUnique).not.toHaveBeenCalled();
    state = { ...active, billingDeletionPendingAt: new Date('2026-09-01') };
    releaseDeletion?.();

    await expect(result).rejects.toThrow('This account is no longer active.');
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('still checks a persisted deletion marker on flattened Preview without attempting an advisory lock', async () => {
    mocks.interactive.mockReturnValue(false);
    mocks.findUnique.mockResolvedValue({ ...active, billingDeletionPendingAt: new Date('2026-09-01') });
    await expect(ensureUserInDb({ id: ID, email: 'member@example.test' }))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('allows a new verified Auth user on flattened Preview where billing erasure is disabled', async () => {
    mocks.interactive.mockReturnValue(false);
    await ensureUserInDb({ id: ID, email: 'stale@example.test' });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
});
