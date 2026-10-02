import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const agreements = vi.fn();
  const user = vi.fn();
  const empty = { findMany: async () => [], findUnique: async () => null };
  const prisma = new Proxy({
    $queryRaw: queryRaw,
    enrollmentAgreementSubmission: { findMany: agreements },
    user: { findUnique: user },
  }, {
    get(target, property) {
      return Reflect.get(target, property) ?? empty;
    },
  });
  return { prisma, queryRaw, agreements, user };
});

vi.mock('@/lib/db/prisma', () => ({ prisma: database.prisma }));

import { buildMemberExport } from '@/lib/member/exportData';

describe('member export includes enrollment agreement history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.queryRaw.mockResolvedValue([{ present: true }]);
    database.user.mockResolvedValue({ id: 'member-1', profile: null, userRoles: [], organization: null });
    database.agreements.mockResolvedValue([]);
  });

  it('includes uploaded and reviewed submissions for the export subject', async () => {
    const uploadedAt = new Date('2026-10-01T12:00:00Z');
    database.agreements.mockResolvedValue([
      { id: 'old', uploadedAt, reviewedAt: uploadedAt, isCurrent: false, status: 'verified', reviewNote: null },
      { id: 'current', uploadedAt, reviewedAt: null, isCurrent: true, status: 'pending', reviewNote: null },
    ]);
    const result = await buildMemberExport('member-1');
    expect(result.enrollmentAgreements).toEqual([
      { id: 'old', uploadedAt: uploadedAt.toISOString(), reviewedAt: uploadedAt.toISOString(), isCurrent: false, status: 'verified', reviewNote: null },
      { id: 'current', uploadedAt: uploadedAt.toISOString(), reviewedAt: null, isCurrent: true, status: 'pending', reviewNote: null },
    ]);
    expect(database.agreements).toHaveBeenCalledWith(expect.objectContaining({ where: { subjectMemberId: 'member-1' } }));
  });

  it('preserves export availability before the agreement migration exists', async () => {
    database.queryRaw.mockResolvedValue([{ present: false }]);
    const result = await buildMemberExport('member-1');
    expect(result.member.id).toBe('member-1');
    expect(result.enrollmentAgreements).toEqual([]);
    expect(database.agreements).not.toHaveBeenCalled();
  });

  it('fails the export instead of claiming complete data when agreement reads fail', async () => {
    database.agreements.mockRejectedValue(new Error('database unavailable'));
    await expect(buildMemberExport('member-1')).rejects.toThrow('database unavailable');
  });
});
