import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-260: /api/dashboard/jobs took `?ageGroup=` from the client, so a signed-in
 * minor (or any caller) could ask for the adult board. A signed-in member's
 * board now comes from their own profile; the parameter can only tighten it,
 * and a failed profile read fails closed.
 */
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), jobs: vi.fn() }));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('@/lib/cache', () => ({ getCacheOrFetch: async (_k: string, fn: () => unknown) => fn() }));
vi.mock('@/lib/storage/publicAssetUrl', () => ({ resolveSupabasePublicAssetUrl: (_b: string, u: string | null) => u }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { profile: { findUnique: mocks.profile }, job: { findMany: mocks.jobs } },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/(portal)/dashboard/jobs/route';

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

async function whereFor(query: string) {
  await GET(new NextRequest(`http://localhost/api/dashboard/jobs${query}`));
  return JSON.stringify(mocks.jobs.mock.calls.at(-1)?.[0].where);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobs.mockResolvedValue([]);
});

describe('GET /api/dashboard/jobs age group (WAP-260)', () => {
  it('a signed-in 16-year-old asking for the adult board still gets the youth board', async () => {
    mocks.user.mockResolvedValue({ id: 'member-1' });
    mocks.profile.mockResolvedValue({ dob: yearsAgo(16), isMinor: true });
    expect(await whereFor('?ageGroup=adult18plus')).toContain('"youthAppropriate":true');
  });

  it('a signed-in member whose profile read fails gets the youth board', async () => {
    mocks.user.mockResolvedValue({ id: 'member-1' });
    mocks.profile.mockRejectedValue(new Error('db down'));
    expect(await whereFor('')).toContain('"youthAppropriate":true');
  });

  it('a signed-in adult gets the full board', async () => {
    mocks.user.mockResolvedValue({ id: 'member-1' });
    mocks.profile.mockResolvedValue({ dob: yearsAgo(30), isMinor: false });
    expect(await whereFor('')).not.toContain('youthAppropriate');
  });

  it('a signed-out visitor keeps the public board, narrowed by the parameter', async () => {
    mocks.user.mockResolvedValue(null);
    expect(await whereFor('')).not.toContain('youthAppropriate');
    expect(await whereFor('?ageGroup=youth14to17')).toContain('"youthAppropriate":true');
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
