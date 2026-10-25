import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemberBottomTabs from '@/components/portal/MemberBottomTabs';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import { EMPLOYER_PORTAL_NAV_ITEMS, MEMBER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { EARLY_TAP_GLOBAL, EARLY_TAP_SCRIPT } from '@/lib/portal/earlyShellTap';
import messages from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/**
 * Phone-first member shell: a fixed bottom tab bar (Home, Program, Jobs,
 * Messages, More) for the member portal only. Plain server-rendered links with
 * aria-current from the pathname; More opens the same drawer as the hamburger
 * through the shared early-tap kind, so a tap before hydration still opens it.
 */

const env = vi.hoisted(() => ({ pathname: '/dashboard', wide: false }));
vi.mock('next/navigation', () => ({ usePathname: () => env.pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => <nav aria-label="Staff bottom nav" /> }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => <span>Theme</span> }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? 'Sign out'}</button>,
}));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

const win = window as unknown as Record<string, unknown>;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

beforeEach(() => {
  env.pathname = '/dashboard';
  env.wide = false;
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: env.wide, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete win[EARLY_TAP_GLOBAL];
  document.body.innerHTML = '';
});

const withIntl = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>
);

const tabs = () => screen.getByRole('navigation', { name: 'Main tabs' });

describe('MemberBottomTabs', () => {
  it('renders Home, Program, Jobs and Messages as links with the real hrefs, plus a More button', () => {
    render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    const nav = within(tabs());
    const links = nav.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard',
      '/dashboard/program',
      '/dashboard/jobs',
      '/dashboard/messages',
    ]);
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'Program', 'Jobs', 'Messages']);
    expect(nav.getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(nav.getAllByRole('listitem')).toHaveLength(5);
  });

  it('marks exactly the current destination with aria-current="page"', () => {
    env.pathname = '/dashboard/jobs/abc-123';
    render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    const current = within(tabs()).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual(['Jobs']);
  });

  it('marks Home only on its own route, and nothing on a page that belongs to another rail row', () => {
    env.pathname = '/dashboard';
    const home = render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    expect(within(tabs()).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    home.unmount();

    env.pathname = '/dashboard/readiness';
    render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    const current = within(tabs()).getAllByRole('link').filter((a) => a.hasAttribute('aria-current'));
    expect(current).toEqual([]);
  });

  it('keeps an explicit URL locale on the destinations and still finds the current one', () => {
    env.pathname = '/es/dashboard/program';
    render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    const links = within(tabs()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/es/dashboard',
      '/es/dashboard/program',
      '/es/dashboard/jobs',
      '/es/dashboard/messages',
    ]);
    expect(links.filter((a) => a.hasAttribute('aria-current')).map((a) => a.textContent)).toEqual(['Program']);
  });

  it('follows the /dev/member href map (destinations and current tab)', () => {
    env.pathname = '/dev/member/jobs';
    render(withIntl(
      <MemberBottomTabs
        onMore={() => {}}
        hrefMap={{
          '/dashboard': '/dev/member/home',
          '/dashboard/program': '/dev/member/program',
          '/dashboard/jobs': '/dev/member/jobs',
          '/dashboard/messages': '/dev/member/messages',
        }}
      />,
    ));
    const links = within(tabs()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dev/member/home',
      '/dev/member/program',
      '/dev/member/jobs',
      '/dev/member/messages',
    ]);
    expect(links.filter((a) => a.hasAttribute('aria-current')).map((a) => a.textContent)).toEqual(['Jobs']);
  });

  it('shows the unread count on Messages (9+ when large), announced, and nothing when zero', () => {
    const { rerender } = render(withIntl(<MemberBottomTabs onMore={() => {}} badgeCounts={{ counselor_messages_unread: 3 }} />));
    const messagesLink = () => within(tabs()).getByRole('link', { name: /Messages/ });
    expect(messagesLink()).toHaveAccessibleName('Messages, 3 unread');
    expect(messagesLink()).toHaveTextContent('3');

    rerender(withIntl(<MemberBottomTabs onMore={() => {}} badgeCounts={{ counselor_messages_unread: 25 }} />));
    expect(messagesLink()).toHaveTextContent('9+');
    expect(messagesLink()).toHaveAccessibleName('Messages, 25 unread');

    rerender(withIntl(<MemberBottomTabs onMore={() => {}} badgeCounts={{ counselor_messages_unread: 0 }} />));
    expect(messagesLink()).toHaveAccessibleName('Messages');
    expect(messagesLink().textContent).toBe('Messages');
  });

  it('is the one nav#mobile-bottom-nav on the route (the cookie banner and skip link contract)', () => {
    render(withIntl(<MemberBottomTabs onMore={() => {}} />));
    expect(tabs()).toHaveAttribute('id', 'mobile-bottom-nav');
    expect(document.querySelectorAll('#mobile-bottom-nav')).toHaveLength(1);
  });

  it('More is a button carrying the "more" early-tap kind and reports the drawer state', () => {
    const onMore = vi.fn();
    const { rerender } = render(withIntl(<MemberBottomTabs onMore={onMore} />));
    const more = within(tabs()).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('type', 'button');
    expect(more).toHaveAttribute('data-early-tap', 'more');
    expect(more).toHaveAttribute('aria-controls', 'workspace-sidebar');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(tabs()).not.toHaveAttribute('inert');
    fireEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(onMore).toHaveBeenCalledWith(more);

    rerender(withIntl(<MemberBottomTabs onMore={onMore} menuOpen />));
    expect(screen.getByRole('button', { name: 'More', hidden: true })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Main tabs', hidden: true })).toHaveAttribute('inert');
  });

  it('ships the tab labels in every locale with identical key sets', () => {
    const keys = ['memberTabsLabel', 'tabHome', 'tabProgram', 'tabJobs', 'tabMessages', 'tabMore'] as const;
    for (const catalog of [messages, es, fr, pt]) {
      const nav = (catalog as unknown as { nav: Record<string, string> }).nav;
      for (const key of keys) expect(typeof nav[key], key).toBe('string');
    }
  });
});

