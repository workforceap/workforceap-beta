// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { POINT_VALUES } from '@/lib/member/pointsConfig';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), system: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: mocks.system }));
import { capturePendingReferral, getRewardedReferralCount, rewardReferralOnEnrollment, settlePendingReferralRewards } from '@/lib/member/referrals';

type Conversion = { id: string; referrerUserId: string; refereeUserId: string; code: string; status: string; rewardedAt: Date | null };
type Receipt = { userId: string; event: string; entityId: string; points: number };
type Balance = { userId: string; totalPoints: number; level: string; currentStreak: number; longestStreak: number; lastActiveDate: Date | null };
type Store = { conversion: Conversion | null; receipts: Receipt[]; balances: Record<string, Balance>; owner: string | null; refereeActive: boolean; refereeEnrolled: boolean };
let store: Store;
let fail: string | null;
let version: number;
let systemDepth: number;
let queries: Prisma.Sql[];
const code = 'ABCD2345';
const referrer = 'a-referrer';
const referee = 'b-referee';
const reward = () => rewardReferralOnEnrollment(referee, code);
const balance = (userId: string, totalPoints: number): Balance => ({ userId, totalPoints, level: 'starter', currentStreak: 0, longestStreak: 0, lastActiveDate: null });

beforeEach(() => {
  vi.clearAllMocks();
  store = { conversion: null, receipts: [], balances: {}, owner: referrer, refereeActive: true, refereeEnrolled: false };
  fail = null; version = 0; systemDepth = 0; queries = [];
  mocks.system.mockImplementation(async (fn: () => Promise<unknown>) => { systemDepth++; try { return await fn(); } finally { systemDepth--; } });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    expect(systemDepth).toBeGreaterThan(0);
    const snapshot = structuredClone(store); const start = version;
    const tx = {
      referralCode: { findFirst: async ({ where }: { where: { code: string; user: { deletedAt: null } } }) => {
        expect(where.user.deletedAt).toBeNull(); return snapshot.owner && where.code === code ? { userId: snapshot.owner } : null;
      } },
      user: { findFirst: async ({ where }: { where: { id: string; deletedAt: null } }) => { expect(where.deletedAt).toBeNull(); if (where.id === referrer) return snapshot.owner === null ? null : { id: referrer }; return snapshot.refereeActive ? { id: referee } : null; } },
      referralConversion: {
        findUnique: async () => snapshot.conversion,
        findMany: async ({ where }: { where: { status: string; referee: { deletedAt: null } } }) => {
          expect(where.status).toBe('pending'); expect(where.referee.deletedAt).toBeNull();
          return snapshot.conversion && snapshot.conversion.status === 'pending' && snapshot.refereeEnrolled ? [{ refereeUserId: snapshot.conversion.refereeUserId }] : [];
        },
        create: async ({ data }: { data: Omit<Conversion, 'id' | 'rewardedAt'> }) => snapshot.conversion = { ...data, id: 'conversion-1', rewardedAt: null },
        update: async ({ data }: { data: Partial<Conversion> }) => { if (fail === 'status') throw new Error('Synthetic final status failure'); Object.assign(snapshot.conversion!, data); return snapshot.conversion; },
      },
      pointsTransaction: { createMany: async ({ data }: { data: Receipt[] }) => {
        const receipt = data[0];
        if (fail === `receipt:${receipt.userId}`) throw new Error('Synthetic receipt failure');
        if (snapshot.receipts.some(r => r.userId === receipt.userId && r.event === receipt.event && r.entityId === receipt.entityId)) return { count: 0 };
        snapshot.receipts.push(receipt); return { count: 1 };
      } },
      memberPoints: {
        upsert: async ({ where, create, update }: { where: { userId: string }; create: Balance; update: { totalPoints: { increment: number } } }) => {
          if (fail === `balance:${where.userId}`) throw new Error('Synthetic balance failure');
          const prior = snapshot.balances[where.userId];
          snapshot.balances[where.userId] = prior ? { ...prior, totalPoints: prior.totalPoints + update.totalPoints.increment } : { ...balance(where.userId, create.totalPoints), ...create };
          return snapshot.balances[where.userId];
        },
        update: async ({ where, data }: { where: { userId: string }; data: Partial<Balance> }) => Object.assign(snapshot.balances[where.userId], data),
      },
      $queryRaw: async (query: Prisma.Sql) => { queries.push(query); return [{ count: 3 }]; },
    };
    const result = await fn(tx);
    if (start !== version) throw Object.assign(new Error('Synthetic serialization conflict'), { code: 'P2034' });
    store = snapshot; version++;
    return result;
  });
});

