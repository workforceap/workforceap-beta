import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DIGITAL_LITERACY_PROGRAM_SLUG } from '@/shared/digitalLiteracyPathway';

/**
 * /dashboard/program/start gates on the live dashboard enrollment source
 * (CourseEnrollment rows via getActiveProgramForDashboard), never on the
 * leftover User.enrolledProgram column, and never writes that column back.
 * Formerly asserted by reading the page source in
 * lib/member/programStartEnrollment.test.ts.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadata: vi.fn((input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    courseEnrollment: { findFirst: vi.fn() },
    employerScreeningPack: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/member/getActiveProgramForDashboard', () => ({ getActiveProgramForDashboard: vi.fn() }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn() }));

import ProgramStartPage from '@/app/(portal)/dashboard/program/start/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getProgramEnrollmentSteps } from '@/lib/content/programEnrollmentSteps';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';

const view = (overrides: Partial<Awaited<ReturnType<typeof getActiveProgramForDashboard>>> = {}) => ({
  activeProgramSlug: null,
  primaryProgramSlug: null,
  allEnrollments: [],
  programTitle: null,
  legacyEnrolledProgramMismatch: false,
  noProgram: false,
  ...overrides,
});

describe('/dashboard/program/start page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    // The leftover column is present on the row but must be ignored.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      fullName: 'Sam Member',
      workspaceEmail: null,
      workspaceEmailProvisioned: false,
      enrolledProgram: DIGITAL_LITERACY_PROGRAM_SLUG,
    } as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.employerScreeningPack.findFirst).mockResolvedValue(null);
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue(null);
  });

  const enrolledView = () =>
    view({ activeProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG, primaryProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG });
  const trainingView = (overrides: { allCoursesComplete: boolean; totalCourses: number; completedCount: number }) =>
    ({ ...overrides }) as Awaited<ReturnType<typeof loadMemberProgramTrainingView>>;

  it('bounces to My Program when the dashboard view has no active program, whatever User.enrolledProgram says', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(view());

    await expect(ProgramStartPage()).rejects.toThrow('REDIRECT:/dashboard/program');
    expect(getActiveProgramForDashboard).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.courseEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('admits a member whose CourseEnrollment row is live even though the page never reads enrolledProgram', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(
      view({ activeProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG, primaryProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG }),
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: 'Sam Member', workspaceEmail: null, workspaceEmailProvisioned: false } as never);

    render(await ProgramStartPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your path to certification');
    const select = vi.mocked(prisma.user.findUnique).mock.calls[0]![0]!.select as Record<string, unknown>;
    expect(select).not.toHaveProperty('enrolledProgram');
    expect(prisma.courseEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', programSlug: DIGITAL_LITERACY_PROGRAM_SLUG } }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to My Program' })).toHaveAttribute('href', '/dashboard/program');
  });

  describe('completed state', () => {
    it('renders a done summary instead of the next-step guidance once every course is complete', async () => {
      vi.mocked(getActiveProgramForDashboard).mockResolvedValue(enrolledView());
      vi.mocked(loadMemberProgramTrainingView).mockResolvedValue(
        trainingView({ allCoursesComplete: true, totalCourses: 5, completedCount: 5 }),
      );

      render(await ProgramStartPage());

      expect(loadMemberProgramTrainingView).toHaveBeenCalledWith({
        userId: 'user-1',
        programSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
      });
      expect(screen.getByRole('status')).toHaveTextContent(/finished every course/i);
      expect(screen.getByRole('status')).toHaveTextContent('All 5 courses are complete');
      expect(screen.queryByText('What happens next')).toBeNull();
      expect(screen.queryByText('You are on file for training access')).toBeNull();
      expect(screen.getByRole('link', { name: 'Open Job Board' })).toHaveAttribute('href', '/dashboard/jobs');
      expect(screen.queryByRole('link', { name: 'Open Learning Hub' })).toBeNull();
      // Every enrollment step is marked done rather than numbered as pending.
      const stepCount = getProgramEnrollmentSteps(DIGITAL_LITERACY_PROGRAM_SLUG).length;
      expect(screen.getAllByText('Done')).toHaveLength(stepCount);
      expect(screen.queryByText('1')).toBeNull();
    });

    it('keeps the next-step guidance while any course is still open', async () => {
      vi.mocked(getActiveProgramForDashboard).mockResolvedValue(enrolledView());
      vi.mocked(loadMemberProgramTrainingView).mockResolvedValue(
        trainingView({ allCoursesComplete: false, totalCourses: 5, completedCount: 4 }),
      );

      render(await ProgramStartPage());

      expect(screen.getByText('What happens next')).toBeInTheDocument();
      expect(screen.queryByText(/finished every course/i)).toBeNull();
      expect(screen.queryByText('Done')).toBeNull();
      expect(screen.getByText('1')).toBeInTheDocument();
      // The secondary CTA opens the Learning Hub; nothing on this page sends
      // the member back to the member home to find their classes.
      expect(screen.getByRole('link', { name: 'Open Learning Hub' })).toHaveAttribute('href', '/dashboard/learning');
      expect(screen.getByRole('link', { name: 'Back to My Program' })).toHaveAttribute('href', '/dashboard/program');
      expect(screen.queryByRole('link', { name: /My Classes/ })).toBeNull();
    });

    it('never treats an empty curriculum as complete', async () => {
      vi.mocked(getActiveProgramForDashboard).mockResolvedValue(enrolledView());
      vi.mocked(loadMemberProgramTrainingView).mockResolvedValue(
        trainingView({ allCoursesComplete: true, totalCourses: 0, completedCount: 0 }),
      );

      render(await ProgramStartPage());

      expect(screen.getByText('What happens next')).toBeInTheDocument();
      expect(screen.queryByText(/finished every course/i)).toBeNull();
    });

    it('falls back to the in-progress narrative when the progress read fails', async () => {
      vi.mocked(getActiveProgramForDashboard).mockResolvedValue(enrolledView());
      vi.mocked(loadMemberProgramTrainingView).mockRejectedValue(new Error('progress store unavailable'));

      render(await ProgramStartPage());

      expect(screen.getByText('What happens next')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to My Program' })).toHaveAttribute('href', '/dashboard/program');
    });
  });

  it('sends a member with training access to My Program and the Learning Hub, not the member home', async () => {
    vi.mocked(getActiveProgramForDashboard).mockResolvedValue(enrolledView());
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue({
      workspaceEmail: 'sam@learn.workforceap.org',
      workspaceEmailProvisioned: true,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);

    render(await ProgramStartPage());

    expect(screen.getByText('You are on file for training access')).toBeInTheDocument();
    // "My Program" is both the breadcrumb and the in-card link; both open My Program.
    const programLinks = screen.getAllByRole('link', { name: 'My Program' });
    expect(programLinks).toHaveLength(2);
    for (const link of programLinks) {
      expect(link).toHaveAttribute('href', '/dashboard/program');
    }
    expect(screen.getByRole('link', { name: 'Learning Hub' })).toHaveAttribute('href', '/dashboard/learning');
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    // The breadcrumb is the only link back to the member home.
    expect(hrefs.filter((href) => href === '/dashboard')).toHaveLength(1);
  });

  it('redirects signed-out visitors to login before touching the database', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(ProgramStartPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/program/start');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
