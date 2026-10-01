// @vitest-environment node
// Real orchestration and marker parsing; all Auth/DB boundaries are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), isSuperAdmin: vi.fn(),
  target: vi.fn(), collision: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(),
  restoreAuth: vi.fn(), disableAuth: vi.fn(), audit: vi.fn(), event: vi.fn(),
  org: vi.fn(), query: vi.fn(), execute: vi.fn(),
}));
const db = vi.hoisted(() => ({ $queryRaw: mocks.query, $executeRaw: mocks.execute, user: { findFirst: mocks.target, updateMany: mocks.updateMany, findMany: mocks.findMany } }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.org }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (org: string, fn: (client: typeof db) => Promise<unknown>) => {
    expect(org).toBe('org-1');
    return fn(db);
  },
  crossTenantOK: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: mocks.query, $transaction: (fn: (client: typeof db) => Promise<unknown>) => fn(db),
  user: { findFirst: mocks.collision },
} }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ syntheticProvider: true }) }));
vi.mock('@/lib/admin/authUserLifecycle', () => ({
  reenableAuthUserAfterRestore: mocks.restoreAuth,
  disableAuthUserForSoftDelete: mocks.disableAuth,
}));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.event, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/admin/adminUserProvisioning', () => ({ ADMIN_USER_ROLES: [], ensureProfileRole: vi.fn(), syncManagedUserRoles: vi.fn() }));

import { POST as restore } from '@/app/api/admin/users/[id]/restore/route';
import { POST as freeEmail } from '@/app/api/admin/users/[id]/free-email/route';
import { POST as freeBatch } from '@/app/api/admin/users/free-deleted-emails/route';
import { DELETE as suspend } from '@/app/api/admin/users/[id]/route';
import { buildDeletedEmail } from '@/app/api/admin/users/_deletedEmail';

const ID = '20000000-0000-4000-8000-000000000001';
const ACTOR = '10000000-0000-4000-8000-000000000001';
const deletedAt = new Date('2026-09-08T10:00:00Z');
const marker = buildDeletedEmail(ID, deletedAt.getTime(), 'Member@Example.com')!;
function deletedRow() {
  return { id: ID, email: marker, deletedAt, fullName: 'Synthetic Member', phone: null, profile: { role: 'member' }, userRoles: [] };
}
const req = () => new NextRequest('http://localhost/api/admin/users/fixture', { method: 'POST' });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
type PrivilegedTargetCase = {
  name: string;
  profile: { role: string } | null;
  userRoles: readonly { role: { name: string } }[];
  self?: boolean;
};

