import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

/**
 * A `pending` job posting rendered on each surface that shows its status.
 * The employer board says "Awaiting approval" (what happens next for them);
 * the admin queue, table, review page and kit board say "Awaiting review"
 * (the queue word). Neither says "Pending" or "In review" any more.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/jobs',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/events/client', () => ({ postMemberEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/analytics/events', () => ({
  trackFunnelEvent: vi.fn(),
  trackEmployerJobAction: vi.fn(),
  trackEmployerBulkDelete: vi.fn(),
}));
// Design-system primitives as plain elements: the assertions are about words.
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/Link', () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import EmployerJobsBoard, { type EmployerJobBoardItem } from '@/components/employer/EmployerJobsBoard';
import JobsTableClient from '@/components/admin/JobsTableClient';
import AdminJobReview from '@/components/admin/AdminJobReview';
import { JobsBoardKit } from '@/components/portal/kit/pages/admin-subviews/JobsBoardKit';
import { employerJobStatusLabel } from '@/lib/employer/jobStatusDisplay';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OLD_WORDS = /^(Pending|In review)$/;

const pendingEmployerJob: EmployerJobBoardItem = {
  id: 'job-1',
  title: 'Support Specialist',
  location: 'Austin, TX',
  salaryMin: 52000,
  salaryMax: 60000,
  locationType: 'onsite',
  jobType: 'full_time',
  descriptionPreview: 'Help customers resolve technical issues.',
  descriptionLength: 40,
  requirementsCount: 2,
  suggestedProgramsCount: 1,
  status: 'pending',
  statusLabel: employerJobStatusLabel('pending'),
  applicationsCount: 0,
  updatedAt: '2026-09-20T12:00:00.000Z',
  readinessLevel: 'solid',
  readinessIssues: [],
};

describe('employer surface: a pending posting', () => {
  it('reads "Awaiting approval" on the My Jobs board and its filter, never "In review"', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
        <EmployerJobsBoard
          jobs={[pendingEmployerJob]}
          filter="all"
          page={1}
          pageSize={20}
          totalInFilter={1}
          totalInDb={1}
          deletableInFilter={[{ id: 'job-1', title: 'Support Specialist', status: 'pending' }]}
          closableInFilter={[]}
          titleByIdInFilter={{ 'job-1': 'Support Specialist' }}
        />
      </NextIntlClientProvider>,
    );

    const statusTag = Array.from(document.querySelectorAll<HTMLElement>('.wa-kit-tag')).find((el) =>
      /Awaiting approval/.test(el.textContent ?? ''),
    );
    expect(statusTag, 'status tag on the pending row').toBeDefined();
    expect(statusTag).toHaveTextContent('Awaiting approval');
    expect(screen.getAllByText('Awaiting approval').length).toBeGreaterThanOrEqual(2); // row tag + filter
    expect(screen.queryByText(OLD_WORDS)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Awaiting review/);
  });
});

describe('admin surfaces: the same pending posting', () => {
  const row = {
    id: 'job-1',
    title: 'Support Specialist',
    status: 'pending',
    updatedAt: '2026-09-20T12:00:00.000Z',
    employer: { companyName: 'Acme' },
    _count: { applications: 3 },
  };

  it('reads "Awaiting review" in the legacy review-queue table pill', () => {
    render(<JobsTableClient jobs={[row]} totalCount={1} currentPage={1} pageSize={20} />);
    const pill = document.querySelector('.admin-job-status-pill--pending');
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent('Awaiting review');
    expect(within(pill as HTMLElement).queryByText(OLD_WORDS)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Awaiting approval|In review/);
  });

  it('reads "Awaiting review" on the job review page status tag', () => {
    render(
      <AdminJobReview
        job={{
          id: 'job-1',
          title: 'Support Specialist',
          location: 'Austin, TX',
          locationType: 'onsite',
          jobType: 'full_time',
          salaryMin: null,
          salaryMax: null,
          description: 'Help customers resolve technical issues.',
          requirements: [],
          preferredCertifications: [],
          suggestedPrograms: [],
          status: 'pending',
          applicationsCount: 0,
          employer: { companyName: 'Acme', contactEmail: 'hr@acme.test', contactName: null },
        }}
      />,
    );
    const tag = Array.from(document.querySelectorAll<HTMLElement>('.wa-kit-tag')).find((el) =>
      /Awaiting review/.test(el.textContent ?? ''),
    );
    expect(tag, 'status tag').toBeDefined();
    expect(screen.queryByText(OLD_WORDS)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Awaiting approval|In review/);
  });

  it('reads "Awaiting review" on the kit jobs board while sorting still ranks it first', () => {
    render(
      <JobsBoardKit
        jobs={[
          { id: 'a', role: 'Analyst', employer: 'Acme', location: 'Austin', wage: '—', applicants: 0, status: 'Open' },
          { id: 'b', role: 'Builder', employer: 'Acme', location: 'Austin', wage: '—', applicants: 0, status: 'Pending' },
        ]}
        openRoles={1}
        employers={1}
      />,
    );
    expect(screen.getAllByText('Awaiting review').length).toBeGreaterThan(0);
    expect(screen.queryByText(OLD_WORDS)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Awaiting approval/);
  });
});
