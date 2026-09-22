import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

/**
 * A `pending` and a `rejected` JobPostingApplication rendered on every
 * employer surface that shows the status, plus the counselor's read of the
 * member's record. The employer reads "New" / "Not selected" (the pipeline as
 * they work it); the counselor reads "Applied" / "Not selected" (the member's
 * journey). No surface says "Pending", "Under Review", "Offer", "Declined" or
 * "Rejected" any more, and none title-cases the enum.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/employer/applications',
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/lib/analytics/events', () => ({
  trackEmployerJobAction: vi.fn(),
  trackEmployerBulkDelete: vi.fn(),
  trackEmployerImport: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));
vi.mock('@/components/portal/EmployerApplicationChatClient', () => ({ default: () => null }));
// Server page (employer application detail) collaborators.
vi.mock('@/app/seo', () => ({ buildPageMetadata: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn(), isSuperAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { jobPostingApplication: { findFirst: vi.fn() } } }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import MobileApplicationsClient from '@/components/employer/MobileApplicationsClient';
import EmployerApplicationsClient, { type EmployerApplicationRow } from '@/components/employer/EmployerApplicationsClient';
import JobApplicantsClient from '@/components/employer/JobApplicantsClient';
import EmployerWorkQueueClient from '@/components/employer/EmployerWorkQueueClient';
import ApplicationStatusUpdater from '@/components/employer/ApplicationStatusUpdater';
import EmployerApplicationPage from '@/app/(portal)/employer/applications/[id]/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OLD_WORDS = /\b(Pending|Under Review|Offered|Declined|Rejected)\b/;

const row = (id: string, status: string, fullName: string): EmployerApplicationRow => ({
  id,
  jobId: 'job-1',
  status,
  appliedAt: '2026-09-01T00:00:00Z',
  employerNotes: null,
  job: { id: 'job-1', title: 'Warehouse Associate' },
  student: { id: `s-${id}`, fullName, email: `${id}@example.test` },
});

function withMessages(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('employer surfaces: a new and a not-selected application', () => {
  it('mobile list: pill, filter chips and the move-to button all speak the employer words', () => {
    withMessages(<MobileApplicationsClient initialRows={[row('a1', 'pending', 'Ada Applicant'), row('a2', 'rejected', 'Rex Applicant')]} />);
    const tagFor = (label: string) => screen.getByText(label, { selector: '.wa-kit-tag' });
    expect(tagFor('New')).toBeInTheDocument();
    expect(tagFor('Not selected')).toBeInTheDocument();
    // Filter chips: one per stage, in the vocabulary's words.
    for (const key of ['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected'] as const) {
      expect(screen.getAllByRole('button', { name: jobApplicationStatusLabel(key, 'employer') }).length).toBeGreaterThanOrEqual(1);
    }
    // The move-to action on a new application is the next stage's word.
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for Ada Applicant' }));
    const details = document.getElementById('application-details-a1') as HTMLElement;
    expect(within(details).getByRole('button', { name: 'Reviewing' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('applications table: the filter chips and the per-row stage <select> speak the employer words', () => {
    withMessages(<EmployerApplicationsClient initialRows={[row('a1', 'pending', 'Ada Applicant')]} activeStatusFilter={null} activeSort="applied_desc" />);
    const select = screen.getByLabelText('Pipeline stage for Ada Applicant') as HTMLSelectElement;
    const optionWords = Array.from(select.options).map((o) => o.textContent);
    expect(optionWords).toEqual(['New', 'Reviewing', 'Interviewing', 'Offer extended', 'Hired', 'Not selected']);
    expect(select.selectedOptions[0]?.textContent).toBe('New');
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('per-job applicants list: the stage <select> speaks the employer words', () => {
    withMessages(
      <JobApplicantsClient
        jobId="job-1"
        initialApplicants={[{ id: 'a1', status: 'rejected', appliedAt: '2026-09-01T00:00:00Z', employerNotes: null, student: { id: 's1', fullName: 'Rex Applicant', email: 'rex@example.test' } }]}
      />,
    );
    // The list renders a desktop table and a mobile card list; both selects carry the same label.
    const select = screen.getAllByLabelText('Update application status for Rex Applicant')[0] as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Not selected');
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Offer extended');
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('work queue: a pending application in "Review today" reads "New", not the title-cased enum', () => {
    withMessages(
      <EmployerWorkQueueClient
        needsReviewTodayApps={[{ id: 'a1', jobId: 'job-1', status: 'pending', appliedAt: '2026-09-01T00:00:00Z', jobTitle: 'Warehouse Associate', studentName: 'Ada Applicant', studentId: 's1' }]}
        jobsAwaitingPublish={[]}
        staleApps={[]}
        interviewPending={[]}
      />,
    );
    const tag = Array.from(document.querySelectorAll<HTMLElement>('.wa-kit-tag')).find((el) => el.textContent === 'New');
    expect(tag, 'status tag on the review-today row').toBeDefined();
    expect(document.body.textContent).not.toMatch(OLD_WORDS);
  });

  it('status updater: the <select> offers the six stages in the employer words', () => {
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="offered" />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['New', 'Reviewing', 'Interviewing', 'Offer extended', 'Hired', 'Not selected']);
    expect(select.selectedOptions[0]?.textContent).toBe('Offer extended');
  });
});

describe('employer application detail page', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
  });

  it.each([
    ['pending', 'New'],
    ['rejected', 'Not selected'],
  ])('reads the employer word for %s in the Current Status tag', async (status, word) => {
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      id: 'app-1',
      status,
      notes: null,
      job: { id: 'job-1', title: 'Fixture Role', employerId: 'emp-1' },
      student: { id: 'member-1', fullName: 'Fixture Candidate', email: null, phone: null, enrolledProgram: null, profile: null },
      messages: [],
    } as never);
    const html = renderToStaticMarkup(await EmployerApplicationPage({ params: Promise.resolve({ id: 'app-1' }) }));
    const tag = html.match(/<span[^>]*class="[^"]*wa-kit-tag[^"]*"[^>]*>([^<]*)<\/span>/);
    expect(tag?.[1], 'kit status tag').toBe(word);
    expect(html).not.toMatch(/>(Pending|Rejected|Offered|Interview)</);
  });
});

describe('counselor read of the member record', () => {
  it('speaks the member journey, not the employer queue', () => {
    expect(jobApplicationStatusLabel('pending', 'member')).toBe('Applied');
    expect(jobApplicationStatusLabel('reviewing', 'member')).toBe('Under review');
    expect(jobApplicationStatusLabel('rejected', 'member')).toBe('Not selected');
  });
});
