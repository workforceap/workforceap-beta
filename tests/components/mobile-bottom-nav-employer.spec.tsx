import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/** WAP-211: the employer phone tabs lead with the Work queue, not the match pipeline. */
vi.mock('next/navigation', () => ({ usePathname: () => '/employer' }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en' }));
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: { children: React.ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import MobileBottomNav from '@/components/MobileBottomNav';

afterEach(cleanup);

describe('employer mobile bottom nav', () => {
  it('shows Overview, Jobs, Queue and Messages, with Queue opening the work queue', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MobileBottomNav variant="employer" />
      </NextIntlClientProvider>,
    );
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Overview', 'Jobs', 'Queue', 'Messages']);
    expect(screen.getByRole('link', { name: 'Queue' }).getAttribute('href')).toMatch(/\/employer\/work-queue$/);
    for (const link of links) expect(link.getAttribute('href')).not.toMatch(/\/employer\/pipeline/);
  });

  it.each([
    ['es', es],
    ['fr', fr],
    ['pt', pt],
  ])('%s translates the Queue tab', (locale, messages) => {
    const label = (messages as { nav: { mobileBottomNav: { employer: { workQueue?: string } } } }).nav.mobileBottomNav.employer.workQueue;
    expect(label).toEqual(expect.any(String));
    expect(label).not.toBe('Queue');
  });
});
