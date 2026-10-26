// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findUnique: vi.fn(),
  provenance: vi.fn(),
  audit: vi.fn(),
  generate: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn().mockResolvedValue(1),
  userCertification: { createMany: mocks.createMany, findUnique: mocks.findUnique },
  auditLog: { findMany: mocks.provenance },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  ...tx, $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx),
} }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/ai/groq', () => ({ groqChatCompletion: mocks.generate }));

import { getProgramBySlug } from '@/lib/content/programs';
import { resolveProgramCourseWithCatalogFallback } from '@/lib/member/programCourseMatch';
import { ensurePendingCertificationForCompletion, resolveCertificationNameForCourse } from '@/lib/certifications/pendingFromCompletion';
import { generateResumeBullet } from '@/lib/ai/proactiveResumeGenerator';

const PROGRAM = 'cybersecurity-professional-certificate-google';
const LEGACY_COURSE = `${PROGRAM}-course-1`;
const PROVIDER_ID = 'N0l8fiV4Ee6DuxLo8f8SVQ';
const COURSE_NAME = 'Introduction to Networking';
const CERT_NAME = `${COURSE_NAME} — Networking and Cybersecurity Professional Certificate (Net+, Sec+)`;
const completion = {
  userId: 'synthetic-learner', programSlug: PROGRAM, courseSlug: LEGACY_COURSE,
  courseraCourseId: PROVIDER_ID, source: 'coursera-webhook' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.provenance.mockResolvedValue([]);
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockImplementation(async ({ where }) => where.userId_certName?.certName === CERT_NAME
    ? { id: 'new-certificate', status: 'pending', certName: CERT_NAME } : null);
  mocks.audit.mockResolvedValue(undefined);
});

describe('legacy mapped course display names', () => {
  it.each([PROVIDER_ID, `Course~${PROVIDER_ID}`])('keeps the mapped identity while resolving exact provider name: %s', async (providerId) => {
    const mapping = { programSlug: PROGRAM, courseSlug: LEGACY_COURSE };
    const result = await resolveProgramCourseWithCatalogFallback(getProgramBySlug(PROGRAM)!, {
      enrolledProgramSlug: PROGRAM, courseraCourseId: providerId,
      courseName: 'Untrusted program certificate claim',
    }, {
      curriculumVersion: 'legacy-v1',
      canonicalMappings: { byCourseraCourseId: new Map([[PROVIDER_ID, mapping]]), byCourseraCourseSlug: new Map() },
    });
    expect(result).toEqual({ slug: LEGACY_COURSE, name: COURSE_NAME });
  });

  it('uses the exact provider course for a certificate label, qualified across programs', () => {
    expect(resolveCertificationNameForCourse(completion)).toBe(CERT_NAME);
    expect(resolveCertificationNameForCourse({ ...completion, courseraCourseId: `Course~${PROVIDER_ID}` })).toBe(CERT_NAME);
  });

  it('does not borrow a provider title from another program or remove an unknown course ordinal', () => {
    expect(resolveCertificationNameForCourse({
      programSlug: 'it-support-professional-certificate-ibm', courseSlug: 'unknown-program-course-17',
      courseraCourseId: PROVIDER_ID,
    })).toBe('Unknown Program Course 17');
  });
});

