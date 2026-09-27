// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ActionDraft } from '@/lib/milestoneCascade/types';
import { CASCADE_DISPATCH_LEASE_MS, CASCADE_IDEMPOTENCY_WINDOW_MS, summarizeCascadeDispatch } from '@/lib/milestoneCascade/dispatchState';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), send: vi.fn(), activeWrite: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: async (fn: (db: unknown) => Promise<unknown>) => fn({ milestoneCascade: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } }) } }));
vi.mock('@/lib/email', () => ({ sendMilestoneCascadeEmail: mocks.send }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));
import { CascadeDispatchError, dispatchApprovedCascade } from '@/lib/milestoneCascade/sendApprovedCascade';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';
import type { CascadeDispatchState } from '@/lib/milestoneCascade/dispatchState';

type Row = {
  id: string; userId: string; status: string; drafts: Prisma.JsonValue; dispatchState: CascadeDispatchState | null;
  expiresAt: Date; sentAt: Date | null; approvedByUserId: string | null;
  user: { email: string; deletedAt: Date | null; billingDeletionPendingAt: Date | null; billingDeletionOperationId: string | null; organizationId: string };
};
const draft = (subject: string): ActionDraft => ({ type: 'celebrate_milestone', channel: 'email', subject, body: `Message ${subject}`, rationale: 'Synthetic milestone', confidence: 1 });
let row: Row;
let writeCount = 0;
let failWrite: number | null;
const initialDrafts = [draft('One'), draft('Two')];
const request = () => ({ cascadeId: row.id, drafts: initialDrafts, recipientEmail: row.user.email, approvedByUserId: 'synthetic-admin', sourceDrafts: row.drafts, scopeWhere: { user: { organizationId: 'org-1' } } });
const state = () => row.dispatchState!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T18:00:00Z'));
  vi.resetAllMocks(); writeCount = 0; failWrite = null;
  row = { id: '00000000-0000-4000-8000-000000000001', userId: 'member-1', status: 'awaiting_approval', drafts: JSON.parse(JSON.stringify(initialDrafts)), dispatchState: null, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), sentAt: null, approvedByUserId: null, user: { email: 'member@example.invalid', deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null, organizationId: 'org-1' } };
  mocks.activeWrite.mockImplementation(async (_userId, write) => write({ milestoneCascade: { updateMany: mocks.updateMany } }));
  mocks.findFirst.mockImplementation(async () => structuredClone(row));
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    writeCount++;
    if (writeCount === failWrite) throw new Error('Synthetic database write failure');
    const expected = where.dispatchState.equals;
    const stateMatches = row.dispatchState === null ? expected === Prisma.DbNull : JSON.stringify(expected) === JSON.stringify(row.dispatchState);
    const draftsMatch = !where.drafts || JSON.stringify(where.drafts.equals) === JSON.stringify(row.drafts);
    if (where.status !== row.status || !stateMatches || !draftsMatch || row.user.deletedAt || row.user.email.toLowerCase() !== where.AND[1].user.email.equals) return { count: 0 };
    row = { ...row, ...structuredClone(data) };
    return { count: 1 };
  });
  mocks.send.mockImplementation(async ({ subject }) => ({ ok: true, messageId: `provider-${subject}` }));
});
afterEach(() => vi.useRealTimers());

