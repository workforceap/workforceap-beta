import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueThread, upsertThread } = vi.hoisted(() => ({
  findUniqueThread: vi.fn(),
  upsertThread: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    // No `create`: the first open goes through `upsert` on the unique owner
    // column (a stray create would throw "not a function" and fail the spec).
    messageThread: { findUnique: findUniqueThread, upsert: upsertThread },
  },
}));

import {
  getOrCreateEmployerMessageThread,
  getOrCreatePartnerMessageThread,
} from '@/lib/messages/portalThreads';

/**
 * Fake unique-column store: the first upsert for an owner creates the row,
 * every later upsert for the same owner returns that same row. A `create`
 * would have thrown P2002 on the second call.
 */
function fakeUniqueStore(column: 'employerId' | 'partnerId') {
  const rows = new Map<string, { id: string; kind: string; [k: string]: unknown }>();
  return async ({ where, create }: { where: Record<string, string>; create: Record<string, unknown> }) => {
    const key = where[column];
    const hit = rows.get(key);
    if (hit) return hit;
    const row = { id: `thread-${rows.size + 1}`, ...create } as { id: string; kind: string };
    rows.set(key, row);
    return row;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueThread.mockResolvedValue(null);
});

describe('getOrCreateEmployerMessageThread', () => {
  it('returns the existing thread without writing', async () => {
    findUniqueThread.mockResolvedValue({ id: 'thread-e', kind: 'employer', employerId: 'emp-1' });
    const thread = await getOrCreateEmployerMessageThread('emp-1');
    expect(thread).toEqual({ id: 'thread-e', kind: 'employer', employerId: 'emp-1' });
    expect(upsertThread).not.toHaveBeenCalled();
  });

  it('first open upserts keyed on the unique employerId', async () => {
    upsertThread.mockImplementation(fakeUniqueStore('employerId'));
    const thread = await getOrCreateEmployerMessageThread('emp-1');
    expect(upsertThread).toHaveBeenCalledTimes(1);
    expect(upsertThread).toHaveBeenCalledWith({
      where: { employerId: 'emp-1' },
      create: { kind: 'employer', employerId: 'emp-1' },
      update: {},
    });
    expect(thread).toEqual({ id: 'thread-1', kind: 'employer', employerId: 'emp-1' });
  });

  it('two concurrent first opens for one employer converge on a single thread', async () => {
    // Both callers miss findUnique (null) before either has written.
    upsertThread.mockImplementation(fakeUniqueStore('employerId'));
    const [a, b] = await Promise.all([
      getOrCreateEmployerMessageThread('emp-1'),
      getOrCreateEmployerMessageThread('emp-1'),
    ]);
    expect(a.id).toBe('thread-1');
    expect(b.id).toBe('thread-1');
    expect(b).toEqual(a);
    expect(upsertThread).toHaveBeenCalledTimes(2);
    for (const [args] of upsertThread.mock.calls) {
      expect(args.where).toEqual({ employerId: 'emp-1' });
    }
  });
});

describe('getOrCreatePartnerMessageThread', () => {
  it('returns the existing thread without writing', async () => {
    findUniqueThread.mockResolvedValue({ id: 'thread-p', kind: 'partner', partnerId: 'par-1' });
    const thread = await getOrCreatePartnerMessageThread('par-1');
    expect(thread).toEqual({ id: 'thread-p', kind: 'partner', partnerId: 'par-1' });
    expect(upsertThread).not.toHaveBeenCalled();
  });

  it('first open upserts keyed on the unique partnerId', async () => {
    upsertThread.mockImplementation(fakeUniqueStore('partnerId'));
    const thread = await getOrCreatePartnerMessageThread('par-1');
    expect(upsertThread).toHaveBeenCalledTimes(1);
    expect(upsertThread).toHaveBeenCalledWith({
      where: { partnerId: 'par-1' },
      create: { kind: 'partner', partnerId: 'par-1' },
      update: {},
    });
    expect(thread).toEqual({ id: 'thread-1', kind: 'partner', partnerId: 'par-1' });
  });

  it('two concurrent first opens for one partner converge on a single thread', async () => {
    upsertThread.mockImplementation(fakeUniqueStore('partnerId'));
    const [a, b] = await Promise.all([
      getOrCreatePartnerMessageThread('par-1'),
      getOrCreatePartnerMessageThread('par-1'),
    ]);
    expect(a.id).toBe('thread-1');
    expect(b).toEqual(a);
    expect(upsertThread).toHaveBeenCalledTimes(2);
    for (const [args] of upsertThread.mock.calls) {
      expect(args.where).toEqual({ partnerId: 'par-1' });
    }
  });
});
