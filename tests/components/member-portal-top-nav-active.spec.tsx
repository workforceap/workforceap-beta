import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MemberPortalTopNav from '@/components/portal/MemberPortalTopNav';

/**
 * WAP-263 items 1 and 2: the member phone nav (MemberPortalTopNav) marks the
 * same destination current as the desktop rail.
 *   1. On /es, /fr and /pt the URL keeps the locale prefix, so the tab for the
 *      page must still be current (the rail strips the locale first).
 *   2. Rail aliases count: /dashboard/ai-tools/application-tracker belongs to
 *      Job applications, not to AI Career Tools.
 */

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function renderAt(pathname: string, locale = 'en', hrefMap?: Record<string, string>) {
  nav.pathname = pathname;
  render(
    // English strings keep the labels stable; the provider's locale is what
    // useLocale() returns, as next-intl does for a /{locale}/… request.
    <NextIntlClientProvider locale={locale} messages={en} timeZone="America/Chicago">
      <MemberPortalTopNav hrefMap={hrefMap} />
    </NextIntlClientProvider>,
  );
  return within(screen.getByRole('navigation', { name: 'Member portal' }));
}

function currentLabels(strip: ReturnType<typeof renderAt>): string[] {
  return strip
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent ?? '');
}

describe('MemberPortalTopNav current tab (WAP-263)', () => {
  it.each(['es', 'fr', 'pt'])('on /%s/dashboard/messages, Messages is the current tab', (locale) => {
    const strip = renderAt(`/${locale}/dashboard/messages`, locale);
    expect(strip.getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
    expect(currentLabels(strip)).toEqual(['Messages']);
  });

  it('on /es/dashboard, Home is the current tab', () => {
    const strip = renderAt('/es/dashboard', 'es');
    expect(currentLabels(strip)).toEqual(['Home']);
  });

  it('on /es/dashboard/ai-tools/resume-studio, AI Career Tools is the current tab', () => {
    const strip = renderAt('/es/dashboard/ai-tools/resume-studio', 'es');
    expect(currentLabels(strip)).toEqual(['AI Career Tools']);
  });

  it('keeps the tab hrefs locale-less, like the rail', () => {
    const strip = renderAt('/es/dashboard/messages', 'es');
    expect(strip.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/dashboard/messages');
    expect(strip.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
  });

  it('on /dashboard/ai-tools/application-tracker, Job applications is current and AI Career Tools is not', () => {
    const strip = renderAt('/dashboard/ai-tools/application-tracker');
    expect(strip.getByRole('link', { name: 'Job applications' })).toHaveAttribute('aria-current', 'page');
    expect(strip.getByRole('link', { name: 'AI Career Tools' })).not.toHaveAttribute('aria-current');
    expect(currentLabels(strip)).toEqual(['Job applications']);
  });

  it('on a Profile alias (/dashboard/settings), Profile is the current tab', () => {
    const strip = renderAt('/dashboard/settings');
    expect(currentLabels(strip)).toEqual(['Profile']);
  });

  it('on /dashboard, Home is the current tab', () => {
    const strip = renderAt('/dashboard');
    expect(currentLabels(strip)).toEqual(['Home']);
  });

  it('on /dashboard/eligibility (no tab of its own), nothing is current', () => {
    const strip = renderAt('/dashboard/eligibility');
    expect(currentLabels(strip)).toEqual([]);
  });

  it('keeps AI Career Tools in the strip', () => {
    const strip = renderAt('/dashboard');
    expect(strip.getByRole('link', { name: 'AI Career Tools' })).toHaveAttribute('href', '/dashboard/ai-tools');
  });

  it('with a dev hrefMap, matches the remapped hrefs and shows only mapped tabs', () => {
    const hrefMap = {
      '/dashboard': '/dev/member/home',
      '/dashboard/messages': '/dev/member/messages',
      '/dashboard/ai-tools': '/dev/member/toolkit',
    };
    const strip = renderAt('/dev/member/messages', 'en', hrefMap);
    expect(strip.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/dev/member/home',
      '/dev/member/messages',
      '/dev/member/toolkit',
    ]);
    expect(currentLabels(strip)).toEqual(['Messages']);
    cleanup();
    expect(currentLabels(renderAt('/dev/member/home', 'en', hrefMap))).toEqual(['Home']);
  });
});
