process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadata: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn(), isSuperAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { jobPostingApplication: { findFirst: vi.fn() } } }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/employer/ApplicationStatusUpdater', () => ({ default: () => null }));
vi.mock('@/components/employer/InterviewDetailsForm', () => ({
  default: (props: { scheduledAt: string | null; location: string | null }) => (
    <form data-testid="interview-details-form" data-scheduled-at={props.scheduledAt ?? ''} data-location={props.location ?? ''} />
  ),
}));

import EmployerApplicationPage from '@/app/(portal)/employer/applications/[id]/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

describe('EmployerApplicationPage message dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      id: 'app-1',
      status: 'reviewing',
      notes: null,
      job: { id: 'job-1', title: 'Fixture Role', employerId: 'emp-1' },
      student: { id: 'member-1', fullName: 'Fixture Candidate', email: null, phone: null, enrolledProgram: null, profile: null },
      messages: [
        { id: 'msg-1', authorId: 'member-1', body: 'Fixture message', createdAt: INSTANT, author: { id: 'member-1', fullName: 'Fixture Candidate' } },
      ],
    } as never);
  });

  it('renders the message date in Central time rather than the UTC day', async () => {
    const html = renderToStaticMarkup(await EmployerApplicationPage({ params: Promise.resolve({ id: 'app-1' }) }));
    expect(html).toContain('Sep 18, 2026');
    expect(html).not.toContain('9/19/2026');
    expect(html).not.toContain('Sep 19');
  });
});

describe('EmployerApplicationPage interview details (Vision B2)', () => {
  const AT = new Date('2026-10-02T19:30:00Z'); // Oct 2, 2:30 PM CDT

  function withApplication(extra: Record<string, unknown>) {
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
    vi.mocked(prisma.jobPostingApplication.findFirst).mockResolvedValue({
      id: 'app-1',
      status: 'reviewing',
      interviewScheduledAt: null,
      interviewNotes: null,
      job: { id: 'job-1', title: 'Fixture Role', employerId: 'emp-1' },
      student: { id: 'member-1', fullName: 'Fixture Candidate', email: null, phone: null, enrolledProgram: null, profile: null },
      messages: [],
      ...extra,
    } as never);
  }

  const render = async () =>
    renderToStaticMarkup(await EmployerApplicationPage({ params: Promise.resolve({ id: 'app-1' }) }));

  beforeEach(() => vi.clearAllMocks());

  it('at Interview, shows the saved time with its time zone and the place, and renders the form prefilled', async () => {
    withApplication({ status: 'interview', interviewScheduledAt: AT, interviewNotes: 'Zoom' });
    const html = await render();
    expect(html).toContain('Oct 2, 2026, 2:30 PM CDT · Zoom');
    expect(html).toContain('data-testid="interview-details-form"');
    expect(html).toContain('data-scheduled-at="2026-10-02T19:30:00.000Z"');
    expect(html).toContain('data-location="Zoom"');
  });

  it('at Interview with nothing saved yet, renders the form and no interview line', async () => {
    withApplication({ status: 'interview' });
    const html = await render();
    expect(html).toContain('data-testid="interview-details-form"');
    expect(html).not.toContain('Interview:</strong>');
  });

  it.each(['pending', 'reviewing', 'offered', 'hired', 'rejected'])('does not render the form while %s', async (status) => {
    withApplication({ status });
    const html = await render();
    expect(html).not.toContain('interview-details-form');
  });

  it('after Interview, keeps a read-only line with the time and place', async () => {
    withApplication({ status: 'offered', interviewScheduledAt: AT, interviewNotes: '12 Main St' });
    const html = await render();
    expect(html).not.toContain('interview-details-form');
    expect(html).toContain('<strong>Interview:</strong> Oct 2, 2026, 2:30 PM CDT · 12 Main St');
  });
});
