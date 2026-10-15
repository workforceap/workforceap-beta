// Regression: ISSUE-001 — Next links prefetched Astro-owned marketing routes as missing RSC endpoints.
// Found by /qa on 2026-08-30.
// Report: .gstack/qa-reports/qa-report-workforceap-org-2026-08-30-prod-burnin-all.md

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    scroll: _scroll,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
    scroll?: boolean;
  }) => (
    <a data-next-link="true" href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/i18n/client', () => ({
  useLocaleFromPath: () => 'en',
}));

import LocalizedLink from '@/components/LocalizedLink';
import { resolveLocalizedHref } from '@/lib/i18n/localizeHref';

afterEach(cleanup);

describe('ISSUE-001 cross-frontend link navigation', () => {
  it.each([
    ['/programs', '/en/programs'],
    ['/programs/data-analytics?ref=apply', '/en/programs/data-analytics?ref=apply'],
    ['/contact?topic=application', '/en/contact?topic=application'],
    ['/es/privacy', '/es/privacy'],
  ])('renders %s as a document-navigation anchor', (href, expectedHref) => {
    render(
      <LocalizedLink href={href} prefetch scroll={false}>
        Destination
      </LocalizedLink>,
    );

    const link = screen.getByRole('link', { name: 'Destination' });
    expect(link).toHaveAttribute('href', expectedHref);
    expect(link).not.toHaveAttribute('data-next-link');
    expect(link).not.toHaveAttribute('prefetch');
    expect(link).not.toHaveAttribute('scroll');
  });

  it.each(['/apply', '/dashboard', '/employers/signup', '/mentor/apply', '/blog', '/blog/new-cms-post', '/es/blog/new-cms-post'])(
    'keeps the Next router for application-owned route %s',
    (href) => {
      render(<LocalizedLink href={href}>Destination</LocalizedLink>);

      expect(screen.getByRole('link', { name: 'Destination' })).toHaveAttribute('data-next-link', 'true');
    },
  );

  it('gives server and client links the same Astro boundary decision', () => {
    expect(resolveLocalizedHref('/find-your-path#results', 'en')).toEqual({
      href: '/en/find-your-path#results',
      useDocumentNavigation: true,
    });
    expect(resolveLocalizedHref('/login?redirectTo=/dashboard', 'en')).toEqual({
      href: '/en/login?redirectTo=/dashboard',
      useDocumentNavigation: false,
    });
  });
});
