import { act, useLayoutEffect } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import { MEMBER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import messages from '@/messages/en.json';
import spanishMessages from '@/messages/es.json';
import frenchMessages from '@/messages/fr.json';
import portugueseMessages from '@/messages/pt.json';

const navMessages = { en: messages.nav, es: spanishMessages.nav, fr: frenchMessages.nav, pt: portugueseMessages.nav };
type TestLocale = keyof typeof navMessages;

const route = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => null }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => null }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

let root: Root | undefined;
let host: HTMLDivElement;
let earlyMenuDisabled: boolean | undefined;
beforeEach(() => {
  route.pathname = '/dashboard';
  earlyMenuDisabled = undefined;
  host = document.createElement('div');
  document.body.append(host);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

/** Attempt activation after the hydrated button commits, before readiness is set. */
function EarlyMenuActivation() {
  useLayoutEffect(() => {
    const menu = document.querySelector<HTMLButtonElement>('.workspace-menu-btn');
    earlyMenuDisabled = menu?.disabled;
    menu?.focus();
    menu?.click();
  }, []);
  return null;
}

function workspace(earlyActivation = false, locale: TestLocale = 'en') {
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...messages, nav: { ...messages.nav, ...navMessages[locale] } }}>
      <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS} workspaceLabel="Member portal" contextLabel="Account" readOnlyAudit>
        {earlyActivation ? <EarlyMenuActivation /> : null}
        <h1>Home</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>
  );
}

async function hydrate(earlyActivation = false) {
  const ui = workspace(earlyActivation);
  host.innerHTML = renderToString(ui);
  await act(async () => { root = hydrateRoot(host, ui); });
  return within(host);
}

describe('mobile menu during shell hydration', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('renders an unavailable menu with localized loading feedback before %s hydration', (locale) => {
    host.innerHTML = renderToString(workspace(false, locale));
    const menu = within(host).getByRole('button', { name: navMessages[locale].openMenu });
    expect(menu).toBeDisabled();
    expect(menu).toHaveAttribute('aria-busy', 'true');
    expect(menu).toHaveAccessibleDescription(navMessages[locale].menuLoading);
    expect(menu).toHaveAttribute('title', navMessages[locale].menuLoading);
    expect(menu.querySelector('svg')).toHaveClass('lucide-hourglass');
    menu.click();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('enables after mount, stays ready on the same path, and closes only after a real route change', async () => {
    const view = await hydrate(true);
    const menu = view.getByRole('button', { name: 'Open menu' });
    expect(earlyMenuDisabled).toBe(true);
    expect(menu).toBeEnabled();
    expect(menu).toHaveAttribute('aria-busy', 'false');
    expect(menu).not.toHaveAttribute('aria-describedby');
    expect(menu).not.toHaveAttribute('title');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu.querySelector('svg')).toHaveClass('lucide-menu');
    await userEvent.setup().click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(view.getByRole('dialog', { name: 'Member portal navigation' })).not.toHaveAttribute('inert');
    await waitFor(() => expect(view.getByRole('button', { name: 'Close menu' })).toHaveFocus());

    await act(async () => { root!.render(workspace(true)); });
    expect(menu).toBeEnabled();
    expect(menu).toHaveAttribute('aria-expanded', 'true');

    route.pathname = '/dashboard/jobs';
    await act(async () => { root!.render(workspace(true)); });
    expect(menu).toBeEnabled();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(host.querySelector('#workspace-sidebar')).toHaveAttribute('inert');
    expect(menu).toHaveFocus();
  });

  it('retains native Enter activation and Escape focus restoration after hydration', async () => {
    const view = await hydrate();
    const user = userEvent.setup();
    const menu = view.getByRole('button', { name: 'Open menu' });
    menu.focus();
    await user.keyboard('{Enter}');
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(view.getByRole('button', { name: 'Close menu' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });
});
