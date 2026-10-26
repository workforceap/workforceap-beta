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
