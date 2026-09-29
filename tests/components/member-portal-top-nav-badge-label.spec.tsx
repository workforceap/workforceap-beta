import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import MemberPortalTopNav from '@/components/portal/MemberPortalTopNav';

// WAP-263 item 3: the Job applications badge counts the member's own pending
// applications, so it must not be announced as "N unread". Messages still is.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function badgeLabel(tabName: string) {
  const strip = within(screen.getByRole('navigation'));
  const link = strip.getAllByRole('link').find((node) => node.textContent?.startsWith(tabName));
  return link?.querySelector('.member-portal-top-nav__badge')?.getAttribute('aria-label');
}

function renderWith(locale: 'en' | 'es') {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : es} timeZone="America/Chicago">
      <MemberPortalTopNav badgeCounts={{ applications_new: 3, counselor_messages_unread: 2 }} />
    </NextIntlClientProvider>,
  );
}

describe('MemberPortalTopNav badge labels', () => {
  it('announces pending applications as waiting on employers, not unread', () => {
    renderWith('en');
    expect(badgeLabel(en.nav.jobApplications)).toBe('3 waiting on employers');
    expect(badgeLabel(en.nav.counselorChat)).toBe('2 unread');
  });

  it('does the same in Spanish', () => {
    renderWith('es');
    const label = badgeLabel(es.nav.jobApplications);
    expect(label).toBe('3 en espera de empleadores');
    expect(label).not.toContain('sin leer');
  });
});