describe('atomic referral rewards', () => {
  it('commits both unique receipts, point balances and final status together', async () => {
    expect(await reward()).toBe(true);
    expect(store.conversion).toMatchObject({ status: 'rewarded', referrerUserId: referrer, refereeUserId: referee });
    expect(store.receipts).toHaveLength(2);
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);
    expect(store.balances[referee].totalPoints).toBe(POINT_VALUES.referral_referee_reward);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
  it.each([`balance:${referrer}`, `balance:${referee}`, `receipt:${referee}`, 'status'])('rolls all changes back on %s failure, then awards once on retry', async failure => {
    fail = failure;
    await expect(reward()).rejects.toThrow('Synthetic');
    expect(store).toMatchObject({ conversion: null, receipts: [], balances: {} });
    fail = null;
    expect(await reward()).toBe(true);
    expect(await reward()).toBe(false);
    expect(store.receipts).toHaveLength(2);
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);
    expect(store.balances[referee].totalPoints).toBe(POINT_VALUES.referral_referee_reward);
  });
  it('retries concurrent serializable conflicts without duplicate rewards', async () => {
    expect((await Promise.all([reward(), reward()])).sort()).toEqual([false, true]);
    expect(store.receipts).toHaveLength(2);
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);
    expect(store.balances[referee].totalPoints).toBe(POINT_VALUES.referral_referee_reward);
    expect(mocks.transaction.mock.calls.length).toBeGreaterThan(2);
  });
  it('repairs only the missing award on a historical rewarded conversion', async () => {
    const rewardedAt = new Date('2026-01-01T00:00:00Z');
    store.conversion = { id: 'old-conversion', referrerUserId: referrer, refereeUserId: referee, code, status: 'rewarded', rewardedAt };
    store.receipts = [{ userId: referrer, event: 'referral_referrer_reward', entityId: 'old-conversion', points: 150 }];
    store.balances[referrer] = balance(referrer, 325);
    expect(await reward()).toBe(true);
    expect(store.balances[referrer].totalPoints).toBe(325);
    expect(store.balances[referee].totalPoints).toBe(POINT_VALUES.referral_referee_reward);
    expect(store.receipts).toHaveLength(2);
    expect(store.conversion.rewardedAt).toEqual(rewardedAt);
    expect(await reward()).toBe(false);
  });
  it('does not guess a second increment when a historical ledger exists but the cache is missing', async () => {
    await reward(); delete store.balances[referrer];
    expect(await reward()).toBe(false);
    expect(store.balances[referrer]).toBeUndefined();
    expect(store.receipts).toHaveLength(2);
  });
  it('preserves original attribution when a different member supplies another code', async () => {
    await reward(); store.owner = 'different-referrer';
    expect(await reward()).toBe(false);
    expect(store.conversion?.referrerUserId).toBe(referrer);
    expect(store.balances['different-referrer']).toBeUndefined();
  });
  it.each(['unknown', 'self', 'deleted-referee'])('does not create rewards for %s', async reason => {
    if (reason === 'unknown') store.owner = null;
    if (reason === 'self') store.owner = referee;
    if (reason === 'deleted-referee') store.refereeActive = false;
    expect(await reward()).toBe(false);
    expect(store.receipts).toHaveLength(0); expect(store.conversion).toBeNull();
  });
  it('rejects malformed codes before a privileged transaction', async () => {
    expect(await rewardReferralOnEnrollment(referee, 'bad-code!')).toBe(false);
    expect(mocks.system).not.toHaveBeenCalled();
  });
  it('bounds serialization retries and surfaces an unresolved conflict', async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error('Serialization failed'), { code: 'P2034' }));
    await expect(reward()).rejects.toThrow('Serialization failed');
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });
  it('returns only an own aggregate requiring both reward receipts', async () => {
    expect(await getRewardedReferralCount(referrer)).toBe(3);
    expect(queries[0].values).toEqual([referrer]);
    expect(queries[0].sql).toContain('c.referrer_user_id = ?');
    expect(queries[0].sql).toContain("p.event = 'referral_referrer_reward'");
    expect(queries[0].sql).toContain("p.event = 'referral_referee_reward'");
  });
});

