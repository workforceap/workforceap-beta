import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';

const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'es', user: vi.fn(), employer: vi.fn(), rows: vi.fn(), count: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: mocks.employer }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: async () => '/employer/setup' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { jobPostingApplication: { findMany: mocks.rows, count: mocks.count } } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async (value: unknown) => value }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'es' ? es : en, namespace: 'employer' }) }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, usePathname: () => '/employer/applications' }));
vi.mock('@/components/employer/EmployerApplicationsClient', () => ({ default: () => <div>Desktop applicants fixture</div> }));
vi.mock('@/components/employer/MobileApplicationsClient', () => ({ default: () => <div>Mobile applicants fixture</div> }));
vi.mock('@/components/employer/EmployerApplicationsPager', () => ({ default: () => null }));

import EmployerApplicationsPage from '@/app/(portal)/employer/applications/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locale = 'en';
  mocks.user.mockResolvedValue({ id: 'fixture-user' });
  mocks.employer.mockResolvedValue({ employerId: 'fixture-employer' });
  mocks.rows.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
afterEach(cleanup);

describe('employer page opener', () => {
  it('preserves long titles and interactive actions, with no breadcrumb row, without a client locale provider', () => {
    const exportCsv = vi.fn();
    const title = 'Applications for a very long international company name and a translated specialist position';
    render(<EmployerPageOpener kicker="Employer portal" title={title} subtitle="Review the current hiring queue." action={<><a href="/employer/jobs/new">Post a job</a><button onClick={exportCsv}>Export CSV</button></>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText('Employer portal')).toBeInTheDocument();
    expect(screen.getByText('Review the current hiring queue.')).toHaveClass('wa-page-opener-lede');
    // KIT_GUIDE §6: the opener is kicker + h1 + lede — never a PageHeader breadcrumb row.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('link', { name: 'Post a job' })).toHaveAttribute('href', '/employer/jobs/new');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportCsv).toHaveBeenCalledTimes(1);
  });

  it.each(['en', 'es'] as const)('renders the actual applicants route in %s with responsive copy, navigation and employer-scoped filters', async (locale) => {
    mocks.locale = locale;
    const copy = (locale === 'es' ? es : en).employer;
    render(await EmployerApplicationsPage({ searchParams: Promise.resolve({ page: '2', status: 'reviewing', sort: 'applied_asc' }) }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${copy.applicantsMetaTitle} — ${copy.filtered} (0)`);
    expect(screen.getByText(copy.reviewCandidatesMobile)).toHaveClass('md:wa-hidden');
    expect(screen.getByText(copy.reviewCandidatesDesktop)).toHaveClass('md:wa-block');
    expect(screen.getByText(copy.employerPortal)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(screen.getByRole('link', { name: copy.postJob })).toHaveAttribute('href', '/employer/jobs/new');
    expect(screen.getByRole('link', { name: copy.postAJobBtn })).toHaveAttribute('href', '/employer/jobs/new');
    expect(screen.getByText('Desktop applicants fixture')).toBeInTheDocument();
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'fixture-employer' }, status: 'reviewing' }, skip: 25, take: 25, orderBy: { appliedAt: 'asc' } }));
    expect(mocks.count).toHaveBeenCalledWith({ where: { job: { employerId: 'fixture-employer' }, status: 'reviewing' } });
  });

  it('keeps authentication and employer linking ahead of page reads and presentation', async () => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(EmployerApplicationsPage({})).rejects.toThrow('redirect:/login?redirectTo=/employer/applications');
    expect(mocks.employer).not.toHaveBeenCalled();
    expect(mocks.rows).not.toHaveBeenCalled();
    mocks.employer.mockResolvedValueOnce(null);
    await expect(EmployerApplicationsPage({})).rejects.toThrow('redirect:/employer/setup');
    expect(mocks.rows).not.toHaveBeenCalled();
  });
});
