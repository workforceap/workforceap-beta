import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import CookieConsentBanner from './CookieConsentBanner';
import { COOKIE_CONSENT_KEY } from '@/lib/consent/state';
import { pickRootClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { CONSENT_AWARE_SCREEN_MIN_HEIGHT, COOKIE_CONSENT_RESERVE_VAR } from '@/lib/consent/reserve';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

let pathname = '/en/apply';
let bannerHeight = 96;
let navHeight = 68;
const measurements: ResizeObserverCallback[] = [];
const gtag = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function view(locale: 'en' | 'es' | 'fr' | 'pt' = 'en') {
  const messages = { en, es, fr, pt }[locale];
  return (
    <NextIntlClientProvider locale={locale} messages={pickRootClientMessages(messages)}>
      <button type="button">Outside action</button>
      <CookieConsentBanner />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  pathname = '/en/apply';
  bannerHeight = 96;
  navHeight = 68;
  measurements.length = 0;
  localStorage.clear();
  document.body.style.paddingBottom = '32px';
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  Object.defineProperty(window, 'gtag', { configurable: true, value: gtag });
  gtag.mockReset();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { measurements.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.id === 'mobile-bottom-nav' ? navHeight : this.tagName === 'SECTION' ? bannerHeight : 0;
    return { x: 0, y: 0, top: window.innerHeight - height, bottom: window.innerHeight,
      left: 0, right: 390, width: 390, height, toJSON: () => ({}) };
  });
});

