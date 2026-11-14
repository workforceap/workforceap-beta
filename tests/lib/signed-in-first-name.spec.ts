// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import { prisma } from '@/lib/db/prisma';
import { signedInFirstName } from '@/lib/portal/signedInFirstName';

type PrismaUser = { user?: { findUnique?: typeof mocks.findUnique } };
const db = prisma as unknown as PrismaUser;

beforeEach(() => {
  vi.resetAllMocks();
  db.user = { findUnique: mocks.findUnique };
});

describe('signedInFirstName', () => {
  it('returns the first token of the users-row name', async () => {
    mocks.findUnique.mockResolvedValue({ fullName: '  Alex Rivera  ' });
    expect(await signedInFirstName('user-1')).toBe('Alex');
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { fullName: true } });
  });

  it.each([
    ['missing row', null],
    ['blank name', { fullName: '   ' }],
    ['null name', { fullName: null }],
  ])('stays undefined for %s', async (_label, row) => {
    mocks.findUnique.mockResolvedValue(row);
    expect(await signedInFirstName('user-1')).toBeUndefined();
  });

  it('does not throw when the lookup is unavailable', async () => {
    mocks.findUnique.mockRejectedValue(new Error('database unavailable'));
    expect(await signedInFirstName('user-1')).toBeUndefined();
    db.user = {};
    expect(await signedInFirstName('user-1')).toBeUndefined();
    delete db.user;
    expect(await signedInFirstName('user-1')).toBeUndefined();
  });
});
