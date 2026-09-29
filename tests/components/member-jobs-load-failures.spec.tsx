import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';

/**
 * WAP-261 item 1: a failed load on the member Jobs page is unknown, not zero.
 * The applications, open-roles and recommendations sections each say
 * "couldn't load" with Try again, instead of 0 KPIs and their empty states.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const renderKit = (props: Parameters<typeof MemberJobsKit>[0]) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MemberJobsKit {...props} />
    </NextIntlClientProvider>,
  );

describe('MemberJobsKit failed loads (WAP-261)', () => {
  it('pipeline failed: KPIs show "—" with a caption, and the applications card says it could not load', () => {
    renderKit({ pipelineLoadFailed: true, syncedLabel: '0 active applications' });
    const failed = screen.getByTestId('member-jobs-applications-load-failed');
    expect(failed).toHaveTextContent(en.empty.applicationsUnavailable.title);
    expect(within(failed).getByRole('link', { name: en.empty.applicationsUnavailable.action })).toHaveAttribute('href', '/dashboard/jobs');
    expect(screen.queryByText(en.empty.applications.title)).toBeNull();
    expect(screen.queryByText('0 active applications')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('open roles failed: says it could not load, not "no live openings"', () => {
    renderKit({ openRolesLoadFailed: true });
    expect(screen.getByTestId('member-jobs-openings-load-failed')).toHaveTextContent(en.empty.openingsUnavailable.title);
    expect(screen.queryByText(en.empty.openings.title)).toBeNull();
  });

  it('recommendations failed: says matches could not load, not the first-run prompt', () => {
    renderKit({ recommendationsLoadFailed: true });
    expect(screen.getByTestId('member-jobs-matches-load-failed')).toHaveTextContent(en.empty.matchesUnavailable.title);
    expect(screen.queryByText(en.empty.matches.title)).toBeNull();
  });

  it('everything loaded with nothing in it: honest zeros and the normal empty states', () => {
    renderKit({});
    expect(screen.getAllByText('0')).toHaveLength(4);
    expect(screen.getByText(en.empty.applications.title)).toBeInTheDocument();
    expect(screen.getByText(en.empty.openings.title)).toBeInTheDocument();
    expect(screen.queryByTestId('member-jobs-applications-load-failed')).toBeNull();
  });
});
