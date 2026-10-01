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
  createMany: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  userCertification: {
    findUnique: (...args: unknown[]) => mocks.findUnique(...args),
    createMany: (...args: unknown[]) => mocks.createMany(...args),
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
  humaniseCourseSlug,
  resolveCertificationNameForCourse,
} from '@/lib/certifications/pendingFromCompletion';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { PROGRAMS, getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

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
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: COURSE })).toBe(CATALOG_NAME);
  });

  it('a name unique to one program stays unqualified', () => {
    const carriers = PROGRAMS.filter((p) => p.courses.some((c) => c.name.trim() === CATALOG_NAME));
    expect(carriers.map((p) => p.slug)).toEqual([PROGRAM]);
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: COURSE })).toBe(CATALOG_NAME);
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: COURSE })).not.toContain(' — ');
  });

  it('a name either catalog carries in more than one program is qualified with the program title, per program', () => {
    // Every duplicated name across both catalogs, not one hand-picked example.
    const byName = new Map<string, Array<{ programSlug: string; courseSlug: string }>>();
    const add = (programSlug: string, courseSlug: string, name: string) => {
      const list = byName.get(name.trim()) ?? [];
      if (!list.some((hit) => hit.programSlug === programSlug && hit.courseSlug === courseSlug)) list.push({ programSlug, courseSlug });
      byName.set(name.trim(), list);
    };
    for (const program of PROGRAMS) for (const course of program.courses) add(program.slug, course.slug, course.name);
    for (const [slug, discovered] of Object.entries(DISCOVERED_COURSERA_PROGRAMS)) {
      for (const course of discovered.courses) add(canonicalizeProgramSlug(slug), course.slug, course.name);
    }
    // A program is its display title: the discovered catalog lists CompTIA
    // Network+ / Security+ under a second slug each, and that is one program.
    const titleOf = (slug: string) => getProgramDisplayTitle(getProgramBySlug(slug) ?? slug);
    const titlesOf = (hits: Array<{ programSlug: string }>) => new Set(hits.map((h) => titleOf(h.programSlug)));
    const shared = [...byName.entries()].filter(([, hits]) => titlesOf(hits).size > 1);
    const single = [...byName.entries()].filter(([, hits]) => titlesOf(hits).size === 1);
    expect(shared.map(([name]) => name)).toContain('Lab, Project, and Test Preparation');
    // Discovered-only collision (only one of the two programs lists it in PROGRAMS): must be qualified too.
    expect(shared.map(([name]) => name)).toContain('Data Analysis with Python');
    const python = shared.find(([name]) => name === 'Data Analysis with Python')![1];
    expect(titlesOf(python).size).toBe(2);
    expect(PROGRAMS.filter((p) => p.courses.some((c) => c.name === 'Data Analysis with Python'))).toHaveLength(1);
    // Two discovered slugs, one program: not a collision, so the name stays plain.
    const networkSecurity = single.find(([name]) => name === 'Network Security');
    expect(networkSecurity).toBeDefined();
    expect(new Set(networkSecurity![1].map((h) => h.programSlug)).size).toBeGreaterThan(1);
    for (const hit of networkSecurity![1]) expect(resolveCertificationNameForCourse(hit)).toBe('Network Security');

    // Exact spellings for the two named cases.
    for (const hit of shared.find(([name]) => name === 'Lab, Project, and Test Preparation')![1]) {
      expect(resolveCertificationNameForCourse(hit)).toBe(`Lab, Project, and Test Preparation — ${titleOf(hit.programSlug)}`);
    }
    for (const hit of python) {
      expect(resolveCertificationNameForCourse(hit)).toBe(`Data Analysis with Python — ${titleOf(hit.programSlug)}`);
    }

    // The property that matters for the (user, certName) unique key: no
    // resolved name is ever produced for two different programs. The base
    // spelling follows the resolver's precedence (a canonical PROGRAMS name
    // wins over the discovered one for the same course slug, e.g. the
    // software-developer "Introduction to Artificial Intelligence" vs the
    // discovered "(AI)" spelling), which is why this is checked on the
    // resolved names across both catalogs rather than per raw name.
    const programsByResolvedName = new Map<string, Set<string>>();
    for (const hits of byName.values()) {
      for (const hit of hits) {
        const resolved = resolveCertificationNameForCourse(hit);
        const titles = programsByResolvedName.get(resolved) ?? new Set<string>();
        titles.add(titleOf(hit.programSlug));
        programsByResolvedName.set(resolved, titles);
      }
    }
    for (const [resolved, titles] of programsByResolvedName) {
      expect(titles.size, resolved).toBe(1);
    }
    // And qualification happens only where needed: every shared name that
    // the resolver actually emits carries a qualifier.
    for (const [name, hits] of shared) {
      for (const hit of hits) {
        const resolved = resolveCertificationNameForCourse(hit);
        if (resolved.startsWith(`${name} — `) || !resolved.startsWith(name)) continue;
        expect(resolved, `${hit.programSlug}/${hit.courseSlug}`).toBe(`${name} — ${titleOf(hit.programSlug)}`);
      }
    }
  });

  it('a multi-program member completing the same-named course twice gets two rows, not a silent skip', async () => {
    const lab = PROGRAMS.flatMap((p) => p.courses.filter((c) => c.name === 'Lab, Project, and Test Preparation').map((c) => ({ programSlug: p.slug, courseSlug: c.slug }))).slice(0, 2);
    expect(lab).toHaveLength(2);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockImplementation(async ({ where }: { where: { userId_certName: { certName: string } } }) => ({ id: `cert-${where.userId_certName.certName}`, status: 'pending' }));

    const first = await ensurePendingCertificationForCompletion({ ...completion, ...lab[0] });
    const second = await ensurePendingCertificationForCompletion({ ...completion, ...lab[1] });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.certName).not.toBe(second.certName);
    expect(first.id).not.toBe(second.id);
    expect(mocks.createMany).toHaveBeenCalledTimes(2);
  });

  it('falls back to a humanised slug for a course neither catalog knows, never to what a caller passed', () => {
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: 'cloud-security-basics' }))
      .toBe('Cloud Security Basics');
    // The resolver takes no display name: the live hooks and the backfill cannot spell one course two ways.
    expect(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: 'cloud-security-basics', courseName: 'Provider Title' } as never))
      .toBe('Cloud Security Basics');
    expect(humaniseCourseSlug('some-program-slug-course-17')).toBe('Some Program Slug');
    expect(humaniseCourseSlug('---')).toBe('---');
  });
});