describe('durable milestone dispatch', () => {
  it('does not record acceptance without a provider receipt', async () => {
    mocks.send.mockResolvedValue({ ok: true });
    const result = await dispatchApprovedCascade(request());
    expect(result).toMatchObject({ emailsSent: 0, emailsFailed: 2 });
    expect(row.status).toBe('approved');
    expect(state().entries.every(entry => entry.status === 'failed' && entry.providerMessageId === null)).toBe(true);
  });
  it('persists approved with failed outcomes when every provider request fails', async () => {
    mocks.send.mockResolvedValue({ ok: false, error: 'Synthetic rejection' });
    const result = await dispatchApprovedCascade(request());
    expect(result).toMatchObject({ emailsSent: 0, emailsFailed: 2, dispatch: { failed: 2, canRetry: true } });
    expect(row.status).toBe('approved'); expect(row.sentAt).toBeNull();
    expect(state().entries.map(e => e.status)).toEqual(['failed', 'failed']);
    expect(state().entries.every(e => e.attempts === 1 && e.firstAttemptAt)).toBe(true);
  });

  it('retries only the failed draft and preserves the accepted provider receipt', async () => {
    mocks.send.mockResolvedValueOnce({ ok: true, messageId: 'accepted-one' }).mockResolvedValueOnce({ ok: false, error: 'Rate limited' });
    await dispatchApprovedCascade(request());
    const firstKeys = mocks.send.mock.calls.map(([args]) => args.idempotencyKey);
    const retry = await dispatchApprovedCascade(request());
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls.map(([args]) => args.subject)).toEqual(['One', 'Two', 'Two']);
    expect(mocks.send.mock.calls[2][0].idempotencyKey).toBe(firstKeys[1]);
    expect(state().entries[0]).toMatchObject({ attempts: 1, providerMessageId: 'accepted-one' });
    expect(state().entries[1].attempts).toBe(2);
    expect(retry).toMatchObject({ emailsSent: 2, emailsFailed: 0 });
    expect(row.status).toBe('sent'); expect(row.sentAt).toBeInstanceOf(Date);
    await dispatchApprovedCascade(request());
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it('a concurrent retry cannot acquire a live dispatch lease or send duplicates', async () => {
    let release!: () => void;
    mocks.send.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { ok: true, messageId: 'accepted-one' }; });
    const first = dispatchApprovedCascade(request());
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    expect(release).toBeTypeOf('function');
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_in_progress', status: 409 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    release(); await first;
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('stops before any provider call when the pre-send checkpoint fails', async () => {
    failWrite = 2;
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_persistence_failed', status: 503 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(row.status).toBe('approved'); expect(state().entries[0].status).toBe('pending');
  });

  it('uses the same provider key after acceptance followed by a lost state write', async () => {
    const accepted = new Map<string, string>();
    let uniqueDeliveries = 0;
    mocks.send.mockImplementation(async ({ idempotencyKey }) => {
      if (!accepted.has(idempotencyKey)) accepted.set(idempotencyKey, `receipt-${++uniqueDeliveries}`);
      return { ok: true, messageId: accepted.get(idempotencyKey) };
    });
    failWrite = 3;
    await expect(dispatchApprovedCascade(request())).rejects.toBeInstanceOf(CascadeDispatchError);
    expect(state().entries[0].status).toBe('sending');
    expect(uniqueDeliveries).toBe(1);
    vi.setSystemTime(new Date(Date.now() + CASCADE_DISPATCH_LEASE_MS + 1)); failWrite = null;
    await dispatchApprovedCascade(request());
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(uniqueDeliveries).toBe(2); // One actual provider acceptance for each frozen draft.
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(mocks.send.mock.calls[1][0].idempotencyKey);
    expect(row.status).toBe('sent');
  });

  it('finishes a failed final status write without resending accepted drafts', async () => {
    failWrite = 6; // claim + two checkpoints per draft + final status.
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_persistence_failed' });
    expect(state().entries.every(e => e.status === 'accepted')).toBe(true);
    expect(row.status).toBe('approved');
    expect(summarizeCascadeDispatch(state()).canFinalize).toBe(false);
    vi.setSystemTime(new Date(row.expiresAt.getTime() + 1));
    expect(summarizeCascadeDispatch(state()).canFinalize).toBe(true);
    failWrite = null;
    await dispatchApprovedCascade(request());
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('sent');
  });

  it('refuses an uncertain send after the bounded provider-idempotency window', async () => {
    failWrite = 3;
    await expect(dispatchApprovedCascade(request())).rejects.toBeInstanceOf(CascadeDispatchError);
    const sentCount = mocks.send.mock.calls.length;
    vi.setSystemTime(new Date(Date.now() + CASCADE_IDEMPOTENCY_WINDOW_MS)); failWrite = null;
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_reconciliation_required', retryable: false });
    expect(mocks.send).toHaveBeenCalledTimes(sentCount);
    expect(summarizeCascadeDispatch(state()).canRetry).toBe(false);
  });

  it('never sends a legacy approved cascade without a verified delivery record', async () => {
    row.status = 'approved';
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_reconciliation_required' });
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejects changed approved content and recipients instead of minting a fresh key', async () => {
    mocks.send.mockResolvedValue({ ok: false, error: 'Rejected' });
    await dispatchApprovedCascade(request()); mocks.send.mockClear();
    await expect(dispatchApprovedCascade({ ...request(), drafts: [draft('Changed'), initialDrafts[1]] })).rejects.toMatchObject({ code: 'dispatch_reconciliation_required' });
    row.user.email = 'new-owner@example.invalid';
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_reconciliation_required' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects a deleted member and scopes every checkpoint to an active tenant member', async () => {
    row.user.deletedAt = new Date();
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ status: 404 });
    expect(mocks.send).not.toHaveBeenCalled();
    row.user.deletedAt = null; await dispatchApprovedCascade(request());
    expect(mocks.updateMany.mock.calls[0][0].where.AND).toEqual([{ user: { organizationId: 'org-1' } }, { user: { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null, email: { equals: 'member@example.invalid', mode: 'insensitive' } } }]);
    for (const [args] of mocks.updateMany.mock.calls.slice(1)) expect(args.where.AND).toEqual([{ user: { organizationId: 'org-1' } }, { user: { deletedAt: null, email: { equals: 'member@example.invalid', mode: 'insensitive' } } }]);
  });

  it('does not claim or send when erasure wins after the initial cascade read', async () => {
    mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'member_inactive', status: 409 });
    expect(mocks.activeWrite).toHaveBeenCalledWith(row.userId, expect.any(Function));
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(['deleted', 'email-changed'])('does not send if the recipient changes between the initial read and claim: %s', async (change) => {
    mocks.findFirst.mockImplementationOnce(async () => {
      const snapshot = structuredClone(row);
      if (change === 'deleted') row.user.deletedAt = new Date();
      else row.user.email = 'different@example.invalid';
      return snapshot;
    });
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_conflict' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects a malformed attempted ledger that omits the first-send timestamp', async () => {
    mocks.send.mockResolvedValue({ ok: false, error: 'Rejected' });
    await dispatchApprovedCascade(request());
    state().entries[0].firstAttemptAt = null;
    mocks.send.mockClear();
    expect(summarizeCascadeDispatch(state()).canRetry).toBe(false);
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'dispatch_reconciliation_required' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses new outbound messages after the cascade TTL', async () => {
    row.expiresAt = new Date(Date.now());
    await expect(dispatchApprovedCascade(request())).rejects.toMatchObject({ code: 'expired' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('records advisory drafts without inventing provider sends', async () => {
    const advisory: ActionDraft = { type: 'request_peer_pair', rationale: 'Synthetic', confidence: 1 };
    row.drafts = [advisory];
    const result = await dispatchApprovedCascade({ ...request(), drafts: [advisory] });
    expect(result).toMatchObject({ emailsSent: 0, advisoryCount: 1 });
    expect(mocks.send).not.toHaveBeenCalled(); expect(row.status).toBe('sent');
  });
});
