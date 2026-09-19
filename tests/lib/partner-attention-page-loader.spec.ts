import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const h = vi.hoisted(() => ({ raw: vi.fn(), referrals: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: h.raw, $transaction: h.transaction, partnerReferral: { findMany: h.referrals },
} }));
import { loadPartnerAttentionPage, countPartnerAttention } from '@/lib/partner/attentionQueue';
import { parseAttentionQuery } from '@/lib/partner/attentionPagination';
const now = new Date('2026-09-19T12:00:00.000Z');
const counts = { all: 604, high: 504, medium: 50, low: 30, watch: 20 };
const key = (id: string) => ({ referralId: `r-${id}`, memberId: id, updatedAt: '2020-01-01T00:00:00.000Z', lastTouchName: id === 'old-a' ? 'Latest author' : null });
const referral = (id: string) => ({ id: `r-${id}`, memberId: id, partnerId: 'p1', assignedPartnerUserId: null, assignedPartnerUser: null,
 member: { id, fullName: id, enrolledProgram: null, courseEnrollments: [], enrolledAt: null, courseraEnrollmentApproved: false,
 updatedAt: new Date('2020-01-01'), deletedAt: null, assessmentCompleted: false, placementRecord: null,
 userCertifications: [], applications: [], memberProgramProgress: [] },
});
beforeEach(() => {
 vi.resetAllMocks();
 h.raw.mockResolvedValue([{ counts, rows: [key('old-a'), key('old-b'), key('next-page')] }]);
 h.referrals.mockResolvedValue([referral('old-b'), referral('old-a')]);
 h.transaction.mockImplementation(callback => callback({ $queryRaw: h.raw, partnerReferral: { findMany: h.referrals } }));
});
describe('partner attention page loader', () => {
 it('hydrates only requested page IDs in authenticated scope, keeps global ordering, and emits the last displayed key', async () => {
  const result = await loadPartnerAttentionPage('p1','o1',{ tier: 'high', limit: 2, asOf: now });
  expect(result.members.map(row => row.memberId)).toEqual(['old-a','old-b']);
  expect(result.members[0].lastTouchName).toBe('Latest author'); expect(result.members[1].lastTouchName).toBeNull();
  expect(result.total).toBe(504); expect(result.counts).toEqual(counts);
  expect(h.referrals).toHaveBeenCalledWith(expect.objectContaining({ where: {
    id: { in: ['r-old-a','r-old-b'] }, partnerId: 'p1', partner: { organizationId: 'o1', active: true },
    member: expect.objectContaining({ organizationId: 'o1', deletedAt: null, profile: { role: 'member' } }),
  } }));
  const options = parseAttentionQuery(new URLSearchParams({ tier: 'high', cursor: result.nextCursor! }), { partnerId: 'p1', organizationId: 'o1' }, now);
  expect(options.cursor?.referralId).toBe('r-old-b'); expect(options.asOf).toEqual(now);
  expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
 });
 it('keeps count on an empty final page without a hydration scan', async () => {
  h.raw.mockResolvedValueOnce([{ counts, rows: [] }]);
  expect(await loadPartnerAttentionPage('p1','o1',{ tier: 'medium', limit: 50, asOf: now })).toEqual({ members: [], total: 50, counts, nextCursor: null, asOf: now.toISOString() });
  expect(h.referrals).not.toHaveBeenCalled();
 });
 it('counts actionable members over the full cohort without hydrating any referral rows', async () => {
  expect(await countPartnerAttention('p1','o1')).toBe(584);
  expect(h.referrals).not.toHaveBeenCalled();
  expect((h.raw.mock.calls[0][0] as Prisma.Sql).values).toContain(0);
 });
 it('does not silently skip a page member when hydration is incomplete', async () => {
  h.referrals.mockResolvedValueOnce([referral('old-a')]);
  await expect(loadPartnerAttentionPage('p1','o1',{ tier: 'high', limit: 2, asOf: now })).rejects.toThrow('fully loaded');
 });
 it('does not turn a failed or missing aggregate into zero counts', async () => {
  h.raw.mockResolvedValueOnce([]);
  await expect(countPartnerAttention('p1','o1')).rejects.toThrow('no aggregate');
  h.raw.mockRejectedValueOnce(new Error('read failed'));
  await expect(loadPartnerAttentionPage('p1','o1',{ tier: 'all', limit: 50, asOf: now })).rejects.toThrow('read failed');
 });
});
