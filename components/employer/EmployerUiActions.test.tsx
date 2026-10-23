import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

import EmployerJobPostForm from './EmployerJobPostForm';
import EmployerJobQuickActions from './EmployerJobQuickActions';
import EmployerJobsActions from './EmployerJobsActions';
import EmployerJobsBoard, { type EmployerJobBoardItem } from './EmployerJobsBoard';
import EmployerMatchHistoryClient, { type EmployerMatchHistoryRow } from './EmployerMatchHistoryClient';
import EmployerWorkQueueClient from './EmployerWorkQueueClient';

const refresh = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ pathname: '/employer/jobs', search: 'filter=live&page=2' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const matchRow: EmployerMatchHistoryRow = {
  id: 'match-1',
  jobId: 'job-1',
  studentId: 'student-1',
  status: 'suggested',
  matchScore: 0.91,
  createdAt: '2026-08-29T12:00:00.000Z',
  statusUpdatedAt: null,
  job: { id: 'job-1', title: 'Support Specialist' },
  student: { id: 'student-1', fullName: 'Ada Member' },
  applicationId: 'application-1',
};

const CONNECTION_COPY = messages.common.connectionError;

function withIntl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>
  );
}

const workQueueApp = {
  id: 'application-1',
  jobId: 'job-1',
  status: 'pending',
  appliedAt: '2026-08-29T12:00:00.000Z',
  jobTitle: 'Support Specialist',
  studentName: 'Ada Member',
  studentId: 'student-1',
};

function fillRequiredQuickPostFields() {
  fireEvent.change(screen.getByLabelText(/job title/i), { target: { value: 'Support Specialist' } });
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: 'Help customers resolve technical issues.' },
  });
}

describe('employer UI action contracts', () => {
  beforeEach(() => {
    refresh.mockReset();
    navigation.pathname = '/employer/jobs';
    navigation.search = 'filter=live&page=2';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes job applicant actions to the existing job-scoped applicants page', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
        <EmployerJobQuickActions jobId="job/with space" title="Support Specialist" status="draft" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute(
      'href',
      '/employer/jobs/job%2Fwith%20space/applicants',
    );

    const job: EmployerJobBoardItem = {
      id: 'job-1', title: 'Support Specialist', location: 'Austin', salaryMin: null, salaryMax: null,
      locationType: 'onsite', jobType: 'fulltime', descriptionPreview: 'Support customers.',
      descriptionLength: 200, requirementsCount: 3, suggestedProgramsCount: 1,
      status: 'live', statusLabel: 'Live', applicationsCount: 1, updatedAt: '2026-08-29T12:00:00Z',
      readinessLevel: 'solid', readinessIssues: [],
    };
    rerender(withIntl(
      <>
        <EmployerJobsActions labels={{ nav: 'Job actions', jobs: 'Jobs', post: 'Post job', import: 'Import jobs' }} />
        <EmployerJobsBoard jobs={[job]} filter="live" page={2} pageSize={20} totalInFilter={21} totalInDb={21}
          deletableInFilter={[]} closableInFilter={[{ id: job.id, title: job.title, status: job.status }]} titleByIdInFilter={{ [job.id]: job.title }} />
      </>,
    ));
    const applicants = new URL(screen.getByRole('link', { name: 'View applicants' }).getAttribute('href')!, 'https://workforceap.test');
    expect(applicants.pathname).toBe('/employer/jobs/job-1/applicants');
    expect(applicants.searchParams.get('returnTo')).toBe('/employer/jobs?filter=live&page=2');
    expect(applicants.searchParams.has('jobId')).toBe(false);
    const actions = within(screen.getByRole('navigation', { name: 'Job actions' }));
    expect(actions.getByRole('link', { name: 'Post job' })).toHaveAttribute('href', '/employer/jobs/new');
    expect(actions.getByRole('link', { name: 'Import jobs' })).toHaveAttribute('href', '/employer/jobs/import');
  });

  it('keeps a server rejection visible and re-enables quick-post submission', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Posting is temporarily unavailable.' }),
    } as Response);

    render(<EmployerJobPostForm />);
    fillRequiredQuickPostFields();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Posting is temporarily unavailable.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit for review' })).toBeEnabled());
  });

  it('keeps a network failure visible and re-enables quick-post submission', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

    render(<EmployerJobPostForm />);
    fillRequiredQuickPostFields();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network error. Check your connection and try again.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit for review' })).toBeEnabled());
  });

  it('opens match-history applications through their detail route', () => {
    navigation.pathname = '/employer/candidates';
    navigation.search = 'view=matches';
    render(withIntl(<EmployerMatchHistoryClient initialRows={[matchRow]} />));

    const applicationLinks = screen.getAllByRole('link', { name: /open( application)?/i });
    expect(applicationLinks).not.toHaveLength(0);
    for (const link of applicationLinks) {
      const href = new URL(link.getAttribute('href')!, 'https://workforceap.test');
      expect(href.pathname).toBe('/employer/applications/application-1');
      expect(href.searchParams.get('returnTo')).toBe('/employer/candidates?view=matches');
    }
  });

  it('renders work-queue navigation as links without nested buttons', () => {
    render(
      withIntl(
        <EmployerWorkQueueClient
          needsReviewTodayApps={[workQueueApp]}
          jobsAwaitingPublish={[
            {
              id: 'job-1',
              title: 'Support Specialist',
              status: 'pending',
              updatedAt: '2026-08-29T12:00:00.000Z',
            },
          ]}
          staleApps={[]}
          interviewPending={[]}
        />,
      ),
    );

    const openJob = screen.getByRole('link', { name: 'Open job' });
    const tableView = screen.getByRole('link', { name: 'Table view' });
    expect(openJob).toHaveAttribute('href', '/employer/jobs/job-1');
    expect(tableView).toHaveAttribute('href', '/employer/applications');
    expect(openJob.querySelector('button')).toBeNull();
    expect(tableView.querySelector('button')).toBeNull();
  });

  it('keeps a dropped connection visible when a match status change fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(withIntl(<EmployerMatchHistoryClient initialRows={[matchRow]} />));
    const select = screen.getAllByRole('combobox', { name: 'Status for Ada Member' })[0];
    fireEvent.change(select, { target: { value: 'contacted' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert).not.toHaveTextContent('Failed to fetch');
    await waitFor(() => expect(select).toBeEnabled());
  });

  it('shows the server rejection when a match status change is refused', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'This candidate withdrew.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(withIntl(<EmployerMatchHistoryClient initialRows={[matchRow]} />));
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Status for Ada Member' })[0], {
      target: { value: 'contacted' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This candidate withdrew.');
  });

  it('keeps a dropped connection visible when a work-queue action fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      withIntl(
        <EmployerWorkQueueClient
          needsReviewTodayApps={[workQueueApp]}
          jobsAwaitingPublish={[]}
          staleApps={[]}
          interviewPending={[]}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert).not.toHaveTextContent('Failed to fetch');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start review' })).toBeEnabled());
  });

  it('shows the server rejection when a work-queue action is refused', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'This application was withdrawn.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(
      withIntl(
        <EmployerWorkQueueClient
          needsReviewTodayApps={[workQueueApp]}
          jobsAwaitingPublish={[]}
          staleApps={[]}
          interviewPending={[]}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This application was withdrawn.');
  });
});
