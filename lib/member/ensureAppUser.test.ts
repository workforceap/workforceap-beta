import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preRead: vi.fn(),
  txRead: vi.fn(),
  upsert: vi.fn(),
  accountRead: vi.fn(),
  memberRoleRead: vi.fn(),
  memberRoleCreate: vi.fn(),
  memberGrant: vi.fn(),
  profileUpsert: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  interactive: vi.fn(),
  getUserById: vi.fn(),
  resolveOrg: vi.fn(),
  requestHeaders: vi.fn(),
  organizationFind: vi.fn(),
}));

const tx = {
  user: {
    findUnique: mocks.txRead,
    upsert: mocks.upsert,
    findUniqueOrThrow: mocks.accountRead,
  },
  role: { findUnique: mocks.memberRoleRead, create: mocks.memberRoleCreate },
  userRole: { createMany: mocks.memberGrant },
  profile: { upsert: mocks.profileUpsert },
  organization: { findUnique: mocks.organizationFind },
};

vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: mocks.preRead }, $transaction: mocks.transaction },
}));
vi.mock('@/lib/db/transactionPolicy', () => ({
  interactiveTransactionsGuaranteed: mocks.interactive,
}));
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: mocks.lock,
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { getUserById: mocks.getUserById } } }),
}));
vi.mock('@/lib/tenant/currentRequestHeaders', () => ({
  tryCurrentRequestHeaders: mocks.requestHeaders,
}));
vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({
  resolveProvisionOrganizationId: mocks.resolveOrg,
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: (fn: () => Promise<unknown>) => fn(),
}));

import { ensureAppUserProvisioned } from './ensureAppUser';

const ID = '10000000-0000-4000-8000-000000000001';
const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const active = { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };
const activeUser = {
  id: ID, organizationId: ORG, profile: null, ...active,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preRead.mockResolvedValue(null);
  mocks.txRead.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue(active);
  mocks.accountRead.mockResolvedValue({
    userRoles: [], employer: null, partnerUser: null, counselorProfile: null,
  });
  mocks.memberRoleRead.mockResolvedValue({ id: 'role-member' });
  mocks.memberRoleCreate.mockResolvedValue({ id: 'role-member' });
  mocks.memberGrant.mockResolvedValue({ count: 1 });
  mocks.profileUpsert.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.lock.mockResolvedValue(undefined);
  mocks.interactive.mockReturnValue(true);
  mocks.getUserById.mockResolvedValue({
    data: { user: {
      id: ID, email: 'fresh@example.test',
      user_metadata: { full_name: 'Fresh Member' },
      app_metadata: { organization_id: ORG },
    } },
    error: null,
  });
  mocks.resolveOrg.mockResolvedValue(ORG);
  mocks.requestHeaders.mockResolvedValue(undefined);
  mocks.organizationFind.mockResolvedValue({ id: ORG, active: true });
});

