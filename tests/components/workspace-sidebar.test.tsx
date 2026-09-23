import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import DashboardFooter from '@/components/portal/DashboardFooter';
import { MEMBER_PORTAL_NAV_ITEMS, EMPLOYER_PORTAL_NAV_ITEMS, ADMIN_PORTAL_NAV_ITEMS, navTopLevelItems } from '@/lib/nav/portalNav';
import { getBestActiveHref } from '@/lib/nav/activeRoute';
import { MEMBER_TOOLKIT_HUB_HREF } from '@/lib/nav/memberToolRoutes';
import { pickAdminClientMessages } from '@/lib/i18n/pickRootClientMessages';
import messages from '@/messages/en.json';
import spanishMessages from '@/messages/es.json';

const location = vi.hoisted(() => ({ pathname: '/dashboard/program', wide: true }));
vi.mock('next/navigation', () => ({ usePathname: () => location.pathname }));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({
  default: () => <div role="radiogroup" aria-label="Appearance">
    <span>Theme preference</span>
    <button type="button" role="radio" aria-checked="false" tabIndex={-1}>Light</button>
    <button type="button" role="radio" aria-checked="true" tabIndex={0}>System</button>
    <button type="button" role="radio" aria-checked="false" tabIndex={-1}>Dark</button>
  </div>,
}));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
    <button type="button" className={className}>{children ?? 'Sign out'}</button>
  ),
}));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