describe('WorkspaceShell member tabs', () => {
  const member = (extra: Partial<React.ComponentProps<typeof WorkspaceShell>> = {}) => withIntl(
    <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS} workspaceLabel="Member portal"
      contextLabel="Alex" readOnlyAudit {...extra}>
      <h1>Home</h1>
    </WorkspaceShell>,
  );
  const employer = () => withIntl(
    <WorkspaceShell portalRole="employer" navItems={EMPLOYER_PORTAL_NAV_ITEMS} workspaceLabel="Employer portal"
      contextLabel="Contango IT" readOnlyAudit>
      <h1>Overview</h1>
    </WorkspaceShell>,
  );
  const drawer = (c: HTMLElement) => c.querySelector<HTMLElement>('#workspace-sidebar')!;
  const hamburger = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.workspace-menu-btn')!;

  it('renders for the member portal only', () => {
    const m = render(member());
    expect(screen.getByRole('navigation', { name: 'Main tabs' })).toBeInTheDocument();
    m.unmount();

    render(employer());
    expect(screen.queryByRole('navigation', { name: 'Main tabs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Staff bottom nav' })).toBeInTheDocument();
  });

  it('marks the shell root so the old top strip can step aside on phones', () => {
    const m = render(member());
    expect(m.container.querySelector('.workspace-shell-root')).toHaveAttribute('data-member-tabs', 'true');
    m.unmount();
    const e = render(employer());
    expect(e.container.querySelector('.workspace-shell-root')).not.toHaveAttribute('data-member-tabs');
  });

  it('server HTML already carries the four links with aria-current, one More button and its early-tap hook', () => {
    env.pathname = '/dashboard/program';
    const html = renderToString(member());
    const bar = html.match(/<nav[^>]*id="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(bar).not.toBe('');
    expect((bar.match(/<a /g) ?? []).length).toBe(4);
    expect((bar.match(/<button /g) ?? []).length).toBe(1);
    expect(bar).toMatch(/href="\/dashboard\/program"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dashboard\/program"/);
    expect(bar).toContain('data-early-tap="more"');
    expect(bar).not.toContain('data-early-tap="menu"');
    expect(bar).not.toMatch(/\binert\b/);
    // Exactly one nav carries the shared id on a member route.
    expect((html.match(/id="mobile-bottom-nav"/g) ?? []).length).toBe(1);
  });

  it('More opens the drawer, the hamburger still does, and both report expanded', async () => {
    const { container } = render(member());
    expect(drawer(container)).not.toHaveClass('open');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(drawer(container)).toHaveClass('open');
    expect(hamburger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'More', hidden: true })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Main tabs', hidden: true })).toHaveAttribute('inert');

    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(drawer(container)).not.toHaveClass('open');
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('navigation', { name: 'Main tabs' })).not.toHaveAttribute('inert');

    fireEvent.click(hamburger(container));
    expect(drawer(container)).toHaveClass('open');
  });

  it('returns focus to More after Escape when More opened the drawer, even though More was never focused (Safari)', async () => {
    const { container } = render(member());
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await flush();
    expect(drawer(container).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(drawer(container)).not.toHaveClass('open');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }));
  });

  it('returns focus to the hamburger after Escape when the hamburger opened the drawer', async () => {
    const { container } = render(member());
    // Safari again: nothing is focused when the hamburger is tapped, so the
    // trigger recorded at open time (the hamburger, not More) gets focus back.
    screen.getByRole('button', { name: 'More' }).focus();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(hamburger(container));
    await flush();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(document.activeElement).toBe(hamburger(container));
  });

  it('opens the drawer for a More tap that landed before the shell mounted, and focus returns to More on close', async () => {
    // The server-rendered More button, tapped before React attached anything.
    new Function(EARLY_TAP_SCRIPT)();
    const staticMore = document.createElement('button');
    staticMore.setAttribute('data-early-tap', 'more');
    document.body.appendChild(staticMore);
    staticMore.click();

    const { container } = render(member());
    expect(drawer(container)).toHaveClass('open');
    expect(hamburger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'More', hidden: true })).toHaveAttribute('aria-expanded', 'true');
    await flush();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }));
  });

  it('claims both early-tap kinds on mount, so a later tap on either is plain React', () => {
    new Function(EARLY_TAP_SCRIPT)();
    render(member());
    const state = win[EARLY_TAP_GLOBAL] as { ready: Record<string, true> };
    expect(state.ready).toEqual({ menu: true, more: true });
  });

  it('reads the unread count from the shell badge counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ counselor_messages_unread: 4 }),
    })));
    render(member({ readOnlyAudit: false }));
    await flush();
    await flush();
    expect(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('link', { name: /Messages/ }))
      .toHaveAccessibleName('Messages, 4 unread');
  });
});
