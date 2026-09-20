import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * /dashboard/missions resolves the member's program through the shared
 * dashboard helper (CourseEnrollment-aware), not the legacy
 * User.enrolledProgram column, and renders the shared SkillMissionEmpty
 * shell when no mission summary exists. Formerly asserted by reading the
 * page source in lib/member/skillMissionEmptyState.test.ts.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('@/lib/member/getActiveProgramForDashboard', () => ({ getActiveProgramForDashboard: vi.fn() }));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: vi.fn() }));
vi.mock('@/components/portal/SkillMissionPanel', () => ({ default: () => <div>Mission panel fixture</div> }));

import SkillMissionsPage from '@/app/(portal)/dashboard/missions/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { loadSkillMissionSummary } from '@/lib/member/skillMissions';

const view = (overrides: Partial<Awaited<ReturnType<typeof getActiveProgramForDashboard>>> = {}) => ({
  activeProgramSlug: null,
  primaryProgramSlug: null,
  allEnrollments: [],
  programTitle: null,
  legacyEnrolledProgramMismatch: false,
  noProgram: false,
  ...overrides,
});

describe('/dashboard/missions page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ courseProgress: [] } as never);
    vi.mocked(loadSkillMissionSummary).mockResolvedValue(null);
  });

  it('sends an unenrolled member to choose a program, resolving enrollment through the dashboard helper', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(view());

    render(await SkillMissionsPage());

    expect(getActiveProgramForDashboard).toHaveBeenCalledWith({ userId: 'user-1' });
    // The page's own Prisma read only fetches course progress; enrollment truth
    // comes from the helper, never from User.enrolledProgram.
    const select = vi.mocked(prisma.user.findUnique).mock.calls[0]![0]!.select as Record<string, unknown>;
    expect(select).not.toHaveProperty('enrolledProgram');
    expect(screen.getByRole('heading', { name: 'No program enrolled' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Choose program' });
    expect(cta).toHaveAttribute('href', '/dashboard/program');
    expect(cta.className).toContain('wa-kit-cta');
  });

  it('keeps an enrolled member on training when the catalog has no missions yet', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(
      view({
        activeProgramSlug: 'ai-professional-practitioner-certificate',
        primaryProgramSlug: 'ai-professional-practitioner-certificate',
        programTitle: 'AI Professional Practitioner Certificate',
        allEnrollments: [
          { id: 'enr-1', programSlug: 'ai-professional-practitioner-certificate', isPrimary: true, enrolledAt: new Date('2026-04-01T00:00:00Z'), curriculumVersion: 'legacy-v1' } as never,
        ],
      }),
    );

    render(await SkillMissionsPage());

    expect(loadSkillMissionSummary).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', programSlug: 'ai-professional-practitioner-certificate', curriculumVersion: 'legacy-v1' }),
    );
    expect(screen.getByRole('heading', { name: 'No missions for AI Professional Practitioner Certificate yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue training' })).toHaveAttribute('href', '/dashboard/program');
    expect(screen.queryByRole('link', { name: 'Choose program' })).toBeNull();
  });

  it('renders the mission panel instead of the empty shell when a summary exists', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(
      view({ activeProgramSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+' }),
    );
    vi.mocked(loadSkillMissionSummary).mockResolvedValue({ missions: [] } as never);

    render(await SkillMissionsPage());

    expect(screen.getByText('Mission panel fixture')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Choose program|Continue training/ })).toBeNull();
  });
});
