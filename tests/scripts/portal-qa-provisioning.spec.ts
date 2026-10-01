import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const db = {
    organization: { findUnique: vi.fn() }, user: { count: vi.fn(), create: vi.fn() },
    role: { findUniqueOrThrow: vi.fn() }, partner: { create: vi.fn() },
    partnerReferral: { createMany: vi.fn() }, employer: { findUniqueOrThrow: vi.fn() },
    aIJobMatch: { createMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(), $disconnect: vi.fn(),
  };
  const auth = { listUsers: vi.fn(), createUser: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn() };
  return { db, auth, prismaConstructor: vi.fn(), clientConstructor: vi.fn() };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor(options: unknown) { mocks.prismaConstructor(options); return mocks.db; } },
  ApplicationStatus: { PENDING: 'PENDING' },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => {
  mocks.clientConstructor(...args); return { auth: { admin: mocks.auth } };
} }));

import { syncPortalTestAuth } from '../../scripts/sync-portal-test-auth';

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORTAL_QA_TARGET: 'demo',
    NEXT_PUBLIC_SUPABASE_URL: 'https://esbdrgaonplpvzmtrdhw.supabase.co',
    POSTGRES_PRISMA_URL: 'postgresql://postgres:example@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-demo-admin-key',
    PORTAL_QA_ORGANIZATION_ID: 'qa-org', PORTAL_QA_ORGANIZATION_SLUG: 'portal-qa-test',
    ...Object.fromEntries(['member', 'partner', 'employer', 'admin', 'counselor'].map(role => [
      `PORTAL_QA_${role.toUpperCase()}_PASSWORD`, `${role}-unique-fixture-secret-123456`,
    ])),
  };
}

