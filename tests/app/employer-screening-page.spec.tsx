import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('@/app/seo', () => ({ buildPageMetadata: (input: unknown) => input }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    employerScreeningPack: { findFirst: vi.fn() },
  },
}));

import EmployerScreeningMemberPage from '@/app/(portal)/dashboard/program/employer-screening/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

describe('employer screening page uses the shared prerequisite reads', () => {
  beforeEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'synthetic-member' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      enrolledProgram: 'legacy-program',
      courseEnrollments: [{ programSlug: 'comptia-a-plus', curriculumVersion: 'legacy-v1' }],
      courseProgress: [],
    } as never);
    vi.mocked(prisma.employerScreeningPack.findFirst).mockResolvedValue(null);
  });

  it('redirects a signed-out visitor before any member read', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(EmployerScreeningMemberPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/program/employer-screening');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { enrolledProgram: null, courseEnrollments: [], courseProgress: [] },
  ])('redirects to My Program when member or assigned program is missing: %j', async (member) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member as never);
    await expect(EmployerScreeningMemberPage()).rejects.toThrow('REDIRECT:/dashboard/program');
    expect(prisma.employerScreeningPack.findFirst).not.toHaveBeenCalled();
  });

  it.each([null, { questionsJson: null }, { questionsJson: { prompt: 'Invalid shape' } }])(
    'keeps the existing not-found behavior for an absent or invalid pack: %j',
    async (pack) => {
      vi.mocked(prisma.employerScreeningPack.findFirst).mockResolvedValue(pack as never);
      await expect(EmployerScreeningMemberPage()).rejects.toThrow('NOT_FOUND');
      expect(prisma.employerScreeningPack.findFirst).toHaveBeenCalledWith({
        where: { programSlug: 'comptia-a-plus', isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
    },
  );

  it.each([
    { questionsJson: [] },
    { questionsJson: [{ id: 'q1', prompt: 'Ready to interview?', type: 'yes_no' }] },
  ])(
    'renders available array questions, including an empty pack: %j',
    async ({ questionsJson }) => {
      vi.mocked(prisma.employerScreeningPack.findFirst).mockResolvedValue({
        questionsJson, packTitle: 'Synthetic screening', employerLabel: 'Synthetic employer',
      } as never);
      render(await EmployerScreeningMemberPage());
      expect(screen.getByRole('heading', { name: 'Employer screening pack' })).toBeInTheDocument();
      if (questionsJson.length) expect(screen.getByText('Ready to interview?')).toBeInTheDocument();
    },
  );

  it('does not turn a failed pack read into expected absence', async () => {
    vi.mocked(prisma.employerScreeningPack.findFirst).mockRejectedValue(new Error('Pack read unavailable'));
    await expect(EmployerScreeningMemberPage()).rejects.toThrow('Pack read unavailable');
  });
});