beforeEach(() => {
  location.pathname = '/dashboard/program';
  location.wide = true;
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: location.wide, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show(role: 'member' | 'employer' = 'member') {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <WorkspaceShell portalRole={role}
      navItems={role === 'member' ? MEMBER_PORTAL_NAV_ITEMS : EMPLOYER_PORTAL_NAV_ITEMS}
      workspaceLabel={role === 'member' ? 'Member portal' : 'Employer portal'}
      contextLabel="Account" readOnlyAudit showResumeUploadHint>
      <h1>Training</h1>
    </WorkspaceShell>
  </NextIntlClientProvider>);
}

describe('workspace navigation', () => {
  it('limits the dynamic-height warm canvas to the mounted workspace, including dark mode', () => {
    const css = readFileSync(join(process.cwd(), 'css/portal-kit.css'), 'utf8');
    const rule = css.match(/(html \.workspace-shell-root\[data-workspace-role\])\s*\{([^}]+)\}/)!;
    expect(rule).not.toBeNull();
    expect(rule[2]).toMatch(/min-height: 100vh;\s*min-height: 100dvh;/);
    expect(rule[2]).toContain('background: var(--wa-bg-wave, var(--wa-bg))');
    const { container } = show();
    const shell = container.querySelector('.workspace-shell-root')!;
    expect(shell.matches(rule[1])).toBe(true);
    document.documentElement.classList.add('dark');
    try {
      expect(shell.matches(rule[1])).toBe(true);
      expect(document.body.matches(rule[1])).toBe(false);
      const publicSurface = document.createElement('main');
      publicSurface.dataset.surface = 'warm';
      document.body.append(publicSurface);
      expect(publicSurface.matches(rule[1])).toBe(false);
      publicSurface.remove();
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });

  it('keeps desktop scrolling inside the shell and reserves the remaining width for main content', () => {
    const css = readFileSync(join(process.cwd(), 'css/portal-main-extracted.css'), 'utf8');

    expect(css).toMatch(/@media \(min-width: 769px\)[\s\S]*?\.workspace-shell-root \{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
    expect(css).toMatch(/\.workspace-shell-body \{[\s\S]*?align-items: stretch;[\s\S]*?overflow: hidden;/);
    expect(css).toMatch(/\.workspace-shell-main \{[\s\S]*?flex: 1 1 auto;[\s\S]*?width: auto;[\s\S]*?height: 100%;[\s\S]*?min-height: 0;[\s\S]*?overflow: auto;/);
    expect(css).toMatch(/\.workspace-sidebar \{[\s\S]*?align-self: stretch;[\s\S]*?height: 100%;[\s\S]*?overflow-y: hidden;/);
    expect(css).toMatch(/\.workspace-sidebar-nav \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
    expect(css).toMatch(/@media \(max-height: 40rem\)[\s\S]*?\.workspace-shell-root\[data-workspace-role\] \.workspace-sidebar \{[\s\S]*?overflow-y: auto;/);
  });

  it('keeps the site footer in flow so it cannot cover the last page controls', () => {
    const css = readFileSync(join(process.cwd(), 'css/portal-main-extracted.css'), 'utf8');
    expect(css).toMatch(/\.workspace-shell-main-inner \{[\s\S]*?flex: 1 0 auto;[\s\S]*?min-height: 100%;/);
    expect(css).toMatch(/\.workspace-shell-main-body \{[\s\S]*?flex: 1 0 auto;/);
    expect(css).toMatch(
      /\.workspace-shell-main-inner > :is\(\.dashboard-site-footer[\s\S]*?position: static;/,
    );
    const innerFooterRule =
      css.match(
        /\.workspace-shell-main-inner > :is\(\.dashboard-site-footer, \.admin-footer, \.portal-minimal-footer\) \{[^}]+\}/,
      )?.[0] ?? '';
    expect(innerFooterRule).toMatch(/position: static/);
    expect(innerFooterRule).not.toMatch(/margin-top:\s*auto/);
    const footerRule = css.match(/\.dashboard-site-footer \{[^}]+\}/)?.[0] ?? '';
    expect(footerRule).toMatch(/position: static/);
    expect(footerRule).toMatch(/background: var\(--wa-surface\)/);
    expect(footerRule).not.toMatch(/position:\s*(sticky|fixed)/);

    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WorkspaceShell
          portalRole="member"
          navItems={MEMBER_PORTAL_NAV_ITEMS}
          workspaceLabel="Member portal"
          contextLabel="Account"
          readOnlyAudit
          footer={<DashboardFooter />}
        >
          <h1>Training</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
    const inner = container.querySelector('.workspace-shell-main-inner');
    const body = container.querySelector('.workspace-shell-main-body');
    const footer = container.querySelector('.dashboard-site-footer');
    expect(inner).toBeInstanceOf(HTMLElement);
    expect(body).toBeInstanceOf(HTMLElement);
    expect(footer).toBeInstanceOf(HTMLElement);
    if (!(inner instanceof HTMLElement) || !(body instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
      throw new Error('missing workspace footer layout nodes');
    }
    expect(inner.contains(footer)).toBe(true);
    expect(body.contains(footer)).toBe(false);
    expect(body.nextElementSibling).toBe(footer);
    expect(footer.nextElementSibling).toBeNull();
    const heading = inner.querySelector('h1');
    expect(heading).toBeInstanceOf(HTMLHeadingElement);
    if (!(heading instanceof HTMLHeadingElement)) {
      throw new Error('missing training heading');
    }
    expect(body.contains(heading)).toBe(true);
    expect(heading.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['/dashboard/program', '/en/dashboard/program', '/dashboard/program/start'])('marks only the most specific destination at %s', (pathname) => {
    location.pathname = pathname;
    const { container } = show();
    const active = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', pathname.endsWith('/start') ? '/dashboard/program/start' : '/dashboard/program');
  });

  it('does not repeat Home as a second current account link', () => {
    location.pathname = '/dashboard';
    const { container } = show();
    expect(container.querySelectorAll('.workspace-sidebar a[href="/dashboard"]')).toHaveLength(1);
    expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(1);
  });

  // Scout 2026-09-22 D16: Home's href `/dashboard` prefix-matched every member
  // route, so pages with no rail item of their own showed Home as current.
  it.each(['/dashboard/eligibility', '/dashboard/points', '/dashboard/account', '/dashboard/coursera', '/en/dashboard/eligibility'])(
    'marks nothing current on %s, which has no rail item',
    (pathname) => {
      location.pathname = pathname;
      const { container } = show();
      expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(0);
      expect(container.querySelector('.workspace-sidebar a[href="/dashboard"]')).not.toHaveAttribute('aria-current');
    },
  );

  it('marks Home current on exactly /dashboard and not on its children', () => {
    location.pathname = '/dashboard';
    const { container } = show();
    const active = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/dashboard');
  });

  it('leaves the employer Overview quiet on an employer route without a rail item', () => {
    location.pathname = '/employer/reports';
    const { container } = show('employer');
    expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(0);
  });

  it('keeps Home, My program, Job board, AI Career Tools, and Messages visible without opening a group', () => {
    const { container } = show();
    const primary = container.querySelector('.workspace-sidebar-list--root > .workspace-sidebar-group');
    expect(primary).not.toBeNull();
    expect(primary?.querySelector('details')).toBeNull();
    expect(within(primary as HTMLElement).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(within(primary as HTMLElement).getByRole('link', { name: 'My program' })).toHaveAttribute('href', '/dashboard/program');
    expect(within(primary as HTMLElement).getByRole('link', { name: 'Job board' })).toHaveAttribute('href', '/dashboard/jobs');
    expect(within(primary as HTMLElement).getByRole('link', { name: 'AI Career Tools' })).toHaveAttribute('href', '/dashboard/ai-tools');
    expect(within(primary as HTMLElement).getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/dashboard/messages');
    expect(within(primary as HTMLElement).queryByRole('link', { name: 'My progress' })).toBeNull();
    expect(within(primary as HTMLElement).queryByRole('link', { name: 'Skill missions' })).toBeNull();
    const groupedHrefs = [...container.querySelectorAll('.workspace-sidebar details a')].map((link) => link.getAttribute('href'));
    expect(groupedHrefs).not.toContain('/dashboard/jobs');
    expect(groupedHrefs).not.toContain('/dashboard/ai-tools');
    expect(groupedHrefs).not.toContain('/dashboard/messages');
    // WAP-189: My progress and Skill missions moved behind Training & progress.
    expect(groupedHrefs).toContain('/dashboard/readiness');
    expect(groupedHrefs).toContain('/dashboard/missions');
  });

  // WAP-189: My progress and Skill missions sit in Training & progress, which
  // opens on its own whenever the member is on one of them.
  const trainingAndProgress = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLDetailsElement>('.workspace-sidebar details')].filter(
      (group) => group.querySelector('summary')?.textContent?.includes('Training & progress'),
    );

  it.each([
    ['/dashboard/readiness', 'My progress'],
    ['/dashboard/missions', 'Skill missions'],
  ])('opens Training & progress and marks one current row on %s', (pathname, label) => {
    location.pathname = pathname;
    const { container } = show();
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', pathname);
    expect(current[0]).toHaveTextContent(label);
    const open = [...container.querySelectorAll<HTMLDetailsElement>('.workspace-sidebar details')].filter((group) => group.open);
    expect(open).toHaveLength(1);
    expect(open[0].contains(current[0])).toBe(true);
    expect(open[0].querySelector('summary')).toHaveTextContent('Training & progress');
    expect(trainingAndProgress(container)).toEqual(open);
  });

  it('keeps My progress and Skill missions inside a closed Training & progress group on /dashboard', () => {
    location.pathname = '/dashboard';
    const { container } = show();
    const groups = trainingAndProgress(container);
    expect(groups).toHaveLength(1);
    expect(groups[0].open).toBe(false);
    for (const href of ['/dashboard/readiness', '/dashboard/missions']) {
      const row = container.querySelector(`.workspace-sidebar a[href="${href}"]`);
      expect(row, href).not.toBeNull();
      expect(row?.closest('details'), href).toBe(groups[0]);
      expect(row, href).not.toHaveAttribute('aria-current');
    }
    expect(container.querySelector('.workspace-sidebar details[open]')).toBeNull();
  });

  it('names Skill missions and My progress in the member locale', () => {
    location.pathname = '/es/dashboard/missions';
    const { container } = render(<NextIntlClientProvider locale="es" messages={spanishMessages}>
      <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS}
        workspaceLabel="Member portal" contextLabel="Account" readOnlyAudit>
        <h1>Misiones</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>);
    expect(container.querySelector('.workspace-sidebar a[href="/dashboard/missions"]')).toHaveTextContent(spanishMessages.nav.skillMissions);
    expect(container.querySelector('.workspace-sidebar a[href="/dashboard/readiness"]')).toHaveTextContent(spanishMessages.nav.myProgress);
    expect(container.querySelector('.workspace-sidebar a[href="/dashboard/missions"]')).not.toHaveTextContent('Skill missions');
  });

  it('names Path to certification, My documents and Invite a friend in the member locale', () => {
    location.pathname = '/es/dashboard/documents';
    const { container } = render(<NextIntlClientProvider locale="es" messages={spanishMessages}>
      <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS}
        workspaceLabel="Member portal" contextLabel="Account" readOnlyAudit>
        <h1>Documentos</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>);
    const rows: Array<[string, string, string]> = [
      ['/dashboard/program/start', spanishMessages.nav.pathToCertification, 'Path to certification'],
      ['/dashboard/documents', spanishMessages.nav.myDocuments, 'My documents'],
      ['/dashboard/referrals', spanishMessages.nav.inviteFriend, 'Invite a friend'],
    ];
    for (const [href, translated, english] of rows) {
      const row = container.querySelector(`.workspace-sidebar a[href="${href}"]`);
      expect(row, href).toHaveTextContent(translated);
      expect(row, href).not.toHaveTextContent(english);
    }
  });

  it('opens the section containing the active route and keeps other groups quiet', () => {
    location.pathname = '/dashboard/assessment';
    const { container } = show();
    const groups = [...container.querySelectorAll('details')];
    expect(groups).toHaveLength(3);
    expect(groups.filter((group) => group.open)).toHaveLength(1);
    expect(groups.find((group) => group.open)).toHaveTextContent('Training preassessment');
  });

  it('keeps every distinct member destination reachable through the disclosures', () => {
    const { container } = show();
    const actual = [...container.querySelectorAll('.workspace-sidebar-nav a')].map((link) => link.getAttribute('href'));
    expect(new Set(actual)).toEqual(new Set(MEMBER_PORTAL_NAV_ITEMS.map((item) => item.href)));
    expect(actual).toHaveLength(new Set(actual).size);
    expect(container.querySelector('.workspace-sidebar details[open]')).toBeNull();
  });

  it('retains the collapse preference and reveals destinations in the compact rail', async () => {
    const user = userEvent.setup();
    const { container } = show();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.workspace-sidebar')).toHaveClass('workspace-sidebar--collapsed');
    expect(localStorage.getItem('wa_nav_collapsed_member')).toBe('1');
    expect(container.querySelector('details')).toBeNull();
    expect(screen.queryByText('Theme preference')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByText('Theme preference')).toBeInTheDocument();
  });

  it('keeps the resume hint in member content so it cannot push the rail below its viewport', () => {
    location.pathname = '/dashboard';
    const { container } = show();
    const main = container.querySelector('.workspace-shell-main') as HTMLElement;
    expect(within(main).getByRole('link', { name: 'Upload resume' })).toHaveAttribute('href', '/dashboard/resume');
  });

  it('scopes the resume hint to home and resume-consuming tools', () => {
    location.pathname = '/dashboard/messages';
    show();
    expect(screen.queryByRole('link', { name: 'Upload resume' })).toBeNull();
  });

  it('preserves flat staff navigation while fixing its parent highlight', () => {
    location.pathname = '/employer/jobs';
    const { container } = show('employer');
    expect(container.querySelector('details')).toBeNull();
    const active = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/employer/jobs');
  });

  it('keeps preferences reachable by expanding the staff rail without clipped controls', async () => {
    const user = userEvent.setup();
    show('employer');
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByText('Language')).not.toBeInTheDocument();
    expect(screen.queryByText('Theme preference')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Theme preference')).toBeInTheDocument();
  });

  it('keeps every visible desktop footer control in keyboard order through sign out', async () => {
    const user = userEvent.setup();
    const { container } = show();
    const footer = container.querySelector('.workspace-sidebar-footer');
    expect(footer).not.toBeNull();

    const appearance = within(footer as HTMLElement).getByRole('radiogroup', { name: 'Appearance' });
    const selectedTheme = within(appearance).getByRole('radio', { name: 'System' });
    const signOut = within(footer as HTMLElement).getByRole('button', { name: 'Sign out' });
    expect(selectedTheme).toHaveAttribute('tabindex', '0');

    selectedTheme.focus();
    await user.tab();
    expect(signOut).toHaveFocus();
  });

  it('keeps a closed mobile drawer out of keyboard and screen-reader navigation', async () => {
    location.wide = false;
    const user = userEvent.setup();
    const { container } = show();
    const rail = container.querySelector('.workspace-sidebar');
    expect(rail).toHaveAttribute('inert');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('dialog', { name: 'Member portal navigation' })).toHaveAttribute('aria-modal', 'true');
    expect(rail).not.toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(rail).toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.keyboard('{Escape}');
    expect(rail).toHaveAttribute('inert');
  });
});

describe('active-route specificity', () => {
  it('ranks the matched alias, not the length of its unrelated canonical href', () => {
    expect(getBestActiveHref('/dashboard/ai-tools/application-tracker/123', [
      { href: '/dashboard/ai-tools' },
      { href: '/applications', aliases: ['/dashboard/ai-tools/application-tracker'] },
    ])).toBe('/applications');
  });
  it('matches full path segments and leaves unrelated routes unselected', () => {
    expect(getBestActiveHref('/dashboard/programming', [{ href: '/dashboard/program' }])).toBeNull();
  });
  it('an exact root link wins only on its own pathname; longest prefix wins elsewhere', () => {
    const links = [{ href: '/dashboard', exact: true }, { href: '/dashboard/program' }, { href: '/dashboard/program/start' }];
    expect(getBestActiveHref('/dashboard', links)).toBe('/dashboard');
    expect(getBestActiveHref('/dashboard/eligibility', links)).toBeNull();
    expect(getBestActiveHref('/dashboard/program/start/step-2', links)).toBe('/dashboard/program/start');
    expect(getBestActiveHref('/dashboard/program', links)).toBe('/dashboard/program');
  });
});

describe('admin workspace with the production translation slice', () => {
  it.each([
    ['/admin', '/admin'],
    ['/en/admin/students', '/admin/students'],
    ['/admin/students/fixture-student', '/admin/students'],
  ])('marks one destination at %s without raw translation keys', (pathname, activeHref) => {
    location.pathname = pathname;
    const onError = vi.fn();
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={pickAdminClientMessages(messages)} onError={onError}>
        <WorkspaceShell portalRole="admin" navItems={ADMIN_PORTAL_NAV_ITEMS}
          workspaceLabel="Admin workspace" contextLabel="Administrator" readOnlyAudit>
          <h1>Admin content</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(container.querySelector('.workspace-shell-tagline')).toHaveTextContent('Admin workspace');
    expect(container).not.toHaveTextContent('workspace.admin');
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', activeHref);
    expect(container.querySelectorAll('.workspace-sidebar-link.active')).toHaveLength(1);
  });

  it('leaves Today quiet on an admin route without a rail item', () => {
    location.pathname = '/admin/testimonials';
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={pickAdminClientMessages(messages)}>
        <WorkspaceShell portalRole="admin" navItems={ADMIN_PORTAL_NAV_ITEMS}
          workspaceLabel="Admin workspace" contextLabel="Administrator" readOnlyAudit>
          <h1>Admin content</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
    expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(0);
    expect(container.querySelector('.workspace-sidebar a[href="/admin"]')).not.toHaveAttribute('aria-current');
  });

  it('uses the selected locale for the admin shell labels', () => {
    location.pathname = '/es/admin/students';
    const onError = vi.fn();
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={pickAdminClientMessages(spanishMessages)} onError={onError}>
        <WorkspaceShell portalRole="admin" navItems={ADMIN_PORTAL_NAV_ITEMS}
          workspaceLabel="Admin workspace" contextLabel="Administrator" readOnlyAudit>
          <h1>Admin content</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(container.querySelector('.workspace-shell-tagline')).toHaveTextContent(spanishMessages.workspace.admin);
    expect(container.querySelector('.workspace-sidebar [aria-current="page"]')).toHaveAttribute('href', '/admin/students');
  });
});

describe('member identity in the shell (WAP-101)', () => {
  const identity = {
    name: 'Alex Rivera',
    email: 'alex@example.org',
    initials: 'AR',
    avatarUrl: null,
    href: '/dashboard/profile',
  };
  const showIdentity = (avatarUrl: string | null = null) =>
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS}
        identity={{ ...identity, avatarUrl }}
        workspaceLabel="Member portal" contextLabel="My account" readOnlyAudit>
        <h1>Training</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>);

  it('names the signed-in member in the header, separate from sign out, linking to profile', () => {
    const { container } = showIdentity();
    const header = container.querySelector('.workspace-shell-header') as HTMLElement;
    const link = within(header).getByRole('link', { name: /Alex Rivera/ });
    expect(link).toHaveAttribute('href', '/dashboard/profile');
    expect(link).toHaveTextContent('alex@example.org');
    expect(within(link).getByRole('img', { name: 'AR' })).toBeInTheDocument();
    // The generic account chip is replaced by the member's own identity.
    expect(header.textContent).not.toContain('My account');
    // Sign out is still its own control and is not the identity link.
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut).not.toBe(link);
    expect(link).not.toHaveTextContent('Sign out');
  });

  it('shows the saved profile photo when one is on file', () => {
    const { container } = showIdentity('https://cdn.example/photo.webp');
    const header = container.querySelector('.workspace-shell-header') as HTMLElement;
    const link = within(header).getByRole('link', { name: /Alex Rivera/ });
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/photo.webp');
  });

  it('repeats the identity in the mobile drawer above sign out', () => {
    location.wide = false;
    const { container } = showIdentity();
    const footer = container.querySelector('.workspace-sidebar-footer') as HTMLElement;
    // The closed drawer is aria-hidden until opened, so include hidden nodes.
    const link = within(footer).getByRole('link', { name: /Alex Rivera/, hidden: true });
    expect(link).toHaveAttribute('href', '/dashboard/profile');
    expect(footer.textContent).not.toContain('My account');
    const signOut = within(footer).getByRole('button', { name: 'Sign out', hidden: true });
    expect(link.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the account chip for shells without an identity', () => {
    const { container } = show();
    expect(container.querySelector('.workspace-shell-header .workspace-shell-context--chip')).toHaveTextContent('Account');
    expect(container.querySelector('.workspace-shell-identity')).toBeNull();
  });
});

describe('AI Career Tools contextual tool row', () => {
  /** Every rail destination the member can actually see and click. */
  const railRows = (container: HTMLElement) =>
    [...container.querySelectorAll('.workspace-sidebar-nav a.workspace-sidebar-link')];
  const nestedRows = (container: HTMLElement) =>
    [...container.querySelectorAll('.workspace-sidebar-nav a.workspace-sidebar-link--nested')];

  it('marks the tool as current on a tool route instead of highlighting the hub', () => {
    location.pathname = '/dashboard/ai-tools/resume-studio';
    const { container } = show();
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/dashboard/ai-tools/resume-studio');
    expect(current[0]).toHaveTextContent('Resume studio');
    expect(container.querySelector('.workspace-sidebar')).toHaveAttribute(
      'data-contextual-tool',
      '/dashboard/ai-tools/resume-studio',
    );
  });

  it('marks the tool as current on every AI Career Tools tool route', () => {
    const slugs = [
      ['resume-studio', 'Resume studio'],
      ['cover-letter', 'Cover letter'],
      ['interview-practice', 'Interview practice'],
      ['interview-coach', 'Interview coach'],
      ['job-match-scorer', 'Job match scorer'],
      ['skill-mapper', 'Skill mapper'],
      ['training-bridge', 'Training bridge'],
      ['linkedin-headline', 'LinkedIn headline'],
      ['linkedin-about', 'LinkedIn About'],
      ['gap-analyzer', 'Gap analyzer'],
      ['salary-negotiation', 'Salary negotiation'],
      ['benefits-cliff', 'Benefits cliff'],
      ['skill-checkpoints', 'Skill checkpoints'],
      ['elevator-pitch', 'Elevator pitch'],
      ['career-business-coach', 'Career & business coach'],
      ['readiness-coach', 'Readiness coach'],
      ['resume-rewriter', 'Resume rewriter'],
      ['voice-interview', 'Voice interview'],
    ] as const;
    for (const [slug, label] of slugs) {
      location.pathname = `/dashboard/ai-tools/${slug}`;
      const { container } = show();
      const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
      expect(current, slug).toHaveLength(1);
      expect(current[0], slug).toHaveAttribute('href', `/dashboard/ai-tools/${slug}`);
      expect(current[0], slug).toHaveTextContent(label);
      cleanup();
    }
  });

  it('nests exactly one tool row directly under AI Career Tools and never more', () => {
    location.pathname = '/dashboard/ai-tools/interview-practice';
    const { container } = show();
    const nested = nestedRows(container);
    expect(nested).toHaveLength(1);
    expect(nested[0]).toHaveAttribute('href', '/dashboard/ai-tools/interview-practice');
    expect(nested[0]).toHaveAttribute('data-nested-under', MEMBER_TOOLKIT_HUB_HREF);

    const rows = railRows(container);
    const hubIndex = rows.findIndex((row) => row.getAttribute('href') === MEMBER_TOOLKIT_HUB_HREF);
    expect(hubIndex).toBeGreaterThanOrEqual(0);
    expect(rows[hubIndex + 1]).toBe(nested[0]);
    // No other tool route leaked into the rail.
    const toolHrefs = rows
      .map((row) => row.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/dashboard/ai-tools/'));
    expect(toolHrefs).toEqual(['/dashboard/ai-tools/interview-practice']);
  });

  it('shows zero tool rows on the hub itself', () => {
    location.pathname = MEMBER_TOOLKIT_HUB_HREF;
    const { container } = show();
    expect(nestedRows(container)).toHaveLength(0);
    expect(container.querySelector('.workspace-sidebar')).not.toHaveAttribute('data-contextual-tool');
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', MEMBER_TOOLKIT_HUB_HREF);
  });

  it('leaves the application tracker highlighting its own permanent row', () => {
    location.pathname = '/dashboard/ai-tools/application-tracker';
    const { container } = show();
    expect(nestedRows(container)).toHaveLength(0);
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/dashboard/job-applications');
  });

  // WAP-189 (owner-approved) supersedes the seven-row PR #2322 order.
  it('keeps the WAP-189 five-row primary ordering byte-for-byte on a tool page', () => {
    const expected = [
      '/dashboard',
      '/dashboard/program',
      '/dashboard/jobs',
      '/dashboard/ai-tools',
      '/dashboard/messages',
    ];
    const primaryHrefs = (container: HTMLElement) =>
      [...(container.querySelector('.workspace-sidebar-list--root > .workspace-sidebar-group')
        ?.querySelectorAll('a.workspace-sidebar-link') ?? [])].map((link) => link.getAttribute('href'));

    location.pathname = '/dashboard';
    const hub = show();
    expect(primaryHrefs(hub.container)).toEqual(expected);
    cleanup();

    location.pathname = '/dashboard/ai-tools/gap-analyzer';
    const tool = show();
    expect(primaryHrefs(tool.container)).toEqual([
      '/dashboard',
      '/dashboard/program',
      '/dashboard/jobs',
      '/dashboard/ai-tools',
      '/dashboard/ai-tools/gap-analyzer',
      '/dashboard/messages',
    ]);
  });

  it('measures the visible rail row count on a tool page, the hub and /dashboard', () => {
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const [name, pathname] of [
      ['tool', '/dashboard/ai-tools/resume-studio'],
      ['hub', '/dashboard/ai-tools'],
      ['dashboard', '/dashboard'],
    ] as const) {
      location.pathname = pathname;
      const { container } = show();
      // Rows the member sees without opening a disclosure.
      counts[name] = [
        ...container.querySelectorAll(
          '.workspace-sidebar-list--root > .workspace-sidebar-group > .workspace-sidebar-list > li > a.workspace-sidebar-link',
        ),
      ].length;
      totals[name] = railRows(container).length;
      cleanup();
    }
    console.log(
      '[rail rows] visible-without-disclosure:',
      JSON.stringify(counts),
      '| all rows incl. collapsed groups:',
      JSON.stringify(totals),
    );
    // WAP-189: five always-visible rows (was seven under PR #2322).
    expect(counts.hub).toBe(5);
    expect(counts.dashboard).toBe(5);
    // One extra row on a tool page — not 18.
    expect(counts.tool).toBe(6);
  });

  it('names the current page in the mobile header band', () => {
    location.pathname = '/dashboard/ai-tools/salary-negotiation';
    const { container } = show();
    expect(container.querySelector('.workspace-shell-current-page')).toHaveTextContent('Salary negotiation');
    cleanup();

    location.pathname = '/dashboard/jobs';
    const board = show();
    expect(board.container.querySelector('.workspace-shell-current-page')).toHaveTextContent('Job board');
  });
});

describe('admin grouped rail (sidebar consolidation)', () => {
  const showAdmin = (superAdmin = true) => {
    const navItems = ADMIN_PORTAL_NAV_ITEMS.filter((item) => !item.requiresSuperAdminContext || superAdmin);
    return render(
      <NextIntlClientProvider locale="en" messages={pickAdminClientMessages(messages)}>
        <WorkspaceShell portalRole="admin" navItems={navItems}
          workspaceLabel="Admin workspace" contextLabel="Administrator" readOnlyAudit>
          <h1>Admin content</h1>
        </WorkspaceShell>
      </NextIntlClientProvider>,
    );
  };
  const sectionButtons = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>('.workspace-sidebar-section-btn')];
  const visibleRows = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLAnchorElement>('.workspace-sidebar-nav a.workspace-sidebar-link')].filter(
      (link) => !link.closest('[hidden]'),
    );

  beforeEach(() => { location.pathname = '/admin'; });

  it('renders Daily work as an always-open section and the other six as collapsible buttons, keeping every destination in the DOM', () => {
    const { container } = showAdmin();
    const daily = container.querySelector('.workspace-sidebar-section-label[data-section="dailyWork"]')!;
    expect(daily).toHaveTextContent('Daily work');
    expect(daily.closest('button')).toBeNull();
    expect(screen.getByRole('list', { name: 'Daily work' })).not.toHaveAttribute('hidden');
    const buttons = sectionButtons(container);
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Run the org', 'Programs', 'Partners & Employers', 'Reporting', 'Content', 'Security & system',
    ]);
    for (const b of buttons) {
      expect(b).toHaveAttribute('aria-expanded');
      expect(container.querySelector(`#${b.getAttribute('aria-controls')}`)).not.toBeNull();
    }
    const hrefs = [...container.querySelectorAll('.workspace-sidebar-nav a')].map((a) => a.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(ADMIN_PORTAL_NAV_ITEMS.map((item) => item.href)));
    expect(hrefs).toHaveLength(new Set(hrefs).size);
  });

  it('opens only Daily work by default: the seven queue-clearing rows show, every other section starts closed (WAP-190)', () => {
    const { container } = showAdmin();
    const rows = visibleRows(container).map((a) => a.getAttribute('href'));
    const dailyWork = navTopLevelItems(ADMIN_PORTAL_NAV_ITEMS).filter((item) => item.group === 'dailyWork').map((item) => item.href);
    expect(rows).toEqual(dailyWork);
    expect(rows).toEqual([
      '/admin', '/admin/command-center?queue=applications', '/admin/wioa-screening', '/admin/certifications',
      '/admin/program-change-requests', '/admin/students', '/admin/messages',
    ]);
    expect(visibleRows(container).map((a) => a.textContent)).toEqual([
      'Today', 'Applications', 'Funding eligibility', 'Certificates', 'Program requests', 'Students', 'Messages',
    ]);
    for (const button of sectionButtons(container)) {
      expect(button, button.textContent ?? '').toHaveAttribute('aria-expanded', 'false');
    }
    expect(container.querySelector('a[href="/admin/settings"]')?.closest('[hidden]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/overview"]')?.closest('[hidden]')).not.toBeNull();
    // Nested rows are closed until opened.
    expect(container.querySelector('a[href="/admin/analytics"]')?.closest('[hidden]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/invites"]')?.closest('[hidden]')).not.toBeNull();
    // Collapsed rows stay in the DOM, so every tour anchor is still there.
    expect(document.querySelectorAll('[data-tour]')).toHaveLength(7);
  });

  it('an org admin without super-admin context gets no Security & system section and no gated rows', () => {
    const { container } = showAdmin(false);
    expect(sectionButtons(container).map((b) => b.textContent)).not.toContain('Security & system');
    expect(container.querySelector('a[href="/admin/settings"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/coursera"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/messages"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/reporting"]')).not.toBeNull();
    expect(visibleRows(container).map((a) => a.getAttribute('href'))).toEqual([
      '/admin', '/admin/command-center?queue=applications', '/admin/wioa-screening', '/admin/certifications',
      '/admin/program-change-requests', '/admin/students',
    ]);
  });

  it('keeps Daily work open on every page, whatever an old saved preference says', () => {
    localStorage.setItem('wa_nav_sections_admin', JSON.stringify({ 'section:dailyWork': false }));
    location.pathname = '/admin/programs';
    const { container } = showAdmin();
    expect(container.querySelector('a[href="/admin/command-center?queue=applications"]')?.closest('[hidden]')).toBeNull();
    expect(container.querySelector('a[href="/admin/wioa-screening"]')?.closest('[hidden]')).toBeNull();
    expect(container.querySelector('button[data-section="dailyWork"]')).toBeNull();
  });

  it('marks Applications current on the workbench, whatever its query string, and opens Daily work there', () => {
    location.pathname = '/en/admin/command-center';
    const { container } = showAdmin(false);
    const current = container.querySelectorAll('.workspace-sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/admin/command-center?queue=applications');
    expect(current[0]).toHaveTextContent('Applications');
    expect(current[0].closest('[hidden]')).toBeNull();
  });

  it('toggles a section by click, Enter and arrow keys, and persists the choice in localStorage', async () => {
    const user = userEvent.setup();
    const { container } = showAdmin();
    const system = () => sectionButtons(container).find((b) => b.textContent === 'Security & system')!;
    await user.click(system());
    expect(system()).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('a[href="/admin/settings"]')?.closest('[hidden]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('wa_nav_sections_admin')!)).toEqual({ 'section:system': true });
    system().focus();
    await user.keyboard('{ArrowLeft}');
    expect(system()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowRight}');
    expect(system()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(system()).toHaveAttribute('aria-expanded', 'false');
    expect(JSON.parse(localStorage.getItem('wa_nav_sections_admin')!)).toEqual({ 'section:system': false });
  });

  it('restores persisted state on mount', () => {
    localStorage.setItem('wa_nav_sections_admin', JSON.stringify({
      'section:programs': true, 'section:reporting': true, 'item:/admin/reporting': true,
    }));
    const { container } = showAdmin();
    const programs = sectionButtons(container).find((b) => b.textContent === 'Programs')!;
    expect(programs).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('a[href="/admin/programs"]')?.closest('[hidden]')).toBeNull();
    expect(container.querySelector('a[href="/admin/analytics"]')?.closest('[hidden]')).toBeNull();
    // Untouched sections keep their default.
    expect(sectionButtons(container).find((b) => b.textContent === 'Content')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the section and parent holding the current page even when they were closed', () => {
    localStorage.setItem('wa_nav_sections_admin', JSON.stringify({ 'section:system': false, 'item:/admin/settings': false }));
    location.pathname = '/admin/feature-flags';
    const { container } = showAdmin();
    const flags = container.querySelector('a[href="/admin/feature-flags"]')!;
    expect(flags).toHaveAttribute('aria-current', 'page');
    expect(flags.closest('[hidden]')).toBeNull();
    expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(1);
    const toggle = container.querySelector('[data-testid="sidebar-children-toggle"][data-parent="/admin/settings"]')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('Reporting is one row whose children open on demand and include the absorbed pages', async () => {
    const user = userEvent.setup();
    const { container } = showAdmin();
    const hub = container.querySelector('a[href="/admin/reporting"]')!;
    expect(hub).toHaveTextContent('Reporting');
    expect(hub.closest('[hidden]')).not.toBeNull();
    await user.click(sectionButtons(container).find((b) => b.textContent === 'Reporting')!);
    expect(hub.closest('[hidden]')).toBeNull();
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="sidebar-children-toggle"][data-parent="/admin/reporting"]')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Show 8 more under Reporting');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const children = [...container.querySelectorAll(`#${toggle.getAttribute('aria-controls')} a`)].map((a) => a.getAttribute('href'));
    expect(children).toEqual(expect.arrayContaining(['/admin/analytics', '/admin/outcomes', '/admin/board']));
    expect(children).toHaveLength(8);
    expect(JSON.parse(localStorage.getItem('wa_nav_sections_admin')!)).toEqual({ 'section:reporting': true, 'item:/admin/reporting': true });
  });

  it('the collapsed icon rail lists every destination flat and marks one current page', async () => {
    const user = userEvent.setup();
    location.pathname = '/admin/coursera';
    const { container } = showAdmin();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.workspace-sidebar-section-btn')).toBeNull();
    const hrefs = [...container.querySelectorAll('.workspace-sidebar-nav a')].map((a) => a.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(ADMIN_PORTAL_NAV_ITEMS.map((item) => item.href)));
    expect(container.querySelectorAll('.workspace-sidebar [aria-current="page"]')).toHaveLength(1);
  });

  it('the mobile drawer uses the same sections', async () => {
    location.wide = false;
    const user = userEvent.setup();
    const { container } = showAdmin();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(sectionButtons(container)).toHaveLength(6);
    expect(container.querySelector('.workspace-sidebar-section-label[data-section="dailyWork"]')).not.toBeNull();
    expect(visibleRows(container).length).toBeLessThanOrEqual(20);
  });
});