describe('portal fixture provisioning boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.organization.findUnique.mockResolvedValue({ id: 'qa-org', slug: 'portal-qa-test', active: true });
    mocks.db.user.count.mockResolvedValue(0);
    mocks.db.role.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { name: string } }) => ({ id: `role-${where.name}` }));
    mocks.db.$queryRaw.mockResolvedValue(Object.entries({
      organizations: ['stripe_subscription_id', 'stripe_subscription_event_at', 'stripe_subscription_event_id', 'stripe_subscription_revision'],
      employers: ['stripe_subscription_event_id', 'stripe_subscription_revision'],
      profiles: ['profile_photo_path'],
    }).flatMap(([table_name, names]) => names.map(column_name => ({ table_name, column_name }))));
    mocks.db.partner.create.mockResolvedValue({ id: 'fixture-partner' });
    mocks.db.employer.findUniqueOrThrow.mockResolvedValue({ jobs: [] });
    mocks.auth.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mocks.auth.createUser.mockImplementation(async ({ email }: { email: string }) => ({ data: { user: { id: `auth-${email}` } }, error: null }));
    mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.db) => Promise<void>) => callback(mocks.db));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects production before constructing either client', async () => {
    await expect(syncPortalTestAuth({ ...env(), VERCEL_ENV: 'production' })).rejects.toThrow('non-production');
    expect(mocks.prismaConstructor).not.toHaveBeenCalled();
    expect(mocks.clientConstructor).not.toHaveBeenCalled();
  });

  it('rejects a fixture organization mismatch before any Auth mutation', async () => {
    mocks.db.organization.findUnique.mockResolvedValue({ id: 'qa-org', slug: 'workforceap', active: true });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
  });

  it('refuses existing rows instead of deleting/replacing them', async () => {
    mocks.db.user.count.mockResolvedValue(1);
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.db.user.count).toHaveBeenCalledWith({ where: { email: { in: expect.arrayContaining(['counselor-test@workforceap.org']), mode: 'insensitive' } } });
    expect(mocks.auth.listUsers).not.toHaveBeenCalled();
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
  });

  it('walks Auth pages and refuses an existing account without resetting its password', async () => {
    mocks.auth.listUsers.mockResolvedValueOnce({ data: { users: Array.from({ length: 200 }, () => ({ email: 'unrelated@example.invalid' })) }, error: null })
      .mockResolvedValueOnce({ data: { users: [{ email: 'ADMIN-TEST@WORKFORCEAP.ORG' }] }, error: null });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 });
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
    expect(mocks.auth.updateUserById).not.toHaveBeenCalled();
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects incomplete Auth inventory rather than assuming fixture absence', async () => {
    mocks.auth.listUsers.mockResolvedValue({ data: { users: Array.from({ length: 200 }, () => ({ email: 'unrelated@example.invalid' })) }, error: null });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.listUsers).toHaveBeenCalledTimes(100);
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
  });

  it('refuses an existing counselor Auth account before creating any fixture', async () => {
    mocks.auth.listUsers.mockResolvedValue({ data: { users: [{ email: 'COUNSELOR-TEST@WORKFORCEAP.ORG' }] }, error: null });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('requires the counselor role before creating any Auth account', async () => {
    mocks.db.role.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { name: string } }) => {
      if (where.name === 'counselor') throw new Error('missing counselor role');
      return { id: `role-${where.name}` };
    });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.listUsers).not.toHaveBeenCalled();
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('stops before Auth creation when DEMO lacks columns needed by the Preview app', async () => {
    mocks.db.$queryRaw.mockResolvedValue([{ table_name: 'organizations', column_name: 'stripe_subscription_id' }]);
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.listUsers).not.toHaveBeenCalled();
    expect(mocks.auth.createUser).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('binds the validated database and creates a distinct, org-scoped counselor with the Auth ID', async () => {
    const config = env();
    await syncPortalTestAuth(config);
    expect(mocks.prismaConstructor).toHaveBeenCalledWith({ datasourceUrl: config.POSTGRES_PRISMA_URL });
    expect(mocks.auth.createUser.mock.calls.map(([call]) => call.email)).toEqual([
      'member-test@workforceap.org', 'partner-test@workforceap.org',
      'employer-test@workforceap.org', 'admin-test@workforceap.org',
      'counselor-test@workforceap.org',
    ]);
    expect(new Set(mocks.auth.createUser.mock.calls.map(([call]) => call.password)).size).toBe(5);
    expect(mocks.db.role.findUniqueOrThrow).toHaveBeenCalledWith({ where: { name: 'counselor' } });
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.db.employer.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { userId: 'auth-employer-test@workforceap.org' },
      select: { jobs: { select: { id: true, title: true } } },
    });
    expect(mocks.db.partner.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'qa-org', notifyOnEnrollment: false }) }));
    for (const [call] of mocks.db.user.create.mock.calls) expect(call.data.organizationId).toBe('qa-org');
    expect(mocks.db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'auth-counselor-test@workforceap.org',
        organizationId: 'qa-org',
        email: 'counselor-test@workforceap.org',
        userRoles: { create: { roleId: 'role-counselor' } },
        profile: { create: { consentTerms: true, role: 'counselor' } },
        counselorProfile: { create: { affiliation: 'wap_staff', active: true } },
      }),
    });
    const output = JSON.stringify(vi.mocked(console.log).mock.calls);
    for (const [key, value] of Object.entries(config)) if (key.endsWith('_PASSWORD')) expect(output).not.toContain(value);
  });

  it('reports only the four newly created Auth IDs if counselor Auth creation fails', async () => {
    mocks.auth.createUser.mockImplementation(async ({ email }: { email: string }) => email.startsWith('counselor-')
      ? { data: { user: null }, error: { message: 'SENSITIVE_PROVIDER_CONTEXT' } }
      : { data: { user: { id: `auth-${email}` } }, error: null });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.createUser).toHaveBeenCalledTimes(5);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.auth.updateUserById).not.toHaveBeenCalled();
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('New fixture Auth IDs requiring inspection:', [
      'auth-member-test@workforceap.org', 'auth-partner-test@workforceap.org',
      'auth-employer-test@workforceap.org', 'auth-admin-test@workforceap.org',
    ].join(', '));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('SENSITIVE_PROVIDER_CONTEXT');
  });

  it('rechecks the exact organization inside the Prisma transaction after Auth creation', async () => {
    mocks.db.organization.findUnique
      .mockResolvedValueOnce({ id: 'qa-org', slug: 'portal-qa-test', active: true })
      .mockResolvedValueOnce({ id: 'qa-org', slug: 'other-org', active: true });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(mocks.auth.createUser).toHaveBeenCalledTimes(5);
    expect(mocks.db.user.create).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('New fixture Auth IDs requiring inspection:', expect.stringContaining('auth-counselor-test@workforceap.org'));
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
  });

  it('does not dump provider errors or undo unrelated accounts after partial creation', async () => {
    mocks.auth.createUser.mockResolvedValueOnce({ data: { user: { id: 'new-fixture-id' } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'SENSITIVE_PROVIDER_CONTEXT' } });
    await expect(syncPortalTestAuth(env())).rejects.toThrow('provisioning stopped');
    expect(console.error).toHaveBeenCalledWith('New fixture Auth IDs requiring inspection:', 'new-fixture-id');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('SENSITIVE_PROVIDER_CONTEXT');
    expect(mocks.auth.updateUserById).not.toHaveBeenCalled();
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
