import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  getProfileRole: vi.fn(),
  getStoredRoleIdentity: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/auth/portalRoleSwitcher', () => ({
  getPortalSwitcherRoles: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/components/portal/MemberWorkspaceShell', () => ({
  default: vi.fn(({ children }) => <div data-testid="member-shell">{children}</div>),
}));

vi.mock('@/lib/tours/getTourOffer', () => ({
  getTourOffer: vi.fn(async () => null),
}));

import DashboardLayout from '@/app/(portal)/dashboard/layout';
import { getUser } from '@/lib/auth/server';
import { getProfileRole, getStoredRoleIdentity, isSuperAdmin } from '@/lib/auth/roles';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { prisma } from '@/lib/db/prisma';
import { getTourOffer } from '@/lib/tours/getTourOffer';

const memberRole = { role: 'member' as const, roleLabel: 'Member', homeHref: '/dashboard' };
const employerRole = { role: 'employer' as const, roleLabel: 'Employer', homeHref: '/employer' };
const partnerRole = { role: 'partner' as const, roleLabel: 'Partner', homeHref: '/partner' };
const counselorRole = { role: 'counselor' as const, roleLabel: 'Counselor', homeHref: '/counselor' };
const adminRole = { role: 'admin' as const, roleLabel: 'Admin', homeHref: '/admin' };

describe('DashboardLayout portal switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'member' });
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      deletedAt: null,
      profile: { resumeOriginalPath: null, resumeEnhancedPath: null },
    } as any);
  });

  it('still redirects regular admins to the admin portal', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('admin');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'admin' });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([adminRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/admin');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['employer', employerRole, '/employer'],
    ['partner', partnerRole, '/partner'],
    ['counselor', counselorRole, '/counselor'],
  ] as const)('redirects %s-only users before loading member data', async (role, switcherRole, destination) => {
    vi.mocked(getProfileRole).mockResolvedValue(role);
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: role });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([switcherRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow(`REDIRECT:${destination}`);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(getTourOffer).not.toHaveBeenCalled();
  });

  it('denies an employer association even when the profile role says member', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([employerRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/employer');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies a baseline member row alongside employer access', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('employer');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'employer' });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, employerRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/employer');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies a baseline member row alongside regular admin access', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('admin');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'admin' });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, adminRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/admin');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows an existing member profile without a role row', async () => {
    await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('denies an ambiguous member profile with an employer association', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, employerRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/employer');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not bounce a case manager through the admin portal', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('case_manager');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'case_manager' });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['an Auth-only orphan', { userExists: false, deletedAt: null, profileRole: null }],
    ['a missing profile', { userExists: true, deletedAt: null, profileRole: null }],
    ['a soft-deleted member', { userExists: true, deletedAt: new Date(), profileRole: 'member' }],
  ])('denies %s before member data loads', async (_label, identity) => {
    vi.mocked(getStoredRoleIdentity).mockResolvedValue(identity);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies a non-member profile fallback without an explicit member role', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('employer');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'employer' });
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole]);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when portal roles cannot be resolved', async () => {
    vi.mocked(getPortalSwitcherRoles).mockRejectedValue(new Error('role lookup unavailable'));

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('role lookup unavailable');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(getTourOffer).not.toHaveBeenCalled();
  });

  it('fails closed when stored identity cannot be resolved', async () => {
    vi.mocked(getStoredRoleIdentity).mockRejectedValue(new Error('identity lookup unavailable'));

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('identity lookup unavailable');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows super admins to render the member dashboard for demos', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('super_admin');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'super_admin' });
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, employerRole, partnerRole, counselorRole, adminRole]);

    await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
    expect(getPortalSwitcherRoles).toHaveBeenCalledWith('user-1', { superAdmin: true });
    expect(isSuperAdmin).toHaveBeenCalledWith('user-1');
  });

  it('keeps the superadmin switcher when UserRole grants super_admin and profile is member', async () => {
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, employerRole, partnerRole, counselorRole, adminRole]);

    await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();

    expect(getPortalSwitcherRoles).toHaveBeenCalledWith('user-1', { superAdmin: true });
  });
});
