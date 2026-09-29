/**
 * WAP-182 item 1: `user_roles` is the source of truth for `getProfileRole`.
 * Prisma is mocked at the delegate boundary; the real resolver runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db), ...db } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: log }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { getProfileRole, getStoredRoleIdentity, getUserRoles, isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { ROLE_PRECEDENCE, resolveEffectiveRole } from '@/lib/auth/roleAccess';

type Row = { deletedAt: Date | null; profile: { role: string } | null; userRoles: { role: { name: string } }[] };

function user(profileRole: string | null, roleNames: string[], deletedAt: Date | null = null): Row {
  return {
    deletedAt,
    profile: profileRole === null ? null : { role: profileRole },
    userRoles: roleNames.map((name) => ({ role: { name } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getProfileRole resolves from user_roles first', () => {
  it('a user_roles row wins over a stale profiles.role', async () => {
    db.user.findUnique.mockResolvedValue(user('admin', ['member', 'counselor']));
    expect(await getProfileRole('u-1')).toBe('counselor');
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u-1' } }));
    expect(log.debug).not.toHaveBeenCalled();
  });

  it('a promoted row grants access the profile never recorded', async () => {
    db.user.findUnique.mockResolvedValue(user('member', ['member', 'admin']));
    expect(await getProfileRole('u-2')).toBe('admin');
    expect(await isAdmin('u-2')).toBe(true);
  });

  // Runs before any other profile-sourced case: the debug log fires once per process.
  it('falls back to profiles.role when there is no row and logs once without PII', async () => {
    db.user.findUnique.mockResolvedValue(user('employer', []));
    expect(await getProfileRole('u-3')).toBe('employer');
    db.user.findUnique.mockResolvedValue(user('counselor', []));
    expect(await getProfileRole('u-4')).toBe('counselor');
    expect(log.debug).toHaveBeenCalledTimes(1);
    const [message, context] = log.debug.mock.calls[0];
    expect(message).toMatch(/profiles\.role/);
    expect(JSON.stringify(context)).not.toMatch(/u-3|u-4|employer|counselor|@/);
  });

  it('the baseline member row does not mask a promotion recorded only on the profile', async () => {
    db.user.findUnique.mockResolvedValue(user('counselor', ['member']));
    expect(await getProfileRole('u-c')).toBe('counselor');
    db.user.findUnique.mockResolvedValue(user('admin', ['member']));
    expect(await getProfileRole('u-a')).toBe('admin');
    expect(await isAdmin('u-a')).toBe(true);
    db.user.findUnique.mockResolvedValue(user('partner', ['member']));
    expect(await getProfileRole('u-p')).toBe('partner');
    db.user.findUnique.mockResolvedValue(user('member', ['member']));
    expect(await getProfileRole('u-m')).toBe('member');
    expect(await isAdmin('u-m')).toBe(false);
  });

  it('several rows resolve to the most privileged by ROLE_PRECEDENCE', async () => {
    db.user.findUnique.mockResolvedValue(user('member', ['partner', 'member', 'admin', 'employer']));
    expect(await getProfileRole('u-5')).toBe('admin');
    db.user.findUnique.mockResolvedValue(user('member', ['employer', 'case_manager']));
    expect(await getProfileRole('u-6')).toBe('case_manager');
    expect([...ROLE_PRECEDENCE]).toEqual(['super_admin', 'admin', 'case_manager', 'counselor', 'employer', 'partner', 'member']);
  });

  it('a soft-deleted user is a member whatever either store says', async () => {
    db.user.findUnique.mockResolvedValue(user('super_admin', ['super_admin', 'admin'], new Date('2026-09-01T00:00:00Z')));
    expect(await getProfileRole('u-7')).toBe('member');
    expect(await isSuperAdmin('u-7')).toBe(false);
    expect(await isAdmin('u-7')).toBe(false);
  });

  it('an unknown user or an empty profile defaults to member', async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await getProfileRole('u-missing')).toBe('member');
    expect(await getStoredRoleIdentity('u-missing')).toEqual({ userExists: false, deletedAt: null, profileRole: null });
    db.user.findUnique.mockResolvedValue(user(null, []));
    expect(await getProfileRole('u-no-profile')).toBe('member');
    expect(await getStoredRoleIdentity('u-no-profile')).toEqual({ userExists: true, deletedAt: null, profileRole: null });
  });

  it('exposes the stored profile role separately from effective role precedence', async () => {
    db.user.findUnique.mockResolvedValue(user('member', ['member', 'employer']));
    expect(await getProfileRole('u-conflict')).toBe('employer');
    expect(await getStoredRoleIdentity('u-conflict')).toEqual({ userExists: true, deletedAt: null, profileRole: 'member' });
  });

  it('a super_admin profile is not demoted by a lesser row until item 2 writes the super_admin row', async () => {
    db.user.findUnique.mockResolvedValue(user('super_admin', ['admin']));
    expect(await getProfileRole('u-8')).toBe('super_admin');
    db.user.findUnique.mockResolvedValue(user('super_admin', ['member', 'super_admin']));
    expect(await getProfileRole('u-9')).toBe('super_admin');
  });

  it('getUserRoles shares the single identity read and ignores rows of soft-deleted users', async () => {
    db.user.findUnique.mockResolvedValue(user('member', ['member', 'admin']));
    expect(await getUserRoles('u-10')).toEqual(['member', 'admin']);
    db.user.findUnique.mockResolvedValue(user('admin', ['member', 'admin'], new Date('2026-09-01T00:00:00Z')));
    expect(await getUserRoles('u-11')).toEqual([]);
  });

  it('isAdmin resolves profile and rows from one round-trip', async () => {
    db.user.findUnique.mockResolvedValue(user('member', ['member', 'admin']));
    expect(await isAdmin('u-12')).toBe(true);
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('resolveEffectiveRole (pure)', () => {
  it('normalises names and ignores role names outside the vocabulary', () => {
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: 'Case Manager', userRoleNames: [] })).toEqual({ role: 'case_manager', source: 'profile' });
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: 'admin', userRoleNames: ['mentor'] })).toEqual({ role: 'admin', source: 'profile' });
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: 'counselor', userRoleNames: ['member'] })).toEqual({ role: 'counselor', source: 'profile' });
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: 'member', userRoleNames: ['member'] })).toEqual({ role: 'member', source: 'profile' });
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: null, userRoleNames: ['Partner'] })).toEqual({ role: 'partner', source: 'user_roles' });
    expect(resolveEffectiveRole({ deletedAt: null, profileRole: null, userRoleNames: [] })).toEqual({ role: 'member', source: 'default' });
    expect(resolveEffectiveRole({ deletedAt: new Date(), profileRole: 'admin', userRoleNames: ['admin'] })).toEqual({ role: 'member', source: 'deleted' });
  });
});
