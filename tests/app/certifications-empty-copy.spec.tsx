import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

/**
 * Review 2026-09-22: both empty states on /dashboard/certifications?ui=legacy
 * (mobile row, desktop records panel, desktop PortalEmptyState) said Coursera
 * certificates "sync automatically" when nothing wrote one. Item 4 of the
 * same review then made a Coursera-reported completion create a `pending`
 * UserCertification, so the page must now say exactly that: pending on
 * report, verified by the team before it counts, self-add still available.
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
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : `${ns}.${key}`;
  }),
}));
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
    // The notice reads `empty.certificates` through next-intl, as the (portal) layout provides it.
    render(<NextIntlClientProvider locale="en" messages={en}>{await DashboardCertificationsPage({ searchParams: Promise.resolve({ ui: 'legacy' }) })}</NextIntlClientProvider>);

    const notices = screen.getAllByText(/No certificates are recorded yet/);
    expect(notices).toHaveLength(3);
    for (const notice of notices) {
      expect(notice).toHaveTextContent(/When Coursera reports a completed course we add it here as a pending certificate/);
      expect(notice).toHaveTextContent(/our team verifies it before it counts as earned/);
      expect(notice).toHaveTextContent(/you can also add a certificate you earned elsewhere/);
      expect(notice).not.toHaveTextContent(/automatically/i);
    }
    expect(document.body).not.toHaveTextContent(/sync automatically/i);
    expect(document.body).not.toHaveTextContent(/not added here automatically/i);
    // Both legacy layouts (mobile row, desktop records panel) now render the one
    // KitEmptyState: "My program" is its ghost link and "Add a certificate" its
    // primary action, anchored to that layout's own add form.
    // (The desktop records caption repeats the sentence as plain text; the two
    // KitEmptyStates are the mobile row and the desktop records panel.)
    const empties = document.querySelectorAll('.wa-kit-empty[data-kind="first"]');
    expect(empties).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: 'My program' })) expect(link).toHaveAttribute('href', '/dashboard/program');
    expect(screen.getAllByRole('link', { name: 'My program' })).toHaveLength(empties.length);
    const addLinks = screen.getAllByRole('link', { name: 'Add a certificate' });
    expect(addLinks).toHaveLength(empties.length);
    for (const link of addLinks) {
      const target = link.getAttribute('href')!.replace(/^#/, '');
      expect(document.getElementById(target), target).not.toBeNull();
    }
    expect(notices.filter((notice) => notice.closest('.wa-kit-empty'))).toHaveLength(empties.length);
  });
});
