import { beforeEach, describe, expect, it, vi } from 'vitest';

// WAP-169: one anonymiser for every deletion path. These cases pin what it
// writes and, above all, what it never writes (the original address).

vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { Prisma } from '@prisma/client';
import {
  ANONYMIZED_FULL_NAME,
  ANONYMIZED_PROFILE_DATA,
  ANONYMIZED_PROFILE_FIELDS,
  MEMBER_ANONYMIZED_AUDIT_ACTION,
  anonymizeMember,
} from '@/lib/member/anonymizeMember';
import { parseDeletedEmail } from '@/lib/member/deletedEmail';

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORIGINAL_EMAIL = 'jane.doe@example.com';
const NOW = new Date('2026-09-20T14:00:00.000Z');

type AnonymizeDb = NonNullable<Parameters<typeof anonymizeMember>[2]>;
type Call = { where?: unknown; data: Record<string, unknown> };

function fakeDb(user: { email: string; deletedAt: Date | null } | null) {
  const tx = {
    user: {
      findUnique: vi.fn(async (_args: unknown) => user),
      update: vi.fn(async (_args: Call) => ({})),
    },
    profile: { updateMany: vi.fn(async (_args: Call) => ({ count: 1 })) },
    auditLog: { create: vi.fn(async (_args: Call) => ({})) },
  };
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return { tx, $transaction, db: { $transaction } as unknown as AnonymizeDb };
}

describe('anonymizeMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scrubs the user row, nulls every profile PII column, and soft-deletes in one transaction', async () => {
    const { tx, $transaction, db } = fakeDb({ email: ORIGINAL_EMAIL, deletedAt: null });

    const result = await anonymizeMember(USER_ID, { reason: 'member_self_delete', now: NOW }, db);

    expect(result).toEqual({ userId: USER_ID, deletedAt: NOW, alreadyDeleted: false, profileRowsCleared: 1 });
    expect($transaction).toHaveBeenCalledTimes(1);

    const userWrite = tx.user.update.mock.calls[0][0];
    expect(userWrite.where).toEqual({ id: USER_ID });
    expect(userWrite.data).toMatchObject({
      fullName: ANONYMIZED_FULL_NAME,
      phone: null,
      workspaceEmail: null,
      assessmentAnswers: Prisma.JsonNull,
      careerRecommendationJson: Prisma.JsonNull,
      wioaQualificationJson: Prisma.JsonNull,
      wioaReviewNotes: null,
      deletedAt: NOW,
    });
    // The marker releases the address from the unique constraint but keeps
    // it recoverable for /admin/users/deleted during the 30-day window.
    expect(userWrite.data.email).toBe(`deleted_${USER_ID}_${NOW.getTime()}_${ORIGINAL_EMAIL}@deleted.invalid`);
    expect(parseDeletedEmail(String(userWrite.data.email))).toBe(ORIGINAL_EMAIL);

    expect(tx.profile.updateMany).toHaveBeenCalledWith({ where: { userId: USER_ID }, data: ANONYMIZED_PROFILE_DATA });
  });

  it('clears every special-category and identifying profile column the policy names', () => {
    for (const field of [
      'address', 'city', 'state', 'zip', 'dob', 'profilePhone', 'profileAddress', 'profileLinkedin', 'profileBio',
      'counselorNotes', 'resumeOriginalPath', 'resumeEnhancedPath', 'profilePhotoPath',
      'veteranStatus', 'employmentStatus', 'employmentStatusAtEnroll', 'educationLevel', 'householdIncome',
      'usCitizen', 'authorizedToWork', 'hasDisability', 'ethnicity', 'hasEmploymentBarrier', 'barrierTypes',
      'parentGuardianName', 'parentGuardianEmail', 'parentGuardianPhone', 'schoolName', 'schoolDistrict', 'gradeLevel', 'studentId',
    ]) {
      expect(ANONYMIZED_PROFILE_FIELDS).toContain(field);
    }
    expect(ANONYMIZED_PROFILE_DATA.barrierTypes).toEqual([]);
    expect(ANONYMIZED_PROFILE_DATA.hasEmploymentBarrier).toBe(false);
  });

  it('writes one audit row about the anonymisation that carries no PII', async () => {
    const { tx, db } = fakeDb({ email: ORIGINAL_EMAIL, deletedAt: null });

    await anonymizeMember(USER_ID, { reason: 'gdpr_account_delete', now: NOW }, db);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.auditLog.create.mock.calls[0][0];
    expect(audit.data).toMatchObject({
      actorUserId: USER_ID,
      actorEmailSnapshot: null,
      actorRoleSnapshot: 'member',
      action: MEMBER_ANONYMIZED_AUDIT_ACTION,
      targetType: 'User',
      targetId: USER_ID,
      metadata: expect.objectContaining({ reason: 'gdpr_account_delete', alreadyDeleted: false, profileRowsCleared: 1 }),
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(ORIGINAL_EMAIL);
    expect(serialized).not.toContain('jane');
    expect(serialized).not.toContain('example.com');
    // No actor lookup either: a lookup would snapshot the (marker) email.
    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing marker and deleted_at when the account is already soft-deleted', async () => {
    const earlier = new Date('2026-08-01T00:00:00.000Z');
    const marker = `deleted_${USER_ID}_1754006400000_${ORIGINAL_EMAIL}@deleted.invalid`;
    const { tx, db } = fakeDb({ email: marker, deletedAt: earlier });

    const result = await anonymizeMember(USER_ID, { reason: 'retention_purge_blocked', actorUserId: null, now: NOW }, db);

    expect(result).toEqual({ userId: USER_ID, deletedAt: earlier, alreadyDeleted: true, profileRowsCleared: 1 });
    const userWrite = tx.user.update.mock.calls[0][0];
    expect(userWrite.data.email).toBe(marker);
    expect(userWrite.data.deletedAt).toEqual(earlier);
    // Unattended job: no actor, system role, still no PII.
    const audit = tx.auditLog.create.mock.calls[0][0];
    expect(audit.data).toMatchObject({ actorUserId: null, actorEmailSnapshot: null, actorRoleSnapshot: 'system' });
    expect((audit.data.metadata as Record<string, unknown>).reason).toBe('retention_purge_blocked');
  });

  it('returns null and writes nothing when there is no users row', async () => {
    const { tx, db } = fakeDb(null);

    expect(await anonymizeMember(USER_ID, { reason: 'member_self_delete' }, db)).toBeNull();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates a failed audit write so the caller cannot report a deletion that did not commit', async () => {
    const { tx, db } = fakeDb({ email: ORIGINAL_EMAIL, deletedAt: null });
    tx.auditLog.create.mockRejectedValue(new Error('audit_logs unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(anonymizeMember(USER_ID, { reason: 'member_self_delete', now: NOW }, db)).rejects.toThrow('audit_logs unavailable');
    errorSpy.mockRestore();
  });
});
