import { afterEach, describe, expect, it, vi } from 'vitest';
import { retainEnrollmentAgreementData, exportEnrollmentAgreementData } from '@/lib/gdpr/enrollmentAgreementData';

type AgreementDb = Parameters<typeof exportEnrollmentAgreementData>[1];
const MEMBER_ID = 'member-1';
const uploadedAt = new Date('2026-10-01T12:00:00Z');

function database(present: boolean) {
  const $queryRaw = vi.fn().mockResolvedValue([{ present }]);
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const deleteMany = vi.fn();
  return {
    $queryRaw, findMany, updateMany, deleteMany,
    db: { $queryRaw, enrollmentAgreementSubmission: { findMany, updateMany, deleteMany } } as unknown as AgreementDb,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('enrollment agreement privacy data', () => {
  it('does not access an absent table before the additive migration', async () => {
    const { db, findMany, updateMany, deleteMany } = database(false);
    expect(await exportEnrollmentAgreementData(MEMBER_ID, db)).toEqual([]);
    await retainEnrollmentAgreementData(MEMBER_ID, db);
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('exports every revision even with the feature off, with no storage capability or raw PDF', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    const { db, findMany } = database(true);
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `agreement-${index}`,
      templateVersion: index === 0 ? 'previous' : '2026-09-30',
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      subjectMemberId: MEMBER_ID,
      subjectName: 'Synthetic Member',
      uploadedByUserId: null,
      uploadedBySubjectId: MEMBER_ID,
      uploadedAt,
      status: index === 500 ? 'pending' : index % 2 ? 'verified' : 'needs_correction',
      isCurrent: index === 500,
      reviewedByUserId: null,
      reviewedBySubjectId: index === 500 ? null : 'staff-1',
      reviewedAt: index === 500 ? null : uploadedAt,
      reviewNote: index === 500 ? null : 'Missing date',
    }));
    findMany.mockResolvedValue(rows);
    const result = await exportEnrollmentAgreementData(MEMBER_ID, db);
    expect(result).toHaveLength(501);
    expect(result[0]).toEqual({ ...rows[0], uploadedAt: uploadedAt.toISOString(), reviewedAt: uploadedAt.toISOString() });
    expect(result[500].reviewedAt).toBeNull();
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({ subjectMemberId: MEMBER_ID });
    expect(query.select.uploadedBySubjectId).toBe(true);
    expect(query.select.reviewedBySubjectId).toBe(true);
    expect(query).not.toHaveProperty('take');
    expect(query.select).not.toHaveProperty('storagePath');
    expect(query.select).not.toHaveProperty('pdf');
    expect(result[0]).not.toHaveProperty('storagePath');
  });

  it('detaches all statuses and history while retaining every evidence field, even with the feature off', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    const { db, updateMany, deleteMany } = database(true);
    const history = ['pending', 'verified', 'needs_correction'].flatMap((status) => [true, false].map((isCurrent) => ({
      id: status + '-' + isCurrent, memberId: MEMBER_ID as string | null, subjectMemberId: MEMBER_ID,
      subjectName: 'Synthetic Member', status, isCurrent, sha256: 'a'.repeat(64),
      storagePath: 'enrollment-agreements/' + MEMBER_ID + '/' + status + '-' + isCurrent + '.pdf',
      uploadedBySubjectId: MEMBER_ID, reviewedBySubjectId: 'staff-retired', reviewNote: 'Original review',
    })));
    const before = structuredClone(history);
    updateMany.mockImplementation(async ({ where, data }) => {
      for (const row of history) if (row.memberId === where.memberId) Object.assign(row, data);
      return { count: history.length };
    });
    await retainEnrollmentAgreementData(MEMBER_ID, db);
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({ where: { memberId: MEMBER_ID }, data: { memberId: null } });
    expect(history).toEqual(before.map((row) => ({ ...row, memberId: null })));
    expect(deleteMany).not.toHaveBeenCalled();
    await retainEnrollmentAgreementData(MEMBER_ID, db);
    expect(history).toHaveLength(6);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('does not confuse a database failure with an absent table', async () => {
    const { db, $queryRaw, findMany, updateMany, deleteMany } = database(false);
    $queryRaw.mockRejectedValue(new Error('database unavailable'));
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('database unavailable');
    await expect(retainEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('database unavailable');
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous capability response instead of silently dropping personal data', async () => {
    const { db, $queryRaw } = database(false);
    $queryRaw.mockResolvedValue([]);
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('availability could not be confirmed');
    await expect(retainEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('availability could not be confirmed');
  });

  it('propagates submission-read and retention failures after a successful presence check', async () => {
    const { db, findMany, updateMany, deleteMany } = database(true);
    findMany.mockRejectedValue(new Error('read denied'));
    updateMany.mockRejectedValue(new Error('retention denied'));
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('read denied');
    await expect(retainEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('retention denied');
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
