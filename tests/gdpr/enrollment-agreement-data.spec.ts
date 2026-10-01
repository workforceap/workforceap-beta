import { afterEach, describe, expect, it, vi } from 'vitest';
import { eraseEnrollmentAgreementData, exportEnrollmentAgreementData } from '@/lib/gdpr/enrollmentAgreementData';

type AgreementDb = Parameters<typeof exportEnrollmentAgreementData>[1];
const MEMBER_ID = 'member-1';
const uploadedAt = new Date('2026-10-01T12:00:00Z');

function database(present: boolean) {
  const $queryRaw = vi.fn().mockResolvedValue([{ present }]);
  const findMany = vi.fn().mockResolvedValue([]);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  return {
    $queryRaw, findMany, deleteMany,
    db: { $queryRaw, enrollmentAgreementSubmission: { findMany, deleteMany } } as unknown as AgreementDb,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('enrollment agreement privacy data', () => {
  it('does not access an absent table before the additive migration', async () => {
    const { db, findMany, deleteMany } = database(false);
    expect(await exportEnrollmentAgreementData(MEMBER_ID, db)).toEqual([]);
    await eraseEnrollmentAgreementData(MEMBER_ID, db);
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('exports every revision even with the feature off, with no storage capability or raw PDF', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    const { db, findMany } = database(true);
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `agreement-${index}`,
      templateVersion: index === 0 ? 'previous' : '2026-09-30',
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      uploadedByUserId: MEMBER_ID,
      uploadedAt,
      status: index === 500 ? 'pending' : 'rejected',
      isCurrent: index === 500,
      reviewedByUserId: index === 500 ? null : 'staff-1',
      reviewedAt: index === 500 ? null : uploadedAt,
      reviewNote: index === 500 ? null : 'Missing date',
    }));
    findMany.mockResolvedValue(rows);
    const result = await exportEnrollmentAgreementData(MEMBER_ID, db);
    expect(result).toHaveLength(501);
    expect(result[0]).toEqual({ ...rows[0], uploadedAt: uploadedAt.toISOString(), reviewedAt: uploadedAt.toISOString() });
    expect(result[500].reviewedAt).toBeNull();
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({ memberId: MEMBER_ID });
    expect(query).not.toHaveProperty('take');
    expect(query.select).not.toHaveProperty('storagePath');
    expect(query.select).not.toHaveProperty('pdf');
    expect(result[0]).not.toHaveProperty('storagePath');
  });

  it('erases all subject revisions while the feature is off, never other members or billing records', async () => {
    vi.stubEnv('ENROLLMENT_AGREEMENTS_ENABLED', 'false');
    const { db, deleteMany } = database(true);
    await eraseEnrollmentAgreementData(MEMBER_ID, db);
    expect(deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { memberId: MEMBER_ID } });
  });

  it('does not confuse a database failure with an absent table', async () => {
    const { db, $queryRaw, findMany, deleteMany } = database(false);
    $queryRaw.mockRejectedValue(new Error('database unavailable'));
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('database unavailable');
    await expect(eraseEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('database unavailable');
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous capability response instead of silently dropping personal data', async () => {
    const { db, $queryRaw } = database(false);
    $queryRaw.mockResolvedValue([]);
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('availability could not be confirmed');
    await expect(eraseEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('availability could not be confirmed');
  });

  it('propagates submission-read and erase failures after a successful presence check', async () => {
    const { db, findMany, deleteMany } = database(true);
    findMany.mockRejectedValue(new Error('read denied'));
    deleteMany.mockRejectedValue(new Error('erase denied'));
    await expect(exportEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('read denied');
    await expect(eraseEnrollmentAgreementData(MEMBER_ID, db)).rejects.toThrow('erase denied');
  });
});
