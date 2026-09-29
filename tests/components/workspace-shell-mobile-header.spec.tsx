import { cleanup, render, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import {
  ADMIN_PORTAL_NAV_ITEMS,
  EMPLOYER_PORTAL_NAV_ITEMS,
  MEMBER_PORTAL_NAV_ITEMS,
  PARTNER_PORTAL_NAV_ITEMS,
  type PortalRole,
} from '@/lib/nav/portalNav';
import { pickAdminClientMessages } from '@/lib/i18n/pickRootClientMessages';
import messages from '@/messages/en.json';

/**
 * Scout 2026-09-22 M2: at phone width the employer, partner and admin
 * header brand column shrank to a few pixels and "Employer portal" wrapped
 * under the tier badge / role switcher (134px header vs the member's 58px).
 * Below the 769px rail breakpoint every staff shell now takes the member's
 * minimal header; the tier badge is repeated in the drawer and the role /
 * super-admin switcher stays in the header as the one remaining chip.
 */

const viewport = vi.hoisted(() => ({ wide: true }));
vi.mock('next/navigation', () => ({ usePathname: () => '/employer', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/super-admin-view-switcher', () => ({
  default: ({ initialIsSuperAdmin }: { initialIsSuperAdmin?: boolean }) =>
    initialIsSuperAdmin ? <button type="button" data-testid="super-admin-switcher">Admin</button> : null,
  useIsSuperAdmin: (known = false) => known,
}));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({
  default: ({ currentRole }: { currentRole: string }) => (
    <button type="button" data-testid="role-switcher">{currentRole}</button>
  ),
}));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => <span data-testid="header-actions" /> }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => <span>Theme</span> }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
    <button type="button" className={className}>{children ?? 'Sign out'}</button>
  ),
}));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

beforeEach(() => {
  viewport.wide = true;
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: viewport.wide, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const STAFF = {
  employer: { navItems: EMPLOYER_PORTAL_NAV_ITEMS, workspaceLabel: 'Employer portal', contextLabel: 'Contango IT' },
  partner: { navItems: PARTNER_PORTAL_NAV_ITEMS, workspaceLabel: 'Partner portal', contextLabel: 'Workforce Solutions' },
  admin: { navItems: ADMIN_PORTAL_NAV_ITEMS, workspaceLabel: 'Admin workspace', contextLabel: 'Administrator' },
} satisfies Partial<Record<PortalRole, unknown>>;

const PORTAL_ROLES = [
  { role: 'employer' as const, roleLabel: 'Employer', homeHref: '/employer' },
  { role: 'partner' as const, roleLabel: 'Partner', homeHref: '/partner' },
];

function showStaff(role: keyof typeof STAFF, extra: Partial<React.ComponentProps<typeof WorkspaceShell>> = {}) {
  const shell = STAFF[role];
  const slice = role === 'admin' ? pickAdminClientMessages(messages) : messages;
  return render(
    <NextIntlClientProvider locale="en" messages={slice}>
      <WorkspaceShell portalRole={role} navItems={shell.navItems} workspaceLabel={shell.workspaceLabel}
        contextLabel={shell.contextLabel} readOnlyAudit headerBadge="Hiring Partner" portalRoles={PORTAL_ROLES} {...extra}>
        <h1>Overview</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>,
  );
}

const header = (container: HTMLElement) => container.querySelector<HTMLElement>('.workspace-shell-header')!;
const drawer = (container: HTMLElement) => container.querySelector<HTMLElement>('#workspace-sidebar')!;
const MINIMAL = 'workspace-shell-header--minimal-mobile';

describe('staff header at phone width', () => {
  it.each(['employer', 'partner', 'admin'] as const)(
    '%s takes the minimal mobile header and keeps the role switcher as the header chip',
    (role) => {
      viewport.wide = false;
      const { container } = showStaff(role);
      const head = header(container);
      expect(head).toHaveClass(MINIMAL);
      expect(within(head).getByText('WorkforceAP')).toBeInTheDocument();
      expect(within(head).getByTestId('role-switcher')).toHaveTextContent(role);
      expect(within(head).getByTestId('header-actions')).toBeInTheDocument();
    },
  );

  it('moves the tier badge into the drawer so it can no longer sit on the tagline', () => {
    viewport.wide = false;
    const { container } = showStaff('employer');
    expect(within(drawer(container)).getByText('Hiring Partner')).toHaveClass('workspace-shell-tier-badge');
  });

  it('keeps the super-admin switcher in the admin header', () => {
    viewport.wide = false;
    const { container } = showStaff('admin', { superAdmin: true, portalRoles: undefined });
    const head = header(container);
    expect(head).toHaveClass(MINIMAL);
    expect(within(head).getByTestId('super-admin-switcher')).toBeInTheDocument();
  });

  it('leaves the desktop staff header as it was: full variant, badge in the header only', () => {
    viewport.wide = true;
    const { container } = showStaff('employer');
    const head = header(container);
    expect(head).not.toHaveClass(MINIMAL);
    expect(within(head).getByText('Hiring Partner')).toHaveClass('workspace-shell-tier-badge');
    expect(within(head).getByText('Employer portal')).toHaveClass('workspace-shell-tagline');
    expect(drawer(container).querySelector('.workspace-shell-tier-badge')).toBeNull();
  });

  it('still gives the member shell the minimal header only through its own prop', () => {
    viewport.wide = false;
    const show = (minimal: boolean) => render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS} workspaceLabel="Member portal"
          contextLabel="Account" readOnlyAudit minimalMobileHeader={minimal}>
          <h1>Home</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
    const plain = show(false);
    expect(header(plain.container)).not.toHaveClass(MINIMAL);
    plain.unmount();
    const minimal = show(true);
    expect(header(minimal.container)).toHaveClass(MINIMAL);
  });
});
