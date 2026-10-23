import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MobileBottomNav from '@/components/MobileBottomNav';

const route = vi.hoisted(() => ({ pathname: '/counselor/today' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en' }));
afterEach(cleanup);

describe('mobile consolidated workspace navigation', () => {
  it('counselor Today replaces duplicate queue shortcuts while members, messages and sessions remain direct', () => {
    route.pathname = '/counselor/today';
    render(<NextIntlClientProvider locale="en" messages={en}><MobileBottomNav variant="counselor" /></NextIntlClientProvider>);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Today', 'Members', 'Messages', 'Sessions']);
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['counselor', '/counselor/inbox', 'Today'],
    ['counselor', '/es/counselor/at-risk', 'Today'],
    ['employer', '/employer/applications/application-1', 'Candidates'],
    ['employer', '/es/employer/matches', 'Candidates'],
    ['partner', '/partner/milestones', 'Impact'],
    ['partner', '/es/partner/exports', 'Impact'],
    ['admin', '/admin/members/member-1', 'Students'],
  ] as const)('%s highlights the same workspace as the rail on %s', (variant, pathname, label) => {
    route.pathname = pathname;
    render(<NextIntlClientProvider locale="en" messages={en}><MobileBottomNav variant={variant} /></NextIntlClientProvider>);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });
});
