import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const reqHeaders = vi.hoisted(() => ({ path: '/dashboard' }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-pathname': reqHeaders.path })),
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

vi.mock('@/lib/member/ensureCurrentAppUserProvisioned', () => ({
  ensureCurrentAppUserProvisioned: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      findUnique: vi.fn(),
    },
    memberEvent: {
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/components/portal/PreassessmentLoginPrompt', () => ({
  default: vi.fn(({ loginCount }: { loginCount: number }) => <div data-testid="preassessment-prompt" data-logins={loginCount} />),
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
import { ensureCurrentAppUserProvisioned } from '@/lib/member/ensureCurrentAppUserProvisioned';
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
    vi.mocked(ensureCurrentAppUserProvisioned).mockResolvedValue(undefined);
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'member' });
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      deletedAt: null,
      assessmentCompleted: true,
      profile: { resumeOriginalPath: null, resumeEnhancedPath: null },
    } as any);
    vi.mocked(prisma.memberEvent.count).mockResolvedValue(0);
    reqHeaders.path = '/dashboard';
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

  it('waits for first-login provisioning before any cached role read', async () => {
    let finishProvision!: () => void;
    vi.mocked(ensureCurrentAppUserProvisioned).mockReturnValue(
      new Promise<void>((resolve) => { finishProvision = resolve; }),
    );
    const render = DashboardLayout({ children: <div /> });
    await vi.waitFor(() => expect(ensureCurrentAppUserProvisioned).toHaveBeenCalledWith('user-1'));
    expect(getStoredRoleIdentity).not.toHaveBeenCalled();
    expect(getProfileRole).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    finishProvision();
    await expect(render).resolves.toBeTruthy();
    expect(getStoredRoleIdentity).toHaveBeenCalledWith('user-1');
  });

  it('fails closed if first-login provisioning fails', async () => {
    vi.mocked(ensureCurrentAppUserProvisioned).mockRejectedValue(new Error('provision unavailable'));

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('provision unavailable');
    expect(getStoredRoleIdentity).not.toHaveBeenCalled();
    expect(getProfileRole).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies a staff account after its missing profile is restored', async () => {
    vi.mocked(ensureCurrentAppUserProvisioned).mockImplementation(async () => {
      vi.mocked(getProfileRole).mockResolvedValue('employer');
      vi.mocked(getStoredRoleIdentity).mockResolvedValue({
        userExists: true, deletedAt: null, profileRole: 'employer',
      });
      vi.mocked(getPortalSwitcherRoles).mockResolvedValue([employerRole]);
    });

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/employer');
    expect(ensureCurrentAppUserProvisioned).toHaveBeenCalledWith('user-1');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
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

  describe('WIOA preassessment gate (ops 10/8/26)', () => {
    const notAssessed = {
      deletedAt: null,
      assessmentCompleted: false,
      profile: { resumeOriginalPath: null, resumeEnhancedPath: null },
    };
    const findPrompt = (tree: any): boolean => {
      cleanup();
      render(tree);
      return screen.queryByTestId('preassessment-prompt') !== null;
    };

    it('sends a member on login 6 to the assessment before anything else', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(notAssessed as any);
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(6);
      reqHeaders.path = '/dashboard/ai-tools';
      await expect(DashboardLayout({ children: <div /> })).rejects.toThrow('REDIRECT:/dashboard/assessment?required=1');
    });

    it.each(['/dashboard/assessment', '/dashboard/messages', '/dashboard/help', '/dashboard/profile'])(
      'still lets a gated member open %s',
      async (path) => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(notAssessed as any);
        vi.mocked(prisma.memberEvent.count).mockResolvedValue(9);
        reqHeaders.path = path;
        await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();
      },
    );

    it('shows the dismissible prompt on logins 1-5', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(notAssessed as any);
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(3);
      const tree = await DashboardLayout({ children: <div /> });
      expect(findPrompt(tree)).toBe(true);
    });

    it('does nothing once the preassessment is done', async () => {
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(12);
      const tree = await DashboardLayout({ children: <div /> });
      expect(findPrompt(tree)).toBe(false);
    });

    it('never gates super admins previewing the member portal', async () => {
      vi.mocked(getProfileRole).mockResolvedValue('super_admin');
      vi.mocked(getStoredRoleIdentity).mockResolvedValue({ userExists: true, deletedAt: null, profileRole: 'super_admin' });
      vi.mocked(isSuperAdmin).mockResolvedValue(true);
      vi.mocked(getPortalSwitcherRoles).mockResolvedValue([memberRole, adminRole]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(notAssessed as any);
      vi.mocked(prisma.memberEvent.count).mockResolvedValue(20);
      reqHeaders.path = '/dashboard/ai-tools';
      await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();
      expect(prisma.memberEvent.count).not.toHaveBeenCalled();
    });

    it('fails open if the login count cannot be read', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(notAssessed as any);
      vi.mocked(prisma.memberEvent.count).mockRejectedValue(new Error('db down'));
      reqHeaders.path = '/dashboard/ai-tools';
      await expect(DashboardLayout({ children: <div /> })).resolves.toBeTruthy();
    });
  });
});