describe('ensureAppUserProvisioned', () => {
  it('keeps the active User and Profile fast path without Auth or write calls', async () => {
    mocks.preRead.mockResolvedValue({ ...activeUser, profile: { userId: ID } });

    await ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['soft-deleted', { ...activeUser, deletedAt: new Date('2026-09-01'), profile: { userId: ID } }],
    ['deletion pending', { ...activeUser, billingDeletionPendingAt: new Date('2026-09-01'), profile: { userId: ID } }],
    ['operation owned', { ...activeUser, billingDeletionOperationId: 'erase-1', profile: { userId: ID } }],
  ])('rejects the %s fast path before granting access', async (_name, row) => {
    mocks.preRead.mockResolvedValue(row);

    await expect(ensureAppUserProvisioned({ id: ID })).rejects.toThrow('This account is no longer active.');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('keeps read-only audit free of writes or Auth admin lookups', async () => {
    await ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' }, {
      organizationId: ORG, readOnlyAudit: true,
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('locks before reading and provisions from fresh Auth identity and app metadata', async () => {
    mocks.resolveOrg.mockResolvedValue(OTHER_ORG);
    const headers = { get: () => null };
    await ensureAppUserProvisioned({
      id: ID,
      email: 'stale-private@example.test',
      user_metadata: { full_name: 'Stale Name', organization_id: 'untrusted-org' },
      app_metadata: { organization_id: 'stale-org' },
    }, { headers });

    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, ID);
    expect(mocks.getUserById).toHaveBeenCalledExactlyOnceWith(ID);
    expect(mocks.resolveOrg).toHaveBeenCalledWith(expect.objectContaining({
      explicitOrganizationId: undefined, headers,
      appMetadata: { organization_id: ORG },
    }));
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { id: ID },
      create: {
        id: ID, organizationId: OTHER_ORG,
        email: 'fresh@example.test', fullName: 'Fresh Member',
      },
      update: {},
      select: {
        deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true,
      },
    });
    expect(mocks.profileUpsert).toHaveBeenCalledWith({
      where: { userId: ID },
      create: { userId: ID, role: 'member' },
      update: {},
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.txRead.mock.invocationCallOrder[0]);
    expect(mocks.txRead.mock.invocationCallOrder[0]).toBeLessThan(mocks.getUserById.mock.invocationCallOrder[0]);
    expect(mocks.getUserById.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });

  it('uses the locked transaction for a default organization lookup', async () => {
    mocks.resolveOrg.mockImplementation(async (options: { defaultOrgId: () => Promise<string> }) =>
      options.defaultOrgId());
    await ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' });

    expect(mocks.organizationFind).toHaveBeenCalledExactlyOnceWith({
      where: { slug: 'workforceap' }, select: { id: true },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ organizationId: ORG }),
    }));
  });

  it('does not resurrect a hard-erased row from an in-flight stale Auth snapshot', async () => {
    let releaseDeletion: (() => void) | undefined;
    const deletionOwnsLock = new Promise<void>((resolve) => { releaseDeletion = resolve; });
    mocks.lock.mockImplementationOnce(async () => deletionOwnsLock);
    const staleRequest = ensureAppUserProvisioned({ id: ID, email: 'removed-private@example.test' });
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    expect(mocks.txRead).not.toHaveBeenCalled();

    // Auth and the app row are gone before the queued request acquires the lock.
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: null }, error: { status: 404, message: 'User not found' },
    });
    releaseDeletion?.();

    await expect(staleRequest).rejects.toThrow('This sign-in account could not be verified.');
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.memberGrant).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it('refuses a deletion marker committed between the fast read and locked read', async () => {
    let releaseDeletion: (() => void) | undefined;
    const deletionOwnsLock = new Promise<void>((resolve) => { releaseDeletion = resolve; });
    mocks.preRead.mockResolvedValue(activeUser);
    mocks.lock.mockImplementationOnce(async () => deletionOwnsLock);
    const staleRequest = ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' });
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    mocks.txRead.mockResolvedValueOnce({
      ...activeUser, billingDeletionPendingAt: new Date('2026-09-01'),
    });
    releaseDeletion?.();

    await expect(staleRequest).rejects.toThrow('This account is no longer active.');
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('fails closed when fresh Auth lookup errors or returns another identity', async () => {
    for (const reply of [
      { data: { user: null }, error: { status: 503, message: 'Auth unavailable' } },
      { data: { user: { id: 'another-id', email: 'fresh@example.test' } }, error: null },
    ]) {
      mocks.getUserById.mockResolvedValueOnce(reply);
      await expect(ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' }))
        .rejects.toThrow('This sign-in account could not be verified.');
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('preserves an active existing User tenant and fills a missing Profile without Auth lookup', async () => {
    mocks.preRead.mockResolvedValue(activeUser);
    mocks.txRead.mockResolvedValue(activeUser);
    await ensureAppUserProvisioned({ id: ID, email: 'member@example.test' }, {
      organizationId: OTHER_ORG,
    });

    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.resolveOrg).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ organizationId: ORG }),
      update: {},
    }));
    expect(mocks.memberGrant).toHaveBeenCalledOnce();
  });

  it.each([
    ['admin role', { userRoles: [{ role: { name: 'member' } }, { role: { name: 'admin' } }], employer: null, partnerUser: null, counselorProfile: null }, 'admin'],
    ['employer association', { userRoles: [], employer: { id: 'employer-1' }, partnerUser: null, counselorProfile: null }, 'employer'],
    ['counselor association', { userRoles: [], employer: null, partnerUser: null, counselorProfile: { id: 'counselor-1' } }, 'counselor'],
  ])('restores missing Profile from an existing %s without member grant', async (_name, account, role) => {
    mocks.preRead.mockResolvedValue(activeUser);
    mocks.txRead.mockResolvedValue(activeUser);
    mocks.accountRead.mockResolvedValue(account);

    await ensureAppUserProvisioned({ id: ID, email: 'member@example.test' });

    expect(mocks.memberGrant).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: ID, role },
    }));
  });

  it('returns when another request completes both app rows before the locked read', async () => {
    mocks.txRead.mockResolvedValue({ ...activeUser, profile: { userId: ID } });
    await ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' });

    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects a race that upserts a deletion-pending row', async () => {
    mocks.upsert.mockResolvedValue({
      ...active, billingDeletionPendingAt: new Date('2026-09-01'),
    });

    await expect(ensureAppUserProvisioned({ id: ID }))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.memberGrant).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it('maps email P2002 to identity conflict without treating another Auth ID as equivalent', async () => {
    mocks.upsert.mockRejectedValueOnce({ code: 'P2002', message: 'private email collision' });
    mocks.preRead.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(ensureAppUserProvisioned({ id: ID }))
      .rejects.toThrow('APP_USER_PROVISION_IDENTITY_CONFLICT');
    expect(mocks.preRead).toHaveBeenCalledTimes(2);
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it('accepts a concurrent P2002 only after an active same-ID User and Profile committed', async () => {
    mocks.upsert.mockRejectedValueOnce({ code: 'P2002' });
    mocks.preRead.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...activeUser, profile: { userId: ID },
    });

    await ensureAppUserProvisioned({ id: ID });
    expect(mocks.preRead).toHaveBeenCalledTimes(2);
  });

  it('does not accept P2002 readback with a missing Profile or deletion marker', async () => {
    for (const row of [
      activeUser,
      { ...activeUser, profile: { userId: ID }, billingDeletionOperationId: 'erase-1' },
    ]) {
      mocks.preRead.mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row);
      mocks.upsert.mockRejectedValueOnce({ code: 'P2002' });
      await expect(ensureAppUserProvisioned({ id: ID }))
        .rejects.toThrow(row.billingDeletionOperationId
          ? 'This account is no longer active.'
          : 'APP_USER_PROVISION_IDENTITY_CONFLICT');
    }
  });

  it('checks persisted state and fresh Auth on flattened Preview without an advisory lock', async () => {
    mocks.interactive.mockReturnValue(false);
    await ensureAppUserProvisioned({ id: ID, email: 'stale@example.test' });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.getUserById).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('rejects a persisted deletion marker on flattened Preview before role writes', async () => {
    mocks.interactive.mockReturnValue(false);
    mocks.txRead.mockResolvedValue({
      ...activeUser, billingDeletionPendingAt: new Date('2026-09-01'),
    });

    await expect(ensureAppUserProvisioned({ id: ID }))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
