process.env.TZ = 'UTC';

import { renderToStaticMarkup as renderStatic } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
  usePathname: () => '/employer/candidates/student-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn() }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn() }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/StatusBadge', () => ({ default: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    aIJobMatch: { findMany: vi.fn(), count: vi.fn() },
    jobPostingApplication: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    partnerReferral: { findFirst: vi.fn() },
    counselorAssignment: { findFirst: vi.fn() },
  },
}));

import EmployerCandidateProfilePage from '@/app/(portal)/employer/candidates/[studentId]/page';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const INSTANT = new Date('2026-09-19T02:30:00Z'); // 9:30 PM CDT, Sep 18

function renderToStaticMarkup(node: React.ReactNode) {
  return renderStatic(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">{node}</NextIntlClientProvider>);
}

describe('EmployerCandidateProfilePage timestamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'employer-user-1' } as never);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'emp-1' } as never);
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([
      { id: 'match-1', jobId: 'job-1', studentId: 'student-1', matchScore: 0.8, status: 'suggested', createdAt: INSTANT, job: { id: 'job-1', title: 'Fixture Role' } },
    ] as never);
    vi.mocked(prisma.aIJobMatch.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.jobPostingApplication.findMany).mockResolvedValue([
      { id: 'app-1', jobId: 'job-1', studentId: 'student-1', status: 'pending', appliedAt: INSTANT, job: { id: 'job-1', title: 'Fixture Role' } },
    ] as never);
    vi.mocked(prisma.jobPostingApplication.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      fullName: 'Fixture Candidate',
      email: 'fixture@example.test',
      enrolledProgram: null,
      assessmentCompleted: false,
      courseEnrollments: [],
      courseProgress: [],
      profile: null,
    } as never);
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue(null as never);
  });

  it('renders match and application times in Central time', async () => {
    const html = renderToStaticMarkup(
      await EmployerCandidateProfilePage({ params: Promise.resolve({ studentId: 'student-1' }), searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('Added Sep 18, 2026, 9:30 PM CDT');
    expect(html).toContain('Applied Sep 18, 2026, 9:30 PM CDT');
    expect(html).not.toContain('2:30 AM');
    expect(html).not.toContain('Sep 19');
  });

  it('opens the actual application record when the candidate has applied without an AI match', async () => {
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.aIJobMatch.count).mockResolvedValue(0 as never);
    const html = renderToStaticMarkup(
      await EmployerCandidateProfilePage({ params: Promise.resolve({ studentId: 'student-1' }), searchParams: Promise.resolve({}) }),
    );
    const document = new DOMParser().parseFromString(html, 'text/html');
    const applicationLink = Array.from(document.querySelectorAll('a')).find((link) => link.textContent === 'Open latest application');
    expect(applicationLink?.getAttribute('href')).toBe('/employer/applications/app-1');
  });
});
