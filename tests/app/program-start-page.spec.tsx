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

import ProgramStartPage from '@/app/(portal)/dashboard/program/start/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';

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
  });

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

  it('redirects signed-out visitors to login before touching the database', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(ProgramStartPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/program/start');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