describe('durable attribution beyond the cookie (WAP-32)', () => {
  it('device A signup captures a pending conversion; device B enrollment with no cookie pays it once', async () => {
    // Device A: /r/<code> cookie present at account creation → pending row, no points yet.
    expect(await capturePendingReferral(referee, code)).toBe('captured');
    expect(store.conversion).toMatchObject({ status: 'pending', referrerUserId: referrer, refereeUserId: referee, code });
    expect(store.receipts).toHaveLength(0);
    expect(store.balances).toEqual({});

    // Device B (or 31+ days later): enrollment request carries no referral cookie.
    expect(await rewardReferralOnEnrollment(referee)).toBe(true);
    expect(store.conversion).toMatchObject({ status: 'rewarded' });
    expect(store.receipts).toHaveLength(2);
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);
    expect(store.balances[referee].totalPoints).toBe(POINT_VALUES.referral_referee_reward);

    // Exactly one pending conversion and one reward — replays are no-ops.
    expect(await rewardReferralOnEnrollment(referee)).toBe(false);
    expect(await rewardReferralOnEnrollment(referee, code)).toBe(false);
    expect(store.receipts).toHaveLength(2);
  });

  it('the captured attribution wins over a different cookie presented at enrollment', async () => {
    expect(await capturePendingReferral(referee, code)).toBe('captured');
    store.owner = 'different-referrer';
    expect(await rewardReferralOnEnrollment(referee, 'ZZZZ9999')).toBe(true);
    expect(store.conversion?.referrerUserId).toBe(referrer);
    expect(store.balances['different-referrer']).toBeUndefined();
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);
  });

  it('capture keeps the anti-farming guards and never overwrites a first attribution', async () => {
    store.owner = referee;
    expect(await capturePendingReferral(referee, code)).toBe('self_referral');
    store.owner = null;
    expect(await capturePendingReferral(referee, code)).toBe('unknown_code');
    expect(await capturePendingReferral(referee, 'nope!')).toBe('invalid_code');
    expect(store.conversion).toBeNull();

    store.owner = referrer;
    expect(await capturePendingReferral(referee, code)).toBe('captured');
    store.owner = 'different-referrer';
    expect(await capturePendingReferral(referee, code)).toBe('already_attributed');
    expect(store.conversion?.referrerUserId).toBe(referrer);
  });

  it('enrollment with no cookie and no captured attribution pays nothing', async () => {
    expect(await rewardReferralOnEnrollment(referee)).toBe(false);
    expect(await rewardReferralOnEnrollment(referee, undefined)).toBe(false);
    expect(store.conversion).toBeNull();
    expect(store.receipts).toHaveLength(0);
  });

  it('staff-led enrollment is settled by the sweep from the pending row alone', async () => {
    expect(await capturePendingReferral(referee, code)).toBe('captured');
    // Not yet enrolled: nothing to settle.
    expect(await settlePendingReferralRewards()).toEqual({ scanned: 0, rewarded: 0, skipped: 0, errors: 0 });
    expect(store.conversion?.status).toBe('pending');

    // Admin assigns the program (CourseEnrollment row exists) — no cookie anywhere.
    store.refereeEnrolled = true;
    expect(await settlePendingReferralRewards()).toEqual({ scanned: 1, rewarded: 1, skipped: 0, errors: 0 });
    expect(store.conversion?.status).toBe('rewarded');
    expect(store.receipts).toHaveLength(2);
    expect(store.balances[referrer].totalPoints).toBe(POINT_VALUES.referral_referrer_reward);

    // Rewarded rows leave the pending queue.
    expect(await settlePendingReferralRewards()).toEqual({ scanned: 0, rewarded: 0, skipped: 0, errors: 0 });
    expect(store.receipts).toHaveLength(2);
  });

  it('does not pay a pending conversion whose referrer account has since been deleted', async () => {
    expect(await capturePendingReferral(referee, code)).toBe('captured');
    store.owner = null; // referrer row gone
    expect(await rewardReferralOnEnrollment(referee)).toBe(false);
    expect(store.receipts).toHaveLength(0);
  });
});