describe('ensurePendingCertificationForCompletion', () => {
  it('creates a pending certificate dated at the completion when the member has none', async () => {
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: true, id: 'cert-1', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    // Insert first, ON CONFLICT DO NOTHING, then read: no unique violation can
    // ever reach a caller's transaction.
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    const [data] = mocks.createMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'user-1', certName: CATALOG_NAME, status: 'pending', earnedAt: completion.completedAt });
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('reviewedAt');
    expect(data).not.toHaveProperty('proofUrl');
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_certName: { userId: 'user-1', certName: CATALOG_NAME } },
    }));
    expect(mocks.createMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);

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
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });
    const before = Date.now();

    await ensurePendingCertificationForCompletion({ ...completion, completedAt: new Date('not a date') });

    const earnedAt = mocks.createMany.mock.calls[0][0].data[0].earnedAt as Date;
    expect(earnedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('is a no-op on a repeat report: the insert skips the duplicate, no audit entry', async () => {
    mocks.createMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: false, id: 'cert-1', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('never downgrades a certificate staff already approved (or rejected)', async () => {
    for (const status of ['approved', 'rejected'] as const) {
      vi.clearAllMocks();
      mocks.createMany.mockResolvedValue({ count: 0 });
      mocks.findUnique.mockResolvedValue({ id: `cert-${status}`, status });

      const result = await ensurePendingCertificationForCompletion(completion);

      expect(result.created).toBe(false);
      expect(result.status).toBe(status);
      expect(mocks.auditLog).not.toHaveBeenCalled();
      // The transaction client exposes no update/upsert/delete, so any write
      // other than the conflict-skipping insert would have thrown above.
      expect(Object.keys(tx.userCertification)).toEqual(['findUnique', 'createMany']);
    }
  });

  it('respects a certificate the member typed in themselves under the same name', async () => {
    mocks.createMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ id: 'member-added', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion({ ...completion, source: 'coursera-progress-merge' });

    expect(result).toMatchObject({ created: false, id: 'member-added' });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('a lost race is the other writer owning the row: no error is ever raised for a duplicate', async () => {
    mocks.createMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-raced', status: 'pending' });

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result).toEqual({ created: false, id: 'cert-raced', status: 'pending', certName: CATALOG_NAME });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('rethrows any other database error', async () => {
    mocks.createMany.mockRejectedValue(new Error('connection lost'));

    await expect(ensurePendingCertificationForCompletion(completion)).rejects.toThrow('connection lost');
  });

  it('keeps the created certificate when only the provenance audit write fails', async () => {
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });
    mocks.auditLog.mockRejectedValue(new Error('audit down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ensurePendingCertificationForCompletion(completion);

    expect(result.created).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('runs inside a transaction client a writer hands in, with no transaction of its own', async () => {
    const writerTx = {
      userCertification: {
        createMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ id: 'cert-in-tx', status: 'pending' })),
      },
      user: {},
      auditLog: {},
    };

    const result = await ensurePendingCertificationForCompletion(
      { ...completion, source: 'coursera-progress-merge' },
      { db: writerTx as never },
    );

    expect(result).toMatchObject({ created: true, id: 'cert-in-tx' });
    expect(writerTx.userCertification.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    // The provenance row is written through the same transaction client.
    expect(mocks.auditLog.mock.calls[0][1]).toBe(writerTx);
  });

  it('uses the client a script passes in instead of the shared one', async () => {
    const scriptTx = {
      userCertification: {
        createMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ id: 'cert-script', status: 'pending' })),
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
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: 'cert-1', status: 'pending' });

    await expect(ensurePendingCertificationForCompletionSafely(completion)).resolves.toMatchObject({ created: true, id: 'cert-1' });
  });
});