afterEach(() => {
  cleanup();
  document.getElementById('mobile-bottom-nav')?.remove();
  document.body.style.paddingBottom = '';
  document.documentElement.style.removeProperty('--cookie-consent-reserve');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CookieConsentBanner', () => {
  it('offers a nonmodal region without taking focus or disabling outside actions', () => {
    const { rerender } = render(view());
    const outside = screen.getByRole('button', { name: 'Outside action' });
    outside.focus();
    rerender(view());
    expect(outside).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Cookie preferences' })).not.toHaveAttribute('aria-modal');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Cookie preferences' })).toHaveAttribute('data-placement', 'fixed');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/en/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/en/terms');
  });

  it.each([
    ['Accept', 'accepted', 'granted'],
    ['Decline', 'declined', 'denied'],
  ])('persists %s and updates analytics consent only after the decision', (button, decision, value) => {
    const { unmount } = render(view());
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBeNull();
    expect(gtag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY)!)).toMatchObject({ decision });
    expect(gtag).toHaveBeenCalledExactlyOnceWith('consent', 'update', {
      ad_storage: value, ad_user_data: value, ad_personalization: value, analytics_storage: value,
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    unmount();
    render(view());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('honors GPC without displaying a banner or reserving space', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    render(view());
    expect(JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY)!)).toMatchObject({ decision: 'declined', fromGpc: true });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    expect(gtag).toHaveBeenCalledOnce();
  });

  it.each(['/dashboard', '/es/admin/students', '/fr/counselor', '/pt/partner/messages', '/dev/member/home'])(
    'does not reserve space or steal focus on suppressed route %s', (route) => {
      pathname = route;
      render(view());
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(document.body.style.paddingBottom).toBe('32px');
      expect(measurements).toHaveLength(0);
      expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBeNull();
    },
  );

  it('measures wrapping and bottom navigation, then restores padding on portal navigation', () => {
    const nav = document.createElement('nav');
    nav.id = 'mobile-bottom-nav';
    document.body.appendChild(nav);
    const { rerender } = render(view());
    expect(document.body.style.paddingBottom).toBe('196px'); // base 32 + banner 96 + navigation 68
    bannerHeight = 176;
    navHeight = 84;
    act(() => measurements[0]([], {} as ResizeObserver));
    expect(document.body.style.paddingBottom).toBe('292px');
    pathname = '/dashboard';
    rerender(view());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('32px');
    pathname = '/es/apply';
    rerender(view('es'));
    expect(screen.getByRole('region', { name: 'Preferencias de cookies' })).toBeInTheDocument();
    expect(document.body.style.paddingBottom).toBe('292px');
  });

  it('publishes its reserved height for focus scroll-margin and clears it when hidden', () => {
    // Desktop /login (1280x900): the 100vh-centered form kept its submit at y 778-836 under an
    // 81px banner at y 819, and Tab focus never scrolled because body padding cannot move
    // centered content. main.css turns this variable into scroll-margin-bottom on focusables.
    const reserve = () => document.documentElement.style.getPropertyValue('--cookie-consent-reserve');
    const nav = document.createElement('nav');
    nav.id = 'mobile-bottom-nav';
    document.body.appendChild(nav); // hidden (0px) on desktop
    bannerHeight = 81;
    navHeight = 0;
    const { rerender } = render(view());
    expect(reserve()).toBe('81px');
    expect(document.body.style.paddingBottom).toBe('113px'); // base 32 + banner 81
    bannerHeight = 96;
    navHeight = 68;
    act(() => measurements[0]([], {} as ResizeObserver));
    expect(reserve()).toBe('164px'); // banner 96 + bottom nav 68, matching the body reservation
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(reserve()).toBe('');
    pathname = '/dashboard';
    rerender(view());
    expect(reserve()).toBe('');
  });

  it('is backed by a global scroll-margin rule that reads the reserve and rests at 0px', () => {
    const mainCss = readFileSync(path.resolve(__dirname, '../css/main.css'), 'utf8');
    expect(mainCss).toMatch(/:root\s*\{\s*--cookie-consent-reserve:\s*0px;\s*\}/);
    const rule = mainCss.match(/\na, button, input, select, textarea, summary, \[tabindex\]\s*\{([^}]*)\}/)?.[1];
    expect(rule).toBeTruthy();
    expect(rule).toContain('scroll-margin-bottom: var(--cookie-consent-reserve)');
  });

  it.each([
    ['es', 'Aceptar', 'Rechazar'],
    ['fr', 'Accepter', 'Refuser'],
    ['pt', 'Aceitar', 'Recusar'],
  ] as const)('renders %s consent copy and localizes the Astro legal destinations', (locale, accept, decline) => {
    // WAP-148 (c): /es/login used to link the English /privacy and /terms.
    pathname = `/${locale}/apply`;
    render(view(locale));
    expect(screen.getByRole('button', { name: accept })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: decline })).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href')))
      .toEqual([`/${locale}/privacy`, `/${locale}/terms`]);
  });

  it.each([
    ['/en/login', 'Cookie preferences', '/en/privacy'],
    ['/es/login', 'Preferencias de cookies', '/es/privacy'],
    ['/en/signup', 'Cookie preferences', '/en/privacy'],
    ['/es/forgot-password', 'Preferencias de cookies', '/es/privacy'],
  ] as const)('renders in flow on auth screen %s so no control paints under it', (route, label, privacyHref) => {
    // WAP-148 (a): at 1280x900 the fixed bar covered 23% of Sign In and at 390x844 the whole
    // remember-me checkbox, because body padding cannot move a 100vh-centered form. On auth
    // routes the notice is in flow after the page and only publishes the reserve the screens
    // subtract from their min-height; the body is not padded a second time.
    const reserve = () => document.documentElement.style.getPropertyValue(COOKIE_CONSENT_RESERVE_VAR);
    const nav = document.createElement('nav');
    nav.id = 'mobile-bottom-nav';
    document.body.appendChild(nav);
    bannerHeight = 81;
    navHeight = 68;
    pathname = route;
    render(view(route.startsWith('/es') ? 'es' : 'en'));
    const region = screen.getByRole('region', { name: label });
    expect(region).toHaveAttribute('data-placement', 'in-flow');
    expect(region.style.getPropertyValue('--cookie-consent-bottom')).toBe('0px');
    expect(reserve()).toBe('81px');
    expect(document.body.style.paddingBottom).toBe('32px');
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', privacyHref);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'Accept' || b.textContent === 'Aceptar')!);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(reserve()).toBe('');
    expect(document.body.style.paddingBottom).toBe('32px');
  });

  it('keeps the reserve current when the in-flow notice rewraps, and pads the body again off auth routes', () => {
    pathname = '/en/login';
    bannerHeight = 81;
    const { rerender } = render(view());
    expect(document.documentElement.style.getPropertyValue(COOKIE_CONSENT_RESERVE_VAR)).toBe('81px');
    bannerHeight = 120;
    act(() => measurements[0]([], {} as ResizeObserver));
    expect(document.documentElement.style.getPropertyValue(COOKIE_CONSENT_RESERVE_VAR)).toBe('120px');
    expect(document.body.style.paddingBottom).toBe('32px');
    pathname = '/en/apply';
    rerender(view());
    expect(screen.getByRole('region')).toHaveAttribute('data-placement', 'fixed');
    expect(document.body.style.paddingBottom).toBe('152px'); // base 32 + banner 120
  });

  it('is placed in flow by the stylesheet and subtracted from the 100vh auth screens', () => {
    const moduleCss = readFileSync(path.resolve(__dirname, './CookieConsentBanner.module.css'), 'utf8');
    const inFlowRule = moduleCss.match(/\.banner\[data-placement='in-flow'\]\s*\{([^}]*)\}/)?.[1];
    expect(inFlowRule).toBeTruthy();
    expect(inFlowRule).toContain('position: static');
    expect(CONSENT_AWARE_SCREEN_MIN_HEIGHT).toBe(`calc(100vh - var(${COOKIE_CONSENT_RESERVE_VAR}, 0px))`);
    for (const screenFile of ['../app/(auth)/login/LoginForm.tsx', '../app/(auth)/signup/SignupForm.tsx']) {
      const source = readFileSync(path.resolve(__dirname, screenFile), 'utf8');
      expect(source).toContain("from '@/lib/consent/reserve'");
      expect(source).toContain('minHeight: CONSENT_AWARE_SCREEN_MIN_HEIGHT,');
      expect(source).not.toMatch(/minHeight:\s*'100vh'/);
    }
  });
});
