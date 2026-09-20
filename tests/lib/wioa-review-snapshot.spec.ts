import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/audit', () => ({ resolveActorSnapshot: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
import { resolveActorSnapshot } from '@/lib/audit';
import { captureApiError } from '@/lib/observability/captureApiError';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';

const args = { organizationId: 'org-a', userId: 'member-a', actorUserId: 'staff-a', source: 'application_decision' as const, decision: 'APPROVED' };
const createdAt = new Date('2026-09-19T12:00:00Z');
const screening = { id: 'screening-a', createdAt, q1: 'yes', q2: 'no', q3: 'yes', qualifies: true, yesCount: 2, snapWic: 'yes' };
const preScreening = { id: 'pre-a', organizationId: 'org-a', createdAt, barrier: 'Transport', workforceAssistance: true };
const makeDb = () => ({
  user: { findFirst: vi.fn().mockResolvedValue({ email: 'fixture@example.invalid', fullName: 'Fixture Member', programInterest: null, wioaReviewStatus: 'pending', wioaQualificationJson: null, applyEligibilityScreenings: [screening], preScreeningResponse: preScreening, profile: { dob: createdAt } }) },
  wioaReviewSnapshot: { create: vi.fn().mockResolvedValue({ id: 'snapshot-a' }) },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveActorSnapshot).mockResolvedValue({ email: 'staff@example.invalid', role: 'admin', exists: true });
});

describe('WIOA decision snapshot', () => {
  it('retains source answers and timestamps for an apply-only member', async () => {
    const db = makeDb();
    await recordWioaReviewSnapshot(args, db as unknown as Prisma.TransactionClient);
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-a', organizationId: 'org-a', deletedAt: null } }));
    const data = db.wioaReviewSnapshot.create.mock.calls[0][0].data;
    expect(data.eligibilitySnapshot).toMatchObject({ version: 2, evidenceType: 'self_reported_intake', selfScreening: null, applyScreening: { ...screening, createdAt: createdAt.toISOString() }, preScreening: { ...preScreening, createdAt: createdAt.toISOString() } });
    expect(data.memberEmailSnapshot).toBe('fixture@example.invalid');
    expect(resolveActorSnapshot).toHaveBeenCalledWith('staff-a', db);
  });
  it('fails closed when the subject is missing or outside the tenant', async () => {
    const db = makeDb();
    db.user.findFirst.mockResolvedValue(null as never);
    await expect(recordWioaReviewSnapshot(args, db as unknown as Prisma.TransactionClient)).rejects.toThrow('MEMBER_NOT_FOUND');
    expect(db.wioaReviewSnapshot.create).not.toHaveBeenCalled();
  });
  it('rejects a mismatched pre-screen tenant instead of copying it', async () => {
    const db = makeDb();
    const member = await db.user.findFirst();
    db.user.findFirst.mockResolvedValue({ ...member, preScreeningResponse: { ...preScreening, organizationId: 'org-b' } });
    await expect(recordWioaReviewSnapshot(args, db as unknown as Prisma.TransactionClient)).rejects.toThrow('SCOPE_MISMATCH');
    expect(db.wioaReviewSnapshot.create).not.toHaveBeenCalled();
  });
  it('reports and propagates a write failure to the enclosing decision transaction', async () => {
    const db = makeDb();
    const error = new Error('write failed');
    db.wioaReviewSnapshot.create.mockRejectedValue(error);
    await expect(recordWioaReviewSnapshot(args, db as unknown as Prisma.TransactionClient)).rejects.toBe(error);
    expect(captureApiError).toHaveBeenCalledWith(error, { route: 'lib/wioa/reviewSnapshot' });
  });
  it.each([
    ['application_decision' as const, 'DENIED'],
    ['wioa_review' as const, 'not_eligible'],
  ])('refuses a %s %s without a written reason and writes nothing (WAP-184 G-3)', async (source, decision) => {
    const db = makeDb();
    for (const notes of [undefined, null, '', '   ']) {
      await expect(recordWioaReviewSnapshot({ ...args, source, decision, notes }, db as unknown as Prisma.TransactionClient))
        .rejects.toThrow('DENIAL_REASON_REQUIRED');
    }
    expect(db.wioaReviewSnapshot.create).not.toHaveBeenCalled();
  });
  it('records a denial once a reason is written, and never demands one for a non-denial', async () => {
    const db = makeDb();
    await recordWioaReviewSnapshot({ ...args, decision: 'DENIED', notes: 'Outside the service area.' }, db as unknown as Prisma.TransactionClient);
    await recordWioaReviewSnapshot({ ...args, decision: 'APPROVED', notes: null }, db as unknown as Prisma.TransactionClient);
    await recordWioaReviewSnapshot({ ...args, source: 'wioa_review', decision: 'needs_info', notes: undefined }, db as unknown as Prisma.TransactionClient);
    expect(db.wioaReviewSnapshot.create).toHaveBeenCalledTimes(3);
    expect(db.wioaReviewSnapshot.create.mock.calls[0][0].data).toMatchObject({ decision: 'DENIED', notes: 'Outside the service area.' });
  });
  it('does not silently lose an unavailable actor identity', async () => {
    const db = makeDb();
    vi.mocked(resolveActorSnapshot).mockResolvedValue({ email: null, role: null, exists: null });
    await expect(recordWioaReviewSnapshot(args, db as unknown as Prisma.TransactionClient)).rejects.toThrow('ACTOR_UNAVAILABLE');
    expect(db.wioaReviewSnapshot.create).not.toHaveBeenCalled();
  });
  it('preserves old and new funding sources without claiming eligibility verification', async () => {
    const db = makeDb();
    const funding = { enrollmentId: 'enrollment-a', previousSource: null, source: 'GRANT' };
    await recordWioaReviewSnapshot({ ...args, source: 'enrollment_funding', decision: 'GRANT', funding }, db as unknown as Prisma.TransactionClient);
    expect(db.wioaReviewSnapshot.create.mock.calls[0][0].data.eligibilitySnapshot.funding).toEqual(funding);
  });
});
