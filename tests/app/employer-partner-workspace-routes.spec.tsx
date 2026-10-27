import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), employer: vi.fn(), partner: vi.fn(),
  applications: vi.fn(), applicationCount: vi.fn(), matches: vi.fn(), matchCount: vi.fn(), jobs: vi.fn(), jobCount: vi.fn(),
  referrals: vi.fn(), referralCount: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getTranslations: async (namespace: 'employer' | 'partner') => (key: string) => (en[namespace] as Record<string, unknown>)[key] ?? key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: mocks.employer, getPartnerForUser: mocks.partner }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: async () => '/employer/setup', unlinkedPartnerHref: async () => '/partner/setup' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  jobPostingApplication: { findMany: mocks.applications, count: mocks.applicationCount },
  aIJobMatch: { findMany: mocks.matches, count: mocks.matchCount },
  job: { findMany: mocks.jobs, count: mocks.jobCount },
} }));
vi.mock('@/lib/partner/referralBundle', () => ({ loadPartnerReferralBundle: mocks.referrals, countPartnerReferrals: mocks.referralCount }));
vi.mock('@/components/employer/EmployerApplicationsClient', () => ({ default: ({ initialRows }: { initialRows: { id: string }[] }) => <p data-testid="applicant-table">{initialRows.map((row) => row.id).join(',')}</p> }));
vi.mock('@/components/employer/MobileApplicationsClient', () => ({ default: () => <p>Phone applicant controls</p> }));
vi.mock('@/components/employer/EmployerApplicationsPager', () => ({ default: () => null }));
vi.mock('@/components/employer/EmployerMatchHistoryClient', () => ({ default: ({ initialRows }: { initialRows: { id: string; applicationId: string | null }[] }) => <p data-testid="match-table">{initialRows.map((row) => `${row.id}:${row.applicationId ?? 'no application'}`).join(',')}</p> }));
vi.mock('@/components/employer/EmployerKanban', () => ({ default: () => <p>Live pipeline controls</p> }));
vi.mock('@/components/employer/EmployerMatchStatusSelect', () => ({ default: () => null }));
vi.mock('@/components/partner/PartnerMilestonesView', () => ({ default: () => <p>Authorized milestone feed</p> }));
vi.mock('@/components/partner/PartnerMilestonesMobile', () => ({ default: () => <p>Phone milestone feed</p> }));
vi.mock('@/components/partner/PartnerEmptyState', () => ({ default: () => <p>No pending reviews</p> }));
vi.mock('@/components/portal/kit/pages/PartnerOverviewKit', () => ({ PartnerKpiGrid: ({ items }: { items: { label: string; value: number }[] }) => <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> }));

import EmployerCandidatesPage from '@/app/(portal)/employer/candidates/page';
import EmployerApplicationsPage from '@/app/(portal)/employer/applications/page';
import EmployerMatchesPage from '@/app/(portal)/employer/matches/page';
import EmployerPipelinePage from '@/app/(portal)/employer/pipeline/page';
import PartnerImpactPage from '@/app/(portal)/partner/impact/page';
import PartnerOutcomesPage from '@/app/(portal)/partner/outcomes/page';
import PartnerMilestonesPage from '@/app/(portal)/partner/milestones/page';
import PartnerExportsPage from '@/app/(portal)/partner/exports/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 'viewer-1' });
  mocks.employer.mockResolvedValue({ employerId: 'company-1' });
  mocks.partner.mockResolvedValue({ partnerId: 'partner-1', partner: { name: 'Community fixture', partnerType: 'community', organizationId: 'org-1' } });
  mocks.applications.mockResolvedValue([]);
  mocks.applicationCount.mockResolvedValue(0);
  mocks.matches.mockResolvedValue([]);
  mocks.matchCount.mockResolvedValue(0);
  mocks.jobs.mockResolvedValue([]);
  mocks.jobCount.mockResolvedValue(0);
  mocks.referrals.mockResolvedValue({ members: [], pipelineMembers: [], pendingPlacements: [] });
  mocks.referralCount.mockResolvedValue(0);
});
afterEach(cleanup);

