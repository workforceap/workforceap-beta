import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/**
 * Admin phone tabs (WAP-190). /admin/messages redirects anyone without
 * super-admin context back to /admin, and the rail hides that row for them,
 * so an org admin's third tab is Applications — the decision workbench —
 * instead of a Messages tab that bounces. Super-admins keep Messages.
 */
const location = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({ usePathname: () => location.pathname }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en' }));
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: { children: React.ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import MobileBottomNav from '@/components/MobileBottomNav';

function show(superAdmin?: boolean, messages: Record<string, unknown> = en, locale = 'en', search?: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MobileBottomNav variant="admin" superAdmin={superAdmin}
        search={search === undefined ? undefined : new URLSearchParams(search)} />
    </NextIntlClientProvider>,
  );
}

const tabs = () => within(screen.getByRole('navigation')).getAllByRole('link');

beforeEach(() => { location.pathname = '/admin'; });
afterEach(cleanup);

describe('admin mobile bottom nav', () => {
  it('gives an org admin Applications instead of the Messages tab that would bounce them', () => {
    show(false);
    expect(tabs().map((a) => a.textContent)).toEqual(['Today', 'Students', 'Applications']);
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toMatch(/\/admin\/command-center\?queue=applications$/);
    expect(screen.queryByRole('link', { name: 'Messages' })).toBeNull();
    for (const link of tabs()) expect(link.getAttribute('href')).not.toMatch(/\/admin\/messages/);
  });

  it('defaults to the org-admin tabs when the shell does not say super-admin', () => {
    show();
    expect(screen.queryByRole('link', { name: 'Messages' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Applications' })).toBeInTheDocument();
  });

  it('keeps Messages for a super-admin', () => {
    show(true);
    expect(tabs().map((a) => a.textContent)).toEqual(['Today', 'Students', 'Messages']);
    expect(screen.getByRole('link', { name: 'Messages' }).getAttribute('href')).toMatch(/\/admin\/messages$/);
  });

  it.each(['queue=applications', 'queue=applications&page=2'])(
    'marks Applications current on the Applications workbench (?%s)',
    (search) => {
      location.pathname = '/admin/command-center';
      show(false, en, 'en', search);
      expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
    },
  );

  it.each(['queue=needs-reply', 'queue=at-risk', 'queue=interviewing', ''])(
    'marks no tab current on the other workbench views (?%s)',
    (search) => {
      location.pathname = '/admin/command-center';
      show(false, en, 'en', search);
      for (const link of tabs()) expect(link).not.toHaveAttribute('aria-current');
    },
  );

  it('never marks the query-string tab current without the page query', () => {
    location.pathname = '/admin/command-center';
    show(false);
    expect(screen.getByRole('link', { name: 'Applications' })).not.toHaveAttribute('aria-current');
  });

  it.each([['es', es, 'Solicitudes'], ['fr', fr, 'Candidatures'], ['pt', pt, 'Candidaturas']] as const)(
    'labels the Applications tab in %s',
    (locale, messages, label) => {
      show(false, messages as Record<string, unknown>, locale);
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    },
  );
});
