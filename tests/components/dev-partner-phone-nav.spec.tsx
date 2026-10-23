import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

const route = vi.hoisted(() => ({ pathname: '/dev/staff/partner' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en' }));
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: { children: React.ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import DevPartnerFrame from '@/app/dev/staff/DevPartnerFrame';
import MobileBottomNav from '@/components/MobileBottomNav';

afterEach(cleanup);

function renderFixture() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DevPartnerFrame><h1>Synthetic fixture</h1></DevPartnerFrame>
    </NextIntlClientProvider>,
  );
}

describe('partner phone navigation in dev fixtures', () => {
  it.each([
    ['/dev/staff/partner', 'Overview'],
    ['/dev/staff/partner-command', 'Overview'],
    ['/dev/staff/partner-members', 'Members'],
    ['/dev/staff/partner-member-detail', 'Members'],
  ])('%s shows real destinations and the corresponding current tab', (pathname, current) => {
    route.pathname = pathname;
    renderFixture();
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Members', 'Attention', 'Messages', 'Impact']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/en/partner', '/en/partner/referred-members', '/en/partner/attention', '/en/partner/messages', '/en/partner/impact',
    ]);
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toEqual([
      screen.getByRole('link', { name: current }),
    ]);
    expect(screen.getByRole('note')).toHaveTextContent('synthetic data');
  });

  it.each(['/dev/staff/counselors', '/dev/staff/partner-not-a-fixture'])('leaves unrelated lab %s without partner chrome', (pathname) => {
    route.pathname = pathname;
    renderFixture();
    expect(screen.getByRole('heading', { name: 'Synthetic fixture' })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps production current-route detection when no fixture route is supplied', () => {
    route.pathname = '/partner/attention';
    render(<NextIntlClientProvider locale="en" messages={en}><MobileBottomNav variant="partner" /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: 'Attention' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });
});
