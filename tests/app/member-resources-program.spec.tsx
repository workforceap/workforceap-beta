import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ProgramResource } from '@/lib/content/programResources';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    counselorAssignment: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/content/careerBriefPersonalization', () => ({
  getCareerBriefContext: vi.fn(async () => ({ recommendedActions: [] })),
}));
vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  KitEmptyState: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('@/app/(portal)/dashboard/resources/ResourcesClient', () => ({
  default: ({ resources }: { resources: ProgramResource[] }) => (
    <section aria-label="Program resource links">
      {resources.map((resource) => <a key={resource.url} href={resource.url}>{resource.title}</a>)}
    </section>
  ),
}));

import ResourcesPage from '@/app/(portal)/dashboard/resources/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

const enrolledAt = new Date('2026-10-01T12:00:00Z');
const enrollment = (programSlug: string, isPrimary = true) => ({
  id: `assignment-${programSlug}`, programSlug, isPrimary, enrolledAt,
});
const setMember = (overrides: Record<string, unknown>) => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    enrolledProgram: null, enrolledAt: null, courseEnrollments: [], ...overrides,
  } as never);
};

describe('member resources follow the current program assignment', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'synthetic-member' } as never);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue(null);
    setMember({});
  });

  it('shows primary program resources when the legacy program pointer is null', async () => {
    setMember({ courseEnrollments: [enrollment('data-analytics-professional-certificate-google')] });
    render(await ResourcesPage());
    expect(screen.getByRole('heading', { name: 'Cloud & Data resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kaggle Learn' })).toHaveAttribute('href', 'https://www.kaggle.com/learn');
    expect(screen.queryByRole('link', { name: 'DigitalLearn.org (your course lessons)' })).not.toBeInTheDocument();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'synthetic-member' } }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('uses the primary assignment instead of stale legacy and secondary programs', async () => {
    setMember({
      enrolledProgram: 'digital-literacy-empowerment-class',
      courseEnrollments: [enrollment('data-analytics-professional-certificate-google', false), enrollment('it-support-professional-certificate-ibm')],
    });
    render(await ResourcesPage());
    expect(screen.getByRole('heading', { name: 'IT & Cybersecurity resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Professor Messer Study Guides' })).toHaveAttribute('href', 'https://www.professormesser.com/');
    expect(screen.queryByRole('link', { name: 'Kaggle Learn' })).not.toBeInTheDocument();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('keeps the existing legacy-only program fallback before assignment backfill', async () => {
    setMember({ enrolledProgram: 'it-support-professional-certificate-ibm' });
    render(await ResourcesPage());
    expect(screen.getByRole('heading', { name: 'IT & Cybersecurity resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Professor Messer Study Guides' })).toBeInTheDocument();
  });

  it('keeps Digital Literacy resources for a member with no assigned program', async () => {
    render(await ResourcesPage());
    expect(screen.getByRole('heading', { name: 'Digital Literacy resources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DigitalLearn.org (your course lessons)' })).toBeInTheDocument();
  });

  it('requires sign-in before reading any member assignment', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(ResourcesPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/resources');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.counselorAssignment.findFirst).not.toHaveBeenCalled();
  });
});