describe('certificate identity survives display-label corrections', () => {
  it.each(['pending', 'approved', 'rejected'])('reuses the exact provenance-bound %s row without issuing another certificate', async (status) => {
    mocks.provenance.mockResolvedValue([{ targetId: 'original-certificate' }]);
    mocks.findUnique.mockResolvedValue({ id: 'original-certificate', status, certName: 'Previous display label' });
    await expect(ensurePendingCertificationForCompletion(completion)).resolves.toEqual({
      created: false, id: 'original-certificate', status, certName: 'Previous display label',
    });
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.provenance).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        action: 'system_certification_pending_from_completion', targetType: 'user_certification',
        AND: expect.arrayContaining([
          { metadata: { path: ['userId'], equals: completion.userId } },
          { metadata: { path: ['programSlug'], equals: PROGRAM } },
          { metadata: { path: ['courseSlug'], equals: LEGACY_COURSE } },
        ]),
      }),
    }));
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'original-certificate', userId: completion.userId },
    }));
  });

  it('retains a corrected row on a later report that has no provider ID', async () => {
    mocks.provenance.mockResolvedValue([{ targetId: 'original-certificate' }]);
    mocks.findUnique.mockResolvedValue({ id: 'original-certificate', status: 'pending', certName: CERT_NAME });
    const result = await ensurePendingCertificationForCompletion({ ...completion, courseraCourseId: null });
    expect(result).toMatchObject({ created: false, id: 'original-certificate', certName: CERT_NAME });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('creates a factual pending certificate for a new completion with no legacy row', async () => {
    const result = await ensurePendingCertificationForCompletion(completion);
    expect(result).toMatchObject({ created: true, certName: CERT_NAME });
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: completion.userId, certName: CERT_NAME, status: 'pending' })],
      skipDuplicates: true,
    }));
  });

  it.each([LEGACY_COURSE, 'unlisted-course'])('creates one certificate when first reports differ only in provider-ID availability: %s', async (courseSlug) => {
    const rows = new Map<string, { id: string; certName: string; status: string }>();
    const provenance: Array<{ targetId: string }> = [];
    mocks.provenance.mockImplementation(async () => [...provenance]);
    mocks.findUnique.mockImplementation(async ({ where }) => where.id
      ? [...rows.values()].find((row) => row.id === where.id) ?? null
      : rows.get(where.userId_certName.certName) ?? null);
    mocks.createMany.mockImplementation(async ({ data }) => {
      if (rows.has(data[0].certName)) return { count: 0 };
      rows.set(data[0].certName, { id: `certificate-${rows.size}`, certName: data[0].certName, status: 'pending' });
      return { count: 1 };
    });
    mocks.audit.mockImplementation(async ({ targetId }) => { provenance.push({ targetId }); });
    // Serial transaction execution models the per-course database lock. The
    // provenance check must happen inside it, and be committed with issuance.
    let queue = Promise.resolve();
    const db = {
      ...tx, $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: (fn: (client: unknown) => Promise<unknown>) => {
        const result = queue.then(() => fn({ ...tx, $executeRaw: vi.fn().mockResolvedValue(1) }));
        queue = result.then(() => undefined);
        return result;
      },
    };
    const results = await Promise.all([
      ensurePendingCertificationForCompletion({ ...completion, courseSlug }, { db: db as never }),
      ensurePendingCertificationForCompletion({ ...completion, courseSlug, courseraCourseId: null }, { db: db as never }),
    ]);
    expect(rows.size).toBe(1);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(provenance).toHaveLength(1);
  });

  it('requires the identity audit to succeed for a new legacy certificate', async () => {
    mocks.audit.mockRejectedValue(new Error('identity audit unavailable'));
    await expect(ensurePendingCertificationForCompletion(completion)).rejects.toThrow('identity audit unavailable');
  });

  it('fails closed when a legacy label exists without exact course provenance', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'unattributed', status: 'approved', certName: 'Cybersecurity Professional Certificate Google' });
    await expect(ensurePendingCertificationForCompletion(completion)).rejects.toThrow(/provenance/i);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('fails closed when multiple certificate IDs claim the same course identity', async () => {
    mocks.provenance.mockResolvedValue([{ targetId: 'one' }, { targetId: 'two' }]);
    await expect(ensurePendingCertificationForCompletion(completion)).rejects.toThrow(/ambiguous/i);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('does not reuse a stale or differently-owned certificate pointer', async () => {
    mocks.provenance.mockResolvedValue([{ targetId: 'stale-or-other-member' }]);
    const result = await ensurePendingCertificationForCompletion(completion);
    expect(result).toMatchObject({ created: true, id: 'new-certificate' });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stale-or-other-member', userId: completion.userId },
    }));
  });
});

describe('coursework resume text is bounded by completion evidence', () => {
  it('cannot promote a course title into an unsupported professional certification', async () => {
    mocks.generate.mockResolvedValue('Secured a Google-certified Professional in Cybersecurity.');
    await expect(generateResumeBullet(COURSE_NAME)).resolves.toBe(`Completed coursework: ${COURSE_NAME}.`);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not expose an unresolved mapped identifier as a qualification', async () => {
    await expect(generateResumeBullet(LEGACY_COURSE)).resolves.toBe('Completed a training course.');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
