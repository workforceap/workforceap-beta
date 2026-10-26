import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import { EMPLOYER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { EARLY_TAP_GLOBAL, EARLY_TAP_SCRIPT } from '@/lib/portal/earlyShellTap';
import messages from '@/messages/en.json';

/**
 * Phone menu, round 2 (PR #2844 acceptance blocker): a tap on "Open menu" that
 * lands before hydration is replayed on mount, the mount no longer resets the
 * drawer, a route change still closes it, the server HTML does not freeze the
 * desktop rail, and closing returns focus to the trigger.
 */

const env = vi.hoisted(() => ({ wide: false, pathname: '/employer' }));
vi.mock('next/navigation', () => ({ usePathname: () => env.pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => <span>Theme</span> }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? 'Sign out'}</button>,
}));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

const win = window as unknown as Record<string, unknown>;

beforeEach(() => {
  env.wide = false;
  env.pathname = '/employer';
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

const tree = () => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <WorkspaceShell portalRole="employer" navItems={EMPLOYER_PORTAL_NAV_ITEMS} workspaceLabel="Employer portal"
      contextLabel="Contango IT" readOnlyAudit>
      <h1>Overview</h1>
    </WorkspaceShell>
  </NextIntlClientProvider>
);

const trigger = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.workspace-menu-btn')!;
const drawer = (c: HTMLElement) => c.querySelector<HTMLElement>('#workspace-sidebar')!;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

/** A tap on the server-rendered button, before React has attached anything. */
function tapBeforeHydration() {
  new Function(EARLY_TAP_SCRIPT)();
  const staticButton = document.createElement('button');
  staticButton.setAttribute('data-early-tap', 'menu');
  document.body.appendChild(staticButton);
  staticButton.click();
}

describe('WorkspaceShell phone menu around hydration', () => {
  it('opens the drawer for a tap that landed before the shell mounted', () => {
    tapBeforeHydration();
    const { container } = render(tree());
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(drawer(container)).toHaveClass('open');
    expect(drawer(container)).toHaveAttribute('role', 'dialog');
  });

  it('stays closed when nothing was tapped, and a later tap is plain React', () => {
    const { container } = render(tree());
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps an opened drawer open across re-renders on the same route (the mount no longer resets it)', () => {
    const { container, rerender } = render(tree());
    fireEvent.click(trigger(container));
    rerender(tree());
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
  });

  it('still closes the drawer on a real route change', () => {
    const { container, rerender } = render(tree());
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    env.pathname = '/employer/jobs';
    rerender(tree());
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });

  it('publishes data-shell-ready once mounted', () => {
    const { container } = render(tree());
    expect(container.querySelector('.workspace-shell-root')).toHaveAttribute('data-shell-ready', 'true');
  });

  it('returns focus to the trigger on Escape even though the opener never had focus (Safari)', async () => {
    const { container } = render(tree());
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(trigger(container));
    await flush();
    expect(drawer(container).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger(container));
  });
});

describe('desktop rail before hydration', () => {
  it('server HTML does not bake the phone-only inert / aria-hidden into the rail', () => {
    const html = renderToString(tree());
    const aside = html.match(/<aside id="workspace-sidebar"[^>]*>/)?.[0] ?? '';
    expect(aside).not.toBe('');
    expect(aside).not.toMatch(/\binert\b/);
    expect(aside).not.toContain('aria-hidden');
    expect(html).toContain('data-early-tap="menu"');
  });

  it('marks the closed phone drawer inert and hidden once mounted, and not the desktop rail', () => {
    env.wide = false;
    const phone = render(tree());
    expect(drawer(phone.container)).toHaveAttribute('inert');
    expect(drawer(phone.container)).toHaveAttribute('aria-hidden', 'true');
    phone.unmount();
    env.wide = true;
    const desktop = render(tree());
    expect(drawer(desktop.container)).not.toHaveAttribute('inert');
    expect(drawer(desktop.container)).not.toHaveAttribute('aria-hidden');
  });
});
