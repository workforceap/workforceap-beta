import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MemberPortalTopNav from '@/components/portal/MemberPortalTopNav';

/**
 * The member phone nav (shown at <=768px on every member page) must not ask
 * Next for a full prefetch of any tab. `prefetch` (true) on Home rendered the
 * whole member home (loadMemberDashboardHome) in the background from every
 * phone member page; the rail, header and footer links all use
 * `prefetch={false}`, and the tabs match them.
 */

const nav = vi.hoisted(() => ({ pathname: '/dashboard/referrals' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Record the prefetch prop each Link receives, since the rendered <a> drops it.
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...rest }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean | 'auto' | null;
  } & Record<string, unknown>) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'unset' : String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function tabsAt(pathname: string) {
  nav.pathname = pathname;
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="America/Chicago">
      <MemberPortalTopNav />
    </NextIntlClientProvider>,
  );
  return within(screen.getByRole('navigation', { name: 'Member portal' })).getAllByRole('link');
}

describe('MemberPortalTopNav prefetch', () => {
  it.each(['/dashboard/referrals', '/dashboard/resources', '/dashboard'])(
    'on %s no tab, Home included, requests a full prefetch',
    (pathname) => {
      const links = tabsAt(pathname);
      expect(links.length).toBeGreaterThan(1);
      const home = links.find((link) => link.getAttribute('href') === '/dashboard');
      expect(home, 'Home tab').toBeDefined();
      for (const link of links) {
        expect(link.getAttribute('data-prefetch'), link.getAttribute('href') ?? '').toBe('false');
      }
    },
  );
});