const privilegedTargets = [
  { name: 'profile only', profile: { role: 'super_admin' }, userRoles: [] },
  { name: 'UserRole grant only', profile: null, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'both stores privileged', profile: { role: 'super_admin' }, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'stale privileged profile with ordinary grant', profile: { role: 'super_admin' }, userRoles: [{ role: { name: 'member' } }] },
  { name: 'stale ordinary profile with privileged grant', profile: { role: 'member' }, userRoles: [{ role: { name: 'super_admin' } }] },
  { name: 'privileged self', profile: { role: 'super_admin' }, userRoles: [], self: true },
] satisfies readonly PrivilegedTargetCase[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('PRISMA_FLATTEN_TX', '0');
  mocks.query.mockResolvedValue([{ submissions: false, locks: false, isolation: 'read committed' }]);
  mocks.execute.mockResolvedValue(1);
  mocks.getUser.mockResolvedValue({ id: ACTOR });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.org.mockResolvedValue('org-1');
  mocks.target.mockResolvedValue(deletedRow());
  mocks.collision.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findMany.mockResolvedValue([]);
  mocks.restoreAuth.mockResolvedValue({ ok: true, action: 'unbanned' });
  mocks.disableAuth.mockResolvedValue({ ok: true, alreadyMissing: false });
  mocks.audit.mockResolvedValue(undefined);
  mocks.event.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('administrator account restore', () => {
  it.each([false, null])('rejects unauthorized access before reading an account: %s', async (admin) => {
    if (admin === null) mocks.getUser.mockResolvedValue(null);
    else mocks.isAdmin.mockResolvedValue(false);
    const response = await restore(req(), ctx());
    expect(response.status).toBe(admin === null ? 401 : 403);
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
  });

  it('refuses an absent tenant-scoped target without touching Auth', async () => {
    mocks.target.mockResolvedValue(null);
    const response = await restore(req(), ctx());
    expect(response.status).toBe(404);
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
  });

  it.each(privilegedTargets)('denies ordinary admin restore for privileged target: $name', async ({ self, ...roles }) => {
    const targetId = self ? ACTOR : ID;
    mocks.target.mockResolvedValue({ ...deletedRow(), id: targetId, ...roles });

    const response = await restore(req(), ctx(targetId));

    expect(response.status).toBe(403);
    expect(mocks.target).toHaveBeenCalledWith({
      where: { id: targetId },
      select: expect.objectContaining({
        profile: { select: { role: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      }),
    });
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.collision).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it('preserves explicit super-admin authority to restore a privileged account', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.target.mockResolvedValue({
      ...deletedRow(),
      profile: { role: 'super_admin' },
      userRoles: [],
    });

    const response = await restore(req(), ctx());

    expect(response.status).toBe(200);
    expect(mocks.restoreAuth).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });

  it('restores the exact normalized identity before publishing an active app row', async () => {
    const response = await restore(req(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, authRestored: true, restoredEmail: 'member@example.com' });
    expect(mocks.restoreAuth).toHaveBeenCalledWith(expect.anything(), {
      id: ID, email: 'member@example.com', fullName: 'Synthetic Member', phone: null,
    });
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: ID, organizationId: 'org-1', email: marker, deletedAt }, data: { deletedAt: null, email: 'member@example.com' },
    });
    expect(mocks.restoreAuth.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateMany.mock.invocationCallOrder[0]);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });

  it.each(['failure', 'exception'])('keeps the deleted row retryable when Auth restore returns %s', async (mode) => {
    if (mode === 'failure') mocks.restoreAuth.mockResolvedValueOnce({ ok: false, message: 'Synthetic provider failure' });
    else mocks.restoreAuth.mockRejectedValueOnce(new Error('Synthetic network failure'));
    const failed = await restore(req(), ctx());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ ok: false, authRestored: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    const retried = await restore(req(), ctx());
    expect(retried.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it('checks global email collisions before Auth without exposing the foreign identity or address', async () => {
    const foreignId = 'foreign-user-private-identifier';
    mocks.collision.mockResolvedValue({ id: foreignId });

    const response = await restore(req(), ctx());

    expect(response.status).toBe(409);
    expect(mocks.collision).toHaveBeenCalledWith({
      where: { email: { equals: 'member@example.com', mode: 'insensitive' }, NOT: { id: ID } }, select: { id: true },
    });
    const body = await response.json();
    expect(body).toEqual({ error: 'Account cannot be restored because its sign-in email is unavailable.' });
    expect(JSON.stringify(body)).not.toContain(foreignId.slice(0, 8));
    expect(JSON.stringify(body)).not.toContain('member@example.com');
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('treats a lost compare-and-set as success when another restore activated the same identity', async () => {
    mocks.target.mockResolvedValueOnce(deletedRow()).mockResolvedValueOnce({ email: 'MEMBER@example.com', deletedAt: null });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await restore(req(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, authRestored: true });
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });

  it('never bans an active identity that changed address during a conflicting restore', async () => {
    mocks.target.mockResolvedValueOnce(deletedRow()).mockResolvedValueOnce({ email: 'changed@example.com', deletedAt: null });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await restore(req(), ctx());
    expect(response.status).toBe(503);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('preserves Auth after a database failure rather than racing a later successful restore with a re-ban', async () => {
    mocks.updateMany.mockRejectedValueOnce(new Error('Write disconnected'));
    const failed = await restore(req(), ctx());
    expect(failed.status).toBe(503);
    expect((await failed.json()).error).toContain('account reconciliation');
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    const retry = await restore(req(), ctx());
    expect(retry.status).toBe(200);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });

  it('does not guess an Auth rollback when the current app state cannot be read', async () => {
    mocks.target.mockResolvedValueOnce(deletedRow()).mockRejectedValueOnce(new Error('Read failed'));
    mocks.updateMany.mockRejectedValue(new Error('Write failed'));
    const response = await restore(req(), ctx());
    expect(response.status).toBe(503);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });

  it('refuses malformed historical markers before any Auth or app mutation', async () => {
    mocks.target.mockResolvedValue({ ...deletedRow(), email: `deleted_${ID}_123_truncated@example` });
    const response = await restore(req(), ctx());
    expect(response.status).toBe(409);
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe('document safeguards across reversible account changes', () => {
  const installed = { submissions: true, locks: true, isolation: 'read committed' };
  function restoreQueries(owned = true) {
    mocks.query.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const query = sql.join('?');
      if (query.includes('to_regclass')) return [installed];
      if (query.includes('WITH member_lock')) return [{ token: values[3] }];
      if (query.includes('FOR UPDATE')) return [{ id: ID }];
      return [{ present: query.includes("state = 'account_restore'") ? owned : false }];
    });
  }
  it('preserves restore before migration even where transactions are flattened', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await restore(req(), ctx())).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });
  it('allows a guarded restore when no document operation exists', async () => {
    restoreQueries();
    expect((await restore(req(), ctx())).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.query.mock.invocationCallOrder[3]).toBeLessThan(mocks.restoreAuth.mock.invocationCallOrder[0]);
    expect(mocks.query.mock.invocationCallOrder[6]).toBeLessThan(mocks.updateMany.mock.invocationCallOrder[0]);
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]);
    expect(mocks.execute.mock.calls[0].slice(1)).toEqual([ID, 'org-1', mocks.query.mock.calls[3][4]]);
  });
  it('rejects a retained fence before any Auth restore, regardless of feature flag', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    mocks.query.mockResolvedValueOnce([installed]).mockResolvedValueOnce([{ present: true }]);
    const response = await restore(req(), ctx());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ACCOUNT_DOCUMENT_OPERATION_PENDING' });
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it('requires exact restore-fence ownership after Auth and the tenant user lock', async () => {
    restoreQueries(false);
    const response = await restore(req(), ctx());
    expect(response.status).toBe(409);
    expect(mocks.restoreAuth).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ authRestored: true, accountRestored: false, reconciliationRequired: true });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[5].slice(1)).toEqual([ID, 'org-1']);
    expect(mocks.query.mock.invocationCallOrder[5]).toBeLessThan(mocks.query.mock.invocationCallOrder[6]);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(['exception', 'failure'])('retains the restore fence when Auth reports %s', async (mode) => {
    restoreQueries();
    if (mode === 'exception') mocks.restoreAuth.mockRejectedValueOnce(new Error('provider connection lost'));
    else mocks.restoreAuth.mockResolvedValueOnce({ ok: false, message: 'provider failure' });
    const response = await restore(req(), ctx());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ authRestored: null, accountRestored: false, reconciliationRequired: true });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });
  it('retains its restore fence when final app activation is uncertain', async () => {
    restoreQueries();
    mocks.updateMany.mockRejectedValueOnce(new Error('database connection lost'));
    expect((await restore(req(), ctx())).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });
  it('refuses Auth when purge claimed the fence after the initial read', async () => {
    mocks.query.mockResolvedValueOnce([installed]).mockResolvedValueOnce([{ present: false }])
      .mockResolvedValueOnce([installed]).mockResolvedValueOnce([]);
    expect((await restore(req(), ctx())).status).toBe(409);
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    { schema: { ...installed, locks: false }, flattened: false },
    { schema: installed, flattened: true },
    { schema: { ...installed, isolation: 'repeatable read' }, flattened: false },
  ])('fails closed before Auth without complete interactive safeguards: %j', async ({ schema, flattened }) => {
    if (flattened) vi.stubEnv('VERCEL_ENV', 'preview');
    mocks.query.mockResolvedValue([schema]);
    expect((await restore(req(), ctx())).status).toBe(503);
    expect(mocks.restoreAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it('blocks suspension while an upload or erasure fence exists', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([installed]).mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([{ present: true }]);
    expect((await suspend(req(), ctx())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });
  it('keeps ordinary suspension reversible and preserves its original retention date', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.query.mockResolvedValueOnce([installed]).mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([{ present: false }]);
    expect((await suspend(req(), ctx())).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: ID, organizationId: 'org-1', email: marker, deletedAt },
      data: { deletedAt, email: marker },
    });
    expect(mocks.disableAuth).toHaveBeenCalledOnce();
  });
});

describe('administrator email release', () => {
  it('repairs an already-marked app row by retiring its exact Auth address', async () => {
    const response = await freeEmail(req(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, alreadyFreed: true, originalEmail: 'Member@Example.com' });
    expect(mocks.disableAuth).toHaveBeenCalledWith(expect.anything(), ID, 'Member@Example.com');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('does not rewrite the app email when Auth retirement fails', async () => {
    mocks.target.mockResolvedValue({ ...deletedRow(), email: 'member@example.com' });
    mocks.disableAuth.mockResolvedValue({ ok: false, message: 'Provider unavailable' });
    const response = await freeEmail(req(), ctx());
    expect(response.status).toBe(502);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('does not claim a released email if its conditional app update loses', async () => {
    mocks.target.mockResolvedValue({ ...deletedRow(), email: 'member@example.com' });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await freeEmail(req(), ctx());
    expect(response.status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { profile: { role: 'super_admin' }, userRoles: [] },
    { profile: { role: 'member' }, userRoles: [{ role: { name: 'admin' } }] },
  ])('protects administrator identities across role stores: %j', async (roles) => {
    mocks.target.mockResolvedValue({ ...deletedRow(), ...roles });
    const response = await freeEmail(req(), ctx());
    expect(response.status).toBe(403);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('protects the caller even if their target profile role is stale', async () => {
    mocks.target.mockResolvedValue({ ...deletedRow(), id: ACTOR });
    const response = await freeEmail(req(), ctx(ACTOR));
    expect(response.status).toBe(403);
    expect(mocks.disableAuth).not.toHaveBeenCalled();
  });

  it('counts failed batch provider operations as skipped and preserves admin identities', async () => {
    mocks.findMany.mockResolvedValue([
      { ...deletedRow(), email: 'member@example.com' },
      { ...deletedRow(), id: 'admin-target', email: 'staff@example.com', profile: { role: 'super_admin' } },
    ]);
    mocks.disableAuth.mockRejectedValue(new Error('Provider disconnected'));
    const response = await freeBatch(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, freed: 0, skipped: 2, total: 2 });
    expect(mocks.disableAuth).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
