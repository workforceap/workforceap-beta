import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Review 2026-09-22, item 4: a Coursera-reported completion now creates a
 * `pending` UserCertification, so pending rows reach My Certificates before
 * staff verify them. The default (kit) view must say which rows are still
 * pending and count only staff-approved rows as verified, instead of dating
 * every row as issued. Rendered through the real kit; only the route's data
 * loaders and unrelated sections are stubbed.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: vi.fn(async () => 'en') }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userCertification: { findMany: vi.fn() },
    pathwayStepProgress: { findMany: vi.fn() },
  },
}));
vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/portal/CertificationRoadmap', () => ({ default: () => <div>Roadmap fixture</div> }));
vi.mock('@/components/portal/CertificationReferenceSection', () => ({ default: () => <div>Reference fixture</div> }));
vi.mock('@/components/portal/CertificationsEarnMoreCard', () => ({ default: () => <div>Earn more fixture</div> }));
vi.mock('@/components/portal/CertificationAddForm', () => ({ default: () => <form aria-label="Add certificate fixture" /> }));
vi.mock('@/components/portal/CertificationVaultActions', () => ({
  CertificationEarnedRowMobile: () => <div>Earned row fixture</div>,
  CertificationDownloadOneButton: () => <button type="button">Download one fixture</button>,
  DownloadAllCertificatesButton: () => <button type="button">Download all fixture</button>,
  CertificationViewButton: () => <button type="button">View fixture</button>,
}));
vi.mock('@/components/ui/ShareButton', () => ({
  ShareButton: ({ label }: { label?: string }) => <button type="button">{label ?? 'Share fixture'}</button>,
}));

import DashboardCertificationsPage from '@/app/(portal)/dashboard/certifications/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

describe('/dashboard/certifications with pending and approved rows', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      enrolledProgram: null,
      organizationId: 'org-1',
      courseEnrollments: [],
    } as never);
    vi.mocked(prisma.pathwayStepProgress.findMany).mockResolvedValue([] as never);
  });

  it('labels a completion-created row as pending verification and counts only approved rows as verified', async () => {
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([
      { id: 'cert-pending', certName: 'Introduction to Technical Support', earnedAt: new Date('2026-09-20T15:00:00.000Z'), status: 'pending' },
      { id: 'cert-approved', certName: 'Networking Basics', earnedAt: new Date('2026-08-01T12:00:00.000Z'), status: 'approved' },
    ] as never);

    render(await DashboardCertificationsPage({ searchParams: Promise.resolve({}) }));

    const pendingTitle = screen.getByRole('heading', { name: 'Introduction to Technical Support' });
    expect(pendingTitle.closest('div[style]')?.parentElement).toHaveTextContent(/Pending verification · completed Sep 20, 2026/);
    const approvedTitle = screen.getByRole('heading', { name: 'Networking Basics' });
    expect(approvedTitle.closest('div[style]')?.parentElement).toHaveTextContent(/Issued Aug 1, 2026/);

    // The verified check mark belongs to the approved row only.
    expect(screen.getAllByLabelText('Verified')).toHaveLength(1);
    expect(approvedTitle.parentElement).toContainElement(screen.getByLabelText('Verified'));

    expect(document.body).not.toHaveTextContent(/Issued Sep 20, 2026/);
    expect(document.body).not.toHaveTextContent(/sync automatically/i);
  });

  it('reads the status column so the page can tell the two apart', async () => {
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([] as never);

    render(await DashboardCertificationsPage({ searchParams: Promise.resolve({}) }));

    const select = vi.mocked(prisma.userCertification.findMany).mock.calls[0][0]?.select;
    expect(select).toMatchObject({ status: true, certName: true, earnedAt: true });
    expect(document.body).toHaveTextContent(/appears here as a pending certificate; our team verifies it before it counts as earned/);
  });
});
