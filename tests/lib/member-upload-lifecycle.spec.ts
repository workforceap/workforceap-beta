import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  events: [] as string[],
  owned: true,
  interactive: true,
  lockGate: null as Promise<void> | null,
}));

vi.mock('@/lib/db/transactionPolicy', () => ({
  interactiveTransactionsGuaranteed: () => h.interactive,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: vi.fn(async () => {
    h.events.push('lock');
    if (h.lockGate) await h.lockGate;
  }),
  scopedBillingUser: vi.fn(async () => ({ user: { findFirst: async () => {
    h.events.push('marker');
    return h.owned ? { id: 'member-1' } : null;
  } } })),
}));

import { assertMemberUploadWritable, MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

beforeEach(() => {
  h.events.length = 0;
  h.owned = true;
  h.interactive = true;
  h.lockGate = null;
});

describe('member upload lifecycle barrier', () => {
  it('rejects a staged upload when deletion commits while it waits for the member lock', async () => {
    let release!: () => void;
    h.lockGate = new Promise<void>((resolve) => { release = resolve; });
    const write = assertMemberUploadWritable({} as never, 'member-1', 'claim-1');
    await vi.waitFor(() => expect(h.events).toEqual(['lock']));

    h.owned = false;
    release();
    await expect(write).rejects.toBeInstanceOf(MemberUploadLifecycleError);
    expect(h.events).toEqual(['lock', 'marker']);
  });

  it('checks the marker without a transaction lock in flattened preview', async () => {
    h.interactive = false;
    h.owned = false;
    await expect(assertMemberUploadWritable({} as never, 'member-1', 'claim-1'))
      .rejects.toBeInstanceOf(MemberUploadLifecycleError);
    expect(h.events).toEqual(['marker']);
  });
});
