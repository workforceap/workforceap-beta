import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Review 2026-09-22: both empty states on /dashboard/certifications?ui=legacy
 * (mobile row, desktop records panel, desktop PortalEmptyState) said Coursera certificates "sync
 * automatically". No code path writes a UserCertification from a Coursera
 * completion, so the page must describe what happens today instead.
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
vi.mock('@/components/portal/kit/pages/member/MemberCertificatesKit', () => ({
  MemberCertificatesKit: () => <div>Kit fixture</div>,
}));

import DashboardCertificationsPage from '@/app/(portal)/dashboard/certifications/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

describe('/dashboard/certifications?ui=legacy empty states', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      enrolledProgram: null,
      organizationId: 'org-1',
      courseEnrollments: [],
    } as never);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.pathwayStepProgress.findMany).mockResolvedValue([] as never);
  });

  it('tells a member with no certificates how records are actually created, in every layout', async () => {
    render(await DashboardCertificationsPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));

    const notices = screen.getAllByText(/No certificates are recorded yet/);
    expect(notices).toHaveLength(3);
    for (const notice of notices) {
      expect(notice).toHaveTextContent(/our team verifies it before it counts as earned/);
      expect(notice).toHaveTextContent(/not added here automatically yet/);
    }
    expect(document.body).not.toHaveTextContent(/sync automatically/i);
    expect(screen.getByRole('link', { name: 'My program' })).toHaveAttribute('href', '/dashboard/program');
  });
});