describe('Candidates server views', () => {
  it('loads only Applicants, retaining the company scope, status, sort and page', async () => {
    mocks.applications.mockResolvedValue([{ id: 'application-1', jobId: 'job-1', status: 'reviewing', appliedAt: new Date('2026-09-01'), employerNotes: null, job: { id: 'job-1', title: 'Support' }, student: { id: 'member-1', fullName: 'Fixture Member', email: 'member@example.test' } }]);
    mocks.applicationCount.mockResolvedValue(30);
    render(await EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'applicants', page: '2', status: 'reviewing', sort: 'applied_asc' }) }));
    expect(screen.getByTestId('applicant-table')).toHaveTextContent('application-1');
    expect(mocks.applications).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1' }, status: 'reviewing' }, skip: 25, take: 25, orderBy: { appliedAt: 'asc' } }));
    expect(mocks.applicationCount).toHaveBeenCalledWith({ where: { job: { employerId: 'company-1' }, status: 'reviewing' } });
    expect(mocks.matches).not.toHaveBeenCalled();
    expect(mocks.jobs).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps a suggested match without an application as a match, not an applicant', async () => {
    mocks.matches.mockResolvedValue([{ id: 'match-1', jobId: 'job-1', studentId: 'member-1', status: 'suggested', matchScore: 0.8, createdAt: new Date('2026-09-01'), statusUpdatedAt: null, job: { id: 'job-1', title: 'Support' }, student: { id: 'member-1', fullName: 'Fixture Member' } }]);
    mocks.matchCount.mockResolvedValue(1);
    render(await EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'matches' }) }));
    expect(screen.getByTestId('match-table')).toHaveTextContent('match-1:no application');
    expect(mocks.matches).toHaveBeenCalledWith(expect.objectContaining({ where: { job: { employerId: 'company-1', status: 'live' } } }));
    expect(mocks.applicationCount).not.toHaveBeenCalled();
    expect(mocks.jobs).not.toHaveBeenCalled();
  });

  it('keeps all three previous list URLs as the corresponding named view', async () => {
    for (const [page, name] of [[EmployerApplicationsPage, 'Applicants'], [EmployerMatchesPage, 'Matches'], [EmployerPipelinePage, 'Pipeline']] as const) {
      const { unmount } = render(await page({}));
      const nav = within(screen.getByRole('navigation', { name: 'Candidate views' }));
      expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('rejects an unlinked employer before any record loader runs', async () => {
    mocks.employer.mockResolvedValue(null);
    await expect(EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'pipeline' }) })).rejects.toThrow('redirect:/employer/setup');
    expect(mocks.jobs).not.toHaveBeenCalled();
    expect(mocks.matches).not.toHaveBeenCalled();
    expect(mocks.applications).not.toHaveBeenCalled();
  });
});

describe('Impact server views', () => {
  it('keeps verified placements separate from unverified records in Outcomes', async () => {
    mocks.referrals.mockResolvedValue({
      members: [
        { id: 'verified', fullName: 'Verified Member', placementRecord: { startDateVerified: true }, userCertifications: [] },
        { id: 'pending', fullName: 'Pending Member', placementRecord: { startDateVerified: false }, userCertifications: [] },
      ], pipelineMembers: [], pendingPlacements: [],
    });
    render(await PartnerImpactPage({ searchParams: Promise.resolve({ view: 'outcomes' }) }));
    expect(screen.getByText(en.partner.placed).nextElementSibling).toHaveTextContent('1');
    expect(mocks.referrals).toHaveBeenCalledWith('partner-1', 'org-1');
    expect(mocks.referralCount).not.toHaveBeenCalled();
    expect(screen.queryByText('Authorized milestone feed')).toBeNull();
  });

  it('loads the existing milestone clients without loading outcomes or exports', async () => {
    render(await PartnerImpactPage({ searchParams: Promise.resolve({ view: 'milestones' }) }));
    expect(screen.getByText('Authorized milestone feed')).toBeVisible();
    expect(mocks.referrals).not.toHaveBeenCalled();
    expect(mocks.referralCount).not.toHaveBeenCalled();
  });

  it('keeps restricted export choices and partner scope in the Impact view', async () => {
    mocks.partner.mockResolvedValue({ partnerId: 'affiliate-1', partner: { name: 'Affiliate fixture', partnerType: 'referral', organizationId: 'org-2' } });
    render(await PartnerImpactPage({ searchParams: Promise.resolve({ view: 'exports' }) }));
    expect(document.querySelector('a[href="/api/partner/export/referrals?preset=packet"]')).not.toBeNull();
    expect(document.querySelector('a[href="/api/partner/export/referrals?preset=outcomes"]')).not.toBeNull();
    expect(document.querySelector('a[href="/api/partner/export/referrals?preset=demographics"]')).toBeNull();
    expect(mocks.referrals).toHaveBeenCalledWith('affiliate-1', 'org-2');
    expect(mocks.referralCount).toHaveBeenCalledWith('affiliate-1', 'org-2');
    expect(screen.getByText(/status-only columns/)).toBeVisible();
  });

  it('keeps previous Impact URLs as their corresponding view', async () => {
    for (const [page, name] of [[PartnerOutcomesPage, 'Outcomes'], [PartnerMilestonesPage, 'Milestones'], [PartnerExportsPage, 'Exports']] as const) {
      const { unmount } = render(await page({}));
      const nav = within(screen.getByRole('navigation', { name: 'Impact views' }));
      expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('rejects an unlinked partner before referral reads', async () => {
    mocks.partner.mockResolvedValue(null);
    await expect(PartnerImpactPage({ searchParams: Promise.resolve({ view: 'exports' }) })).rejects.toThrow('redirect:/partner/setup');
    expect(mocks.referrals).not.toHaveBeenCalled();
    expect(mocks.referralCount).not.toHaveBeenCalled();
  });
});

it('retains the requested workspace view after sign-in and does not load data while signed out', async () => {
  mocks.user.mockResolvedValue(null);
  await expect(EmployerCandidatesPage({ searchParams: Promise.resolve({ view: 'matches' }) })).rejects.toThrow('redirect:/login?redirectTo=%2Femployer%2Fcandidates%3Fview%3Dmatches');
  await expect(PartnerImpactPage({ searchParams: Promise.resolve({ view: 'exports' }) })).rejects.toThrow('redirect:/login?redirectTo=%2Fpartner%2Fimpact%3Fview%3Dexports');
  expect(mocks.employer).not.toHaveBeenCalled();
  expect(mocks.partner).not.toHaveBeenCalled();
  expect(mocks.referrals).not.toHaveBeenCalled();
  expect(mocks.applications).not.toHaveBeenCalled();
});
