import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';
import EmployerJobsActions from '@/components/employer/EmployerJobsActions';
import PartnerImpactHeader from '@/components/partner/PartnerImpactHeader';
import PartnerMembersList from '@/components/portal/PartnerMembersList';
import PartnerReferredMembersMobile from '@/components/partner/PartnerReferredMembersMobile';
import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import type { EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import { employerApplicationsListHref } from '@/lib/employer/employerApplicationsListQuery';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: vi.fn(() => new URLSearchParams(window.location.search)),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.mocked(useSearchParams).mockImplementation(() => new URLSearchParams(window.location.search) as ReturnType<typeof useSearchParams>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function localized(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

const candidateCopy = {
  title: 'Candidates', description: 'Review applications and suggested matches.', navLabel: 'Candidate views',
  views: { applicants: 'Applicants', matches: 'Matches', pipeline: 'Pipeline' },
};
const impactCopy = {
  title: 'Impact', description: 'Referral outcomes and milestones.', navLabel: 'Impact views',
  views: { outcomes: 'Outcomes', milestones: 'Milestones', exports: 'Exports' },
};

describe('workspace navigation', () => {
  it('has one Candidates h1 and link-based named views that retain the applicant query', () => {
    render(<EmployerCandidatesHeader activeView="matches" copy={candidateCopy} kicker="Employer portal" title="Match history" params={{ status: 'reviewing', page: '2', sort: 'applied_asc' }} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Candidates' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Match history' })).toBeVisible();
    const nav = within(screen.getByRole('navigation', { name: 'Candidate views' }));
    expect(nav.getAllByRole('link')).toHaveLength(3);
    expect(nav.getByRole('link', { name: 'Matches' })).toHaveAttribute('aria-current', 'page');
    const applicants = new URL(nav.getByRole('link', { name: 'Applicants' }).getAttribute('href')!, 'https://example.test');
    expect(Object.fromEntries(applicants.searchParams)).toEqual({ view: 'applicants', status: 'reviewing', page: '2', sort: 'applied_asc' });
    expect(nav.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('data-tour', 'tour-pipeline');
  });

  it('keeps Impact views distinct with one page title and a selected section', () => {
    render(<PartnerImpactHeader activeView="exports" copy={impactCopy} title="Exports" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Impact');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Exports');
    const nav = within(screen.getByRole('navigation', { name: 'Impact views' }));
    expect(nav.getByRole('link', { name: 'Exports' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Outcomes' })).toHaveAttribute('href', '/partner/impact?view=outcomes');
    expect(nav.getByRole('link', { name: 'Milestones' })).toHaveAttribute('href', '/partner/impact?view=milestones');
  });

  it('keeps posting and importing available in the same jobs action group', () => {
    const labels = { nav: 'Job actions', jobs: 'Jobs', post: 'Post job', import: 'Import jobs' };
    const { rerender } = render(<EmployerJobsActions labels={labels} />);
    const nav = screen.getByRole('navigation', { name: 'Job actions' });
    expect(within(nav).getByRole('link', { name: 'Post job' })).toHaveAttribute('href', '/employer/jobs/new');
    expect(within(nav).getByRole('link', { name: 'Import jobs' })).toHaveAttribute('href', '/employer/jobs/import');
    expect(nav.querySelector('a button')).toBeNull();
    rerender(<EmployerJobsActions labels={labels} current="import" showJobs />);
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/employer/jobs');
    expect(screen.queryByRole('link', { name: 'Import jobs' })).toBeNull();
  });
});

const referrals = [
  { id: 'm-1', fullName: 'Ada Member', stage: 'applied', stageLabel: 'Applied', progress: 0, programTitle: 'IT Support', story: '', referredAtLabel: 'Sep 1, 2026' },
  { id: 'm-2', fullName: 'Grace Member', stage: 'placed', stageLabel: 'Placed', progress: 100, programTitle: 'Data Analytics', story: '', referredAtLabel: 'Sep 2, 2026', placementVerified: true },
];

describe('record return context', () => {
  it('updates the router query used by record links when native history contains Next internal state', () => {
    window.history.replaceState({ __NA: true }, '', '/partner/referred-members');
    let routerQuery = window.location.search;
    vi.mocked(useSearchParams).mockImplementation(() => new URLSearchParams(routerQuery) as ReturnType<typeof useSearchParams>);
    const nativeReplace = window.history.replaceState.bind(window.history);
    // Next deliberately bypasses its router update for internal __NA/_N
    // writes; external writes copy that state and publish the new query.
    vi.spyOn(window.history, 'replaceState').mockImplementation((state, unused, href) => {
      const internal = state as { __NA?: boolean; _N?: boolean } | null;
      if (!internal?.__NA && !internal?._N && href) routerQuery = new URL(String(href), window.location.href).search;
      nativeReplace({ ...state, __NA: true }, unused, href);
    });
    const { rerender } = render(localized(<PartnerMembersList members={referrals} />));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Grace' } });
    const record = new URL(screen.getByRole('link', { name: 'Grace Member' }).getAttribute('href')!, 'https://example.test');
    expect(record.searchParams.get('returnTo')).toBe('/partner/referred-members?search=Grace');

    // A Back/Forward restore updates the router snapshot while the list
    // island can remain mounted; its input and rows must follow that URL.
    routerQuery = '?stage=applied';
    nativeReplace({ __NA: true }, '', `/partner/referred-members${routerQuery}`);
    rerender(localized(<PartnerMembersList members={referrals} />));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('applied');
    expect(screen.getByRole('link', { name: 'Ada Member' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Grace Member' })).toBeNull();
  });

  it('retains partner search/stage in a record link and restores them on the returned list', () => {
    window.history.replaceState(null, '', '/partner/referred-members?stage=placed');
    const { unmount } = render(localized(<PartnerMembersList members={referrals} />));
    expect(screen.getByRole('combobox', { name: 'Filter by member journey stage' })).toHaveValue('placed');
    expect(screen.queryByRole('link', { name: 'Ada Member' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Grace' } });
    const record = new URL(screen.getByRole('link', { name: 'Grace Member' }).getAttribute('href')!, 'https://example.test');
    expect(record.searchParams.get('returnTo')).toBe('/partner/referred-members?stage=placed&search=Grace');
    unmount();
    render(localized(<PartnerMembersList members={referrals} />));
    expect(screen.getByRole('searchbox')).toHaveValue('Grace');
    expect(screen.getByRole('combobox')).toHaveValue('placed');
    expect(screen.getByText('1 member shown')).toBeVisible();
  });

  it('retains the phone referral view without changing its existing count definition', () => {
    window.history.replaceState(null, '', '/partner/referred-members');
    const { unmount } = render(localized(<PartnerReferredMembersMobile rows={referrals} />));
    fireEvent.click(screen.getByRole('button', { name: 'Placed 1' }));
    expect(window.location.search).toBe('?referralView=placed');
    expect(screen.queryByRole('link', { name: /Ada Member/ })).toBeNull();
    const href = screen.getByRole('link', { name: /Grace Member/ }).getAttribute('href')!;
    expect(new URL(href, 'https://example.test').searchParams.get('returnTo')).toBe('/partner/referred-members?referralView=placed');
    unmount();
    render(localized(<PartnerReferredMembersMobile rows={referrals} />));
    expect(screen.getByRole('button', { name: 'Placed 1' })).toHaveAttribute('aria-pressed', 'true');
  });
});

function application(id: string, name: string): EmployerApplicationRow {
  return { id, jobId: 'job-1', status: 'reviewing', appliedAt: '2026-09-01T12:00:00Z', employerNotes: null, job: { id: 'job-1', title: 'Support Specialist' }, student: { id: `student-${id}`, fullName: name, email: `${id}@example.test` } };
}

it('phone applicants use the server filter, replace rows on pagination, and retain the query into application review', () => {
  window.history.replaceState(null, '', employerApplicationsListHref({ page: 2, status: 'reviewing', sort: 'applied_asc' }));
  const { rerender } = render(localized(<MobileApplicationsClient initialRows={[application('app-1', 'Ada Applicant')]} activeStatusFilter="reviewing" activeSort="applied_asc" />));
  expect(screen.getByRole('link', { name: 'Reviewing' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/employer/candidates?view=applicants&sort=applied_asc');
  fireEvent.click(screen.getByRole('button', { name: 'Expand details for Ada Applicant' }));
  const review = screen.getByRole('link', { name: messages.employer.applicationReviewMetaTitle });
  const target = new URL(review.getAttribute('href')!, 'https://example.test');
  expect(target.pathname).toBe('/employer/applications/app-1');
  expect(target.searchParams.get('returnTo')).toBe(window.location.pathname + window.location.search);
  rerender(localized(<MobileApplicationsClient initialRows={[application('app-2', 'Grace Applicant')]} activeStatusFilter="reviewing" activeSort="applied_asc" />));
  expect(screen.queryByRole('button', { name: /Ada Applicant/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Expand details for Grace Applicant' })).toBeVisible();
  rerender(localized(<MobileApplicationsClient initialRows={[]} activeStatusFilter="reviewing" activeSort="applied_asc" />));
  expect(screen.getByRole('heading', { name: 'No applicants match this filter' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Show all applicants' })).toHaveAttribute('href', '/employer/candidates?view=applicants&sort=applied_asc');
  rerender(localized(<MobileApplicationsClient initialRows={[]} activeStatusFilter={null} activeSort="applied_asc" />));
  expect(screen.getByRole('heading', { name: messages.employer.noApplicationsYet })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Show all applicants' })).toBeNull();
});
