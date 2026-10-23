import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import PortalRecordLink from '@/components/portal/PortalRecordLink';
import PortalBackLink from '@/components/portal/PortalBackLink';

const route = vi.hoisted(() => ({ pathname: '/admin/students', query: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.query),
}));
afterEach(cleanup);

function openRecord(href: string) {
  render(<PortalRecordLink href={href}>Open record</PortalRecordLink>);
  return new URL(screen.getByRole('link').getAttribute('href')!, 'https://example.test');
}

describe('workspace → record → workspace navigation', () => {
  it('preserves the current list instead of recursively carrying an older list', () => {
    route.pathname = '/admin/students';
    route.query = 'view=manage&search=Ana&page=3&returnTo=%2Fadmin%2Freporting';
    const link = openRecord('/admin/members/member-1?tab=notes');
    expect(link.searchParams.get('returnTo')).toBe('/admin/students?view=manage&search=Ana&page=3');
    expect(link.searchParams.get('tab')).toBe('notes');
  });

  it('keeps the original Jobs filters through a detail → edit hop', () => {
    route.pathname = '/employer/jobs/job-1';
    route.query = new URLSearchParams({ returnTo: '/employer/jobs?status=draft&page=2' }).toString();
    const link = openRecord('/employer/jobs/job-1/edit');
    expect(link.searchParams.get('returnTo')).toBe('/employer/jobs?status=draft&page=2');
  });

  it('does not propagate a forged cross-portal return on a detail hop', () => {
    route.pathname = '/employer/jobs/job-1';
    route.query = new URLSearchParams({ returnTo: '/admin/students' }).toString();
    expect(openRecord('/employer/jobs/job-1/edit').searchParams.has('returnTo')).toBe(false);
  });

  it('keeps an explicit locale on detail → edit even without a list origin', () => {
    route.pathname = '/es/employer/jobs/job-1';
    route.query = '';
    const link = openRecord('/employer/jobs/job-1/edit');
    expect(link.pathname).toBe('/es/employer/jobs/job-1/edit');
    expect(link.searchParams.has('returnTo')).toBe(false);
  });

  it('returns to a localized filtered list and names the action clearly', () => {
    route.pathname = '/es/partner/referred-members/member-1';
    route.query = new URLSearchParams({ returnTo: '/es/partner/referred-members?stage=training&search=Ana' }).toString();
    render(<NextIntlClientProvider locale="en" messages={en}><PortalBackLink fallbackHref="/partner/referred-members" fallbackLabel="Back to members" /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: 'Back to results' })).toHaveAttribute('href', '/es/partner/referred-members?stage=training&search=Ana');
  });

  it('uses the current locale for a direct record visit without a return destination', () => {
    route.pathname = '/es/counselor/students/member-1';
    route.query = '';
    render(<NextIntlClientProvider locale="en" messages={en}><PortalBackLink fallbackHref="/counselor/students" fallbackLabel="Back to members" /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: 'Back to members' })).toHaveAttribute('href', '/es/counselor/students');
  });
});
