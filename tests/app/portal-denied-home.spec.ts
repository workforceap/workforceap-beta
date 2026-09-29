import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortalSwitcherRole } from '@/lib/auth/portalRoleSwitcher';

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(),
  getEmployerAccountForNav: vi.fn(),
  getPartnerForUser: vi.fn(),
}));
vi.mock('@/lib/auth/portalRoleSwitcher', () => ({ getPortalSwitcherRoles: vi.fn() }));

import { deniedPortalHomeHref } from '@/lib/auth/portalGuards';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { getEmployerAccountForNav, getPartnerForUser } from '@/lib/auth/roles';

const role = (name: PortalSwitcherRole['role'], homeHref: string): PortalSwitcherRole => ({
  role: name,
  roleLabel: name,
  homeHref,
});

describe('denied portal destination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmployerAccountForNav).mockResolvedValue({ employerId: 'employer-1', companyName: 'Employer' });
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: 'partner-1' } as never);
  });

  it.each([
    ['member', 'admin', [role('member', '/dashboard')], '/dashboard'],
    ['counselor', 'admin', [role('counselor', '/counselor')], '/counselor'],
    ['employer', 'counselor', [role('employer', '/employer')], '/employer'],
    ['partner', 'counselor', [role('partner', '/partner')], '/partner'],
  ] as const)('sends a %s denied %s to their own portal', async (fixture, deniedRole, roles, expected) => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([...roles]);
    expect(await deniedPortalHomeHref(`user-${fixture}`, deniedRole)).toBe(expected);
    expect(getPortalSwitcherRoles).toHaveBeenCalledWith(`user-${fixture}`);
  });

  it('skips the denied portal even if the switcher still lists it', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      role('counselor', '/counselor'),
      role('admin', '/admin'),
    ]);
    expect(await deniedPortalHomeHref('user-mixed', 'admin')).toBe('/counselor');
  });

  it('uses a public destination when no other portal is available', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([role('admin', '/admin')]);
    expect(await deniedPortalHomeHref('user-orphan-admin', 'admin')).toBe('/');
  });

  it('skips a stale employer row and chooses the linked partner', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      role('employer', '/employer'),
      role('partner', '/partner'),
    ]);
    vi.mocked(getEmployerAccountForNav).mockResolvedValue(null);

    expect(await deniedPortalHomeHref('user-stale-employer', 'counselor')).toBe('/partner');
    expect(getPartnerForUser).toHaveBeenCalledWith('user-stale-employer', { readOnlyAudit: true });
  });

  it('skips a stale partner row and chooses a valid counselor home', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      role('partner', '/partner'),
      role('counselor', '/counselor'),
    ]);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    expect(await deniedPortalHomeHref('user-stale-partner', 'admin')).toBe('/counselor');
  });

  it('does not choose an unlinked employer or partner portal', async () => {
    vi.mocked(getPortalSwitcherRoles).mockResolvedValue([
      role('employer', '/employer'),
      role('partner', '/partner'),
    ]);
    vi.mocked(getEmployerAccountForNav).mockResolvedValue(null);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    expect(await deniedPortalHomeHref('user-unlinked', 'admin')).toBe('/');
  });
});
