/**
 * Member-dashboard entitlement (#2605): a baseline `user_roles.member` row on
 * a staff account is not enough. Mixed portal identities stay out unless the
 * stored profile, the effective role, and the switcher all say member-only.
 * Super-admins are the explicit exception. Soft-deleted and missing users
 * are denied even if a role lookup would otherwise pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

vi.mock('@/lib/db/withDbRetry', () => ({
  withDbRetry: (fn: () => Promise<unknown>) => fn(),
}));

const mocks = vi.hoisted(() => ({
  provision: vi.fn(async () => undefined),
  getProfileRole: vi.fn(),
  isSuperAdmin: vi.fn(),
  getStoredRoleIdentity: vi.fn(),
  getPortalSwitcherRoles: vi.fn(),
}));

vi.mock('@/lib/member/ensureCurrentAppUserProvisioned', () => ({
  ensureCurrentAppUserProvisioned: mocks.provision,
}));

vi.mock('@/lib/auth/roles', () => ({
  getProfileRole: mocks.getProfileRole,
  isSuperAdmin: mocks.isSuperAdmin,
  getStoredRoleIdentity: mocks.getStoredRoleIdentity,
}));

vi.mock('@/lib/auth/portalRoleSwitcher', () => ({
  getPortalSwitcherRoles: mocks.getPortalSwitcherRoles,
}));

import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';

const USER = 'user-member-access';

function role(name: PortalSwitcherRole['role'], homeHref: string): PortalSwitcherRole {
  return { role: name, roleLabel: name, homeHref };
}

function memberOnlySwitcher(): PortalSwitcherRole[] {
  return [role('member', '/dashboard')];
}

function staffSwitcher(): PortalSwitcherRole[] {
  return [role('employer', '/employer'), role('admin', '/admin')];
}

function mixedSwitcher(): PortalSwitcherRole[] {
  return [role('member', '/dashboard'), role('admin', '/admin')];
}

function livingMemberIdentity() {
  return { userExists: true, deletedAt: null, profileRole: 'member' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.provision.mockResolvedValue(undefined);
  mocks.getProfileRole.mockResolvedValue('member');
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getStoredRoleIdentity.mockResolvedValue(livingMemberIdentity());
  mocks.getPortalSwitcherRoles.mockResolvedValue(memberOnlySwitcher());
});

describe('getMemberDashboardAccess', () => {
  it('admits a living member-only account and waits for provisioning first', async () => {
    const access = await getMemberDashboardAccess(USER);
    expect(mocks.provision).toHaveBeenCalledExactlyOnceWith(USER);
    expect(mocks.getPortalSwitcherRoles).toHaveBeenCalledExactlyOnceWith(USER, { superAdmin: false });
    expect(access).toEqual({
      portalRoles: memberOnlySwitcher(),
      superAdmin: false,
      redirectTo: null,
    });
  });

  it('admits a super-admin even when the switcher lists other portals', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.getProfileRole.mockResolvedValue('super_admin');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'super_admin',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(staffSwitcher());

    const access = await getMemberDashboardAccess(USER);
    expect(access.redirectTo).toBeNull();
    expect(access.superAdmin).toBe(true);
    expect(mocks.getPortalSwitcherRoles).toHaveBeenCalledExactlyOnceWith(USER, { superAdmin: true });
  });

  it('refuses a staff account whose only member row is the baseline grant', async () => {
    mocks.getProfileRole.mockResolvedValue('admin');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'admin',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(staffSwitcher());

    const access = await getMemberDashboardAccess(USER);
    expect(access.redirectTo).toBe('/admin');
  });

  it('still refuses when the switcher incorrectly lists member next to another portal', async () => {
    mocks.getPortalSwitcherRoles.mockResolvedValue(mixedSwitcher());

    const access = await getMemberDashboardAccess(USER);
    expect(access.redirectTo).toBe('/admin');
  });

  it('sends an admin-profile account to the admin home even if employer is listed first', async () => {
    mocks.getProfileRole.mockResolvedValue('admin');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'admin',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(staffSwitcher());

    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/admin');
  });

  it('sends a non-admin staff account to the first non-member portal home', async () => {
    mocks.getProfileRole.mockResolvedValue('employer');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'employer',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(staffSwitcher());

    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/employer');
  });

  it('falls back to / when there is no other portal home', async () => {
    mocks.getProfileRole.mockResolvedValue('case_manager');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'case_manager',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue([]);

    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/');
  });

  it('denies a soft-deleted account, including a super-admin', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.getProfileRole.mockResolvedValue('super_admin');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: new Date('2026-09-01T00:00:00Z'),
      profileRole: 'super_admin',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(staffSwitcher());

    const access = await getMemberDashboardAccess(USER);
    expect(access.redirectTo).not.toBeNull();
    expect(access.redirectTo).toBe('/employer');
  });

  it('denies a missing user even if role lookups look like a member', async () => {
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: false,
      deletedAt: null,
      profileRole: 'member',
    });

    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/');
  });

  it('requires both the stored profile role and the effective role to be member', async () => {
    mocks.getProfileRole.mockResolvedValue('counselor');
    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/');

    mocks.getProfileRole.mockResolvedValue('member');
    mocks.getStoredRoleIdentity.mockResolvedValue({
      userExists: true,
      deletedAt: null,
      profileRole: 'Admin',
    });
    mocks.getPortalSwitcherRoles.mockResolvedValue(memberOnlySwitcher());
    expect((await getMemberDashboardAccess(USER)).redirectTo).toBe('/');
  });

  it('rejects when provisioning fails so role reads cannot run on an Auth-only snapshot', async () => {
    mocks.provision.mockRejectedValueOnce(new Error('Authenticated user changed during application provisioning'));
    await expect(getMemberDashboardAccess(USER)).rejects.toThrow(/provisioning/i);
    expect(mocks.getProfileRole).not.toHaveBeenCalled();
    expect(mocks.getStoredRoleIdentity).not.toHaveBeenCalled();
  });
});
