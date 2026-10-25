import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

const catalogs: Record<string, unknown> = { en, es };
const activeLocale = vi.hoisted(() => ({ value: 'en' }));

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
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) =>
    createTranslator({ locale: activeLocale.value, messages: catalogs[activeLocale.value] as AbstractIntlMessages, namespace }),
  ),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('@/lib/member/getActiveProgramForDashboard', () => ({ getActiveProgramForDashboard: vi.fn() }));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: vi.fn() }));
vi.mock('@/components/portal/SkillMissionPanel', () => ({ default: () => <div>Mission panel fixture</div> }));

import SkillMissionsPage, { generateMetadata } from '@/app/(portal)/dashboard/missions/page';
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
    activeLocale.value = 'en';
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
    // No program is a first step (choose one); the shell is the one KitEmptyState in a kit card.
    const empty = document.querySelector<HTMLElement>('.wa-kit-empty')!;
    expect(empty.dataset.kind).toBe('first');
    expect(empty.dataset.tone).toBe('muted');
    expect(empty.closest('.wa-kit-card')).not.toBeNull();
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
    // Enrolled without catalog missions: not available yet (info), not a first step.
    const empty = document.querySelector<HTMLElement>('.wa-kit-empty')!;
    expect(empty.dataset.kind).toBe('unavailable');
    expect(empty.dataset.tone).toBe('info');
    expect(empty).not.toHaveAttribute('role');
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

  it('puts one sentence from the member own counts under the title', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(
      view({ activeProgramSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+' }),
    );
    vi.mocked(loadSkillMissionSummary).mockResolvedValue({
      totalMissions: 8, passedCount: 3, readyCount: 2, retryCount: 1, missions: [],
    } as never);

    render(await SkillMissionsPage());

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('3 of 8 missions passed. 2 ready to start.')).toBeInTheDocument();
  });

  it('renders the title, sentence and empty state in the member locale, with the same numbers', async () => {
    activeLocale.value = 'es';
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(
      view({ activeProgramSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+' }),
    );
    vi.mocked(loadSkillMissionSummary).mockResolvedValue({
      totalMissions: 8, passedCount: 3, readyCount: 2, retryCount: 1, missions: [],
    } as never);

    render(await SkillMissionsPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Misiones de habilidades' })).toBeInTheDocument();
    expect(screen.getByText('3 de 8 misiones aprobadas. 2 listas para empezar.')).toBeInTheDocument();

    cleanup();
    vi.mocked(loadSkillMissionSummary).mockResolvedValue(null);
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(view());
    render(await SkillMissionsPage());
    expect(screen.getByRole('heading', { name: 'Sin programa inscrito' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegir programa' })).toHaveAttribute('href', '/dashboard/program');
  });

  it('titles the page from messages in the member locale', async () => {
    expect(await generateMetadata()).toMatchObject({ title: 'Skill Missions', path: '/dashboard/missions' });
    activeLocale.value = 'es';
    expect(await generateMetadata()).toMatchObject({ title: 'Misiones de habilidades', path: '/dashboard/missions' });
  });

  it('sends a signed-out visitor to sign in and back to missions', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(SkillMissionsPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/missions');
    expect(loadSkillMissionSummary).not.toHaveBeenCalled();
  });

  it('reads the signed-in member only', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(view());
    render(await SkillMissionsPage());
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0]![0]!.where).toEqual({ id: 'user-1' });
  });
});
