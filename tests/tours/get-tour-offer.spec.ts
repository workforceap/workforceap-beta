import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    userTourState: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/feature-flags/isFlagEnabledForUser', () => ({
  GUIDED_TOURS_V2_FLAG: 'guided_tours_v2',
  isFlagEnabledForUser: vi.fn(),
}));

import { getTourOffer } from '@/lib/tours/getTourOffer';
import { prisma } from '@/lib/db/prisma';
import { isFlagEnabledForUser } from '@/lib/feature-flags/isFlagEnabledForUser';

const findUnique = vi.mocked(prisma.userTourState.findUnique);
const flag = vi.mocked(isFlagEnabledForUser);

describe('getTourOffer (server gate for the persona shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns null for keys that are not in the registry', async () => {
    expect(await getTourOffer('u1', 'counselor.nope')).toBeNull();
    expect(flag).not.toHaveBeenCalled();
  });

  it('is invisible until guided_tours_v2 is on for the user, and reads no tour state then', async () => {
    flag.mockResolvedValue(false);
    expect(await getTourOffer('u1', 'counselor.home')).toEqual({ key: 'counselor.home', enabled: false, offer: false });
    expect(flag).toHaveBeenCalledWith('guided_tours_v2', 'u1');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('offers the strip to a flagged-on user with no row, looked up by (userId, tourKey)', async () => {
    flag.mockResolvedValue(true);
    findUnique.mockResolvedValue(null as any);
    expect(await getTourOffer('u1', 'counselor.home')).toEqual({ key: 'counselor.home', enabled: true, offer: true });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_tourKey: { userId: 'u1', tourKey: 'counselor.home' } } }),
    );
  });

  it.each([
    ['COMPLETED', 1, false],
    ['DISMISSED', 1, false],
    ['STARTED', 1, true],
    ['COMPLETED', 0, true],
  ])('state %s v%i → offer %s while the Help menu stays enabled', async (status, version, offer) => {
    flag.mockResolvedValue(true);
    findUnique.mockResolvedValue({ version, status, lastStep: 0 } as any);
    expect(await getTourOffer('u1', 'counselor.home')).toEqual({ key: 'counselor.home', enabled: true, offer });
  });

  it('state is per user: another user’s dismissal does not hide the strip for this one', async () => {
    flag.mockResolvedValue(true);
    findUnique.mockImplementation((async (args: any) =>
      args.where.userId_tourKey.userId === 'u2' ? { version: 1, status: 'DISMISSED', lastStep: 0 } : null) as any);
    expect((await getTourOffer('u2', 'counselor.home'))?.offer).toBe(false);
    expect((await getTourOffer('u1', 'counselor.home'))?.offer).toBe(true);
  });

  it('degrades to nothing visible when the flag or DB read throws', async () => {
    flag.mockRejectedValue(new Error('db down'));
    expect(await getTourOffer('u1', 'counselor.home')).toEqual({ key: 'counselor.home', enabled: false, offer: false });
    flag.mockResolvedValue(true);
    findUnique.mockRejectedValue(new Error('db down'));
    expect(await getTourOffer('u1', 'counselor.home')).toEqual({ key: 'counselor.home', enabled: false, offer: false });
  });
});
