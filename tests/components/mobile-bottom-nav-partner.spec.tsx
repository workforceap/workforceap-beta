import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/** WAP-215: the partner phone tabs include the Attention queue, in place of Outcomes. */
vi.mock('next/navigation', () => ({ usePathname: () => '/partner' }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en' }));
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: { children: React.ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import MobileBottomNav from '@/components/MobileBottomNav';

afterEach(cleanup);

describe('partner mobile bottom nav', () => {
  it('keeps Attention and opens reporting through the Impact workspace', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MobileBottomNav variant="partner" />
      </NextIntlClientProvider>,
    );
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Overview', 'Members', 'Attention', 'Messages', 'Impact']);
    expect(screen.getByRole('link', { name: 'Attention' }).getAttribute('href')).toMatch(/\/partner\/attention$/);
    expect(screen.getByRole('link', { name: 'Impact' }).getAttribute('href')).toMatch(/\/partner\/impact$/);
  });

  it.each([
    ['es', es],
    ['fr', fr],
    ['pt', pt],
  ])('%s has an Attention tab label', (_locale, messages) => {
    const label = (messages as { nav: { mobileBottomNav: { partner: { attention?: string } } } }).nav.mobileBottomNav.partner.attention;
    expect(label).toEqual(expect.any(String));
    expect(label?.length).toBeGreaterThan(0);
  });
});
