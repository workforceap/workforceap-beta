// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Product review 2026-09-22, item 4 (Mike's go 15:57 UTC): a Coursera
 * completion creates a `pending` UserCertification. These pin the helper's
 * contract against a mocked client: it inserts exactly one pending row per
 * (member, certificate name), never touches a row that already exists (a
 * member's own entry, a staff `approved` or `rejected` decision), and leaves
 * provenance in the audit trail because the model has no source column.
 */
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  userCertification: {
    findUnique: (...args: unknown[]) => mocks.findUnique(...args),
    create: (...args: unknown[]) => mocks.create(...args),
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: (...args: unknown[]) => mocks.transaction(...args),
  user: {},
  auditLog: {},
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));

import {
  PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
  ensurePendingCertificationForCompletion,
  ensurePendingCertificationForCompletionSafely,
  resolveCertificationNameForCourse,
} from '@/lib/certifications/pendingFromCompletion';

const PROGRAM = 'it-support-professional-certificate-ibm';
const COURSE = 'introduction-to-technical-support';
const CATALOG_NAME = 'Introduction to Technical Support';

const completion = {
  userId: 'user-1',
  programSlug: PROGRAM,
  courseSlug: COURSE,
  courseraCourseId: 'rNyuLa-pEeytqw64hz8ZCw',
  completedAt: new Date('2026-09-20T15:00:00.000Z'),
  source: 'coursera-webhook' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('resolveCertificationNameForCourse', () => {
  it('uses the canonical catalog name so every write path lands on one certificate per course', () => {
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: COURSE, courseName: 'Intro to Tech Support (Coursera title)' }))
      .toBe(CATALOG_NAME);
  });

  it('falls back to the provider name, then the slug, for a course the catalog does not know', () => {
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: 'not-in-catalog', courseName: '  Provider Course  ' }))
      .toBe('Provider Course');
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: 'not-in-catalog', courseName: null }))
      .toBe('not-in-catalog');
  });
});

describe('ensurePendingCertificationForCompletion', () => {
  it('creates a pending certificate dated at the completion when the member has none', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: true, id: 'cert-1', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_certName: { userId: 'user-1', certName: CATALOG_NAME } },
    }));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'user-1', certName: CATALOG_NAME, status: 'pending', earnedAt: completion.completedAt });
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('reviewedAt');
    expect(data).not.toHaveProperty('proofUrl');

    // Provenance: one audit row naming the write path, written through the same client.
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    const [params, db] = mocks.auditLog.mock.calls[0];
    expect(params).toMatchObject({
      actorUserId: null,
      action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
      targetType: 'user_certification',
      targetId: 'cert-1',
      metadata: {
        userId: 'user-1',
        certName: CATALOG_NAME,
        programSlug: PROGRAM,
        courseSlug: COURSE,
        courseraCourseId: 'rNyuLa-pEeytqw64hz8ZCw',
        source: 'coursera-webhook',
      },
    });
    expect(db).toBe(prismaMock);
  });

  it('dates the row now when the provider sent no usable completion time', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'cert-1', status: 'pending' });
    const before = Date.now();

    await ensurePendingCertificationForCompletion({ ...completion, completedAt: new Date('not a date') });

    const earnedAt = mocks.create.mock.calls[0][0].data.earnedAt as Date;
    expect(earnedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('is a no-op on a repeat report: no second row, no second audit entry', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: false, id: 'cert-1', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('never downgrades a certificate staff already approved (or rejected)', async () => {
    for (const status of ['approved', 'rejected'] as const) {
      vi.clearAllMocks();
      mocks.findUnique.mockResolvedValue({ id: `cert-${status}`, status });

      const result = await ensurePendingCertificationForCompletion(completion);

      expect(result.created).toBe(false);
      expect(result.status).toBe(status);
      expect(mocks.create).not.toHaveBeenCalled();
      // The transaction client exposes no update/upsert/delete, so any write
      // other than the guarded insert would have thrown above.
      expect(Object.keys(tx.userCertification)).toEqual(['findUnique', 'create']);
    }
  });

  it('respects a certificate the member typed in themselves under the same name', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'member-added', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion({ ...completion, source: 'coursera-progress-merge' });

    expect(result).toMatchObject({ created: false, id: 'member-added' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('treats a lost unique-key race as the other writer owning the row', async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cert-raced', status: 'pending' });
    mocks.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: false, id: 'cert-raced', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('rethrows any other database error', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error('connection lost'));

    await expect(ensurePendingCertificationForCompletion(completion)).rejects.toThrow('connection lost');
  });

  it('keeps the created certificate when only the provenance audit write fails', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'cert-1', status: 'pending' });
    mocks.auditLog.mockRejectedValue(new Error('audit down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result.created).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('uses the client a script passes in instead of the shared one', async () => {
    const scriptTx = {
      userCertification: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'cert-script', status: 'pending' })),
      },
    };
    const scriptDb = { $transaction: vi.fn(async (fn: (client: typeof scriptTx) => Promise<unknown>) => fn(scriptTx)), user: {}, auditLog: {} };

    const result = await ensurePendingCertificationForCompletion(
      { ...completion, source: 'backfill-script' },
      { db: scriptDb as never },
    );

    expect(result.created).toBe(true);
    expect(scriptDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.auditLog.mock.calls[0][1]).toBe(scriptDb);
    expect(mocks.auditLog.mock.calls[0][0].metadata.source).toBe('backfill-script');
  });
});

describe('ensurePendingCertificationForCompletionSafely', () => {
  it('logs and returns null so a completion write never fails on the certificate', async () => {
    mocks.transaction.mockRejectedValue(new Error('database unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensurePendingCertificationForCompletionSafely(completion)).resolves.toBeNull();

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain(`${PROGRAM}/${COURSE}`);
    error.mockRestore();
  });

  it('returns the helper result on success', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    await expect(ensurePendingCertificationForCompletionSafely(completion)).resolves.toMatchObject({ created: true, id: 'cert-1' });
  });
});
