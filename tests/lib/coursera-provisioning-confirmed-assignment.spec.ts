import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({ raw: vi.fn(), members: vi.fn(), courses: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: h.raw, user: { findMany: h.members },
  courseProgress: { groupBy: h.courses }, auditLog: { groupBy: h.audit },
} }));

import { loadCourseraProvisioningQueue } from '@/lib/admin/courseraProvisioningQueue';
import { confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';

const now = new Date('2026-10-15T12:00:00Z');
const program = 'comptia-a-professional-certificate';
const enrollment = { programSlug: program, curriculumVersion: 'legacy-v1', isPrimary: true, enrolledAt: now };
const member = (id: string, enrolledProgram: string | null, courseEnrollments: Array<typeof enrollment>) => ({
  id, fullName: `Synthetic ${id}`, email: `${id}@example.invalid`, enrolledProgram, courseEnrollments,
  coursesCompleted: [], courseraEnrollmentApproved: false, courseraEnrollmentApprovedAt: null,
  lastLoginAt: null, memberProgramProgress: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  h.courses.mockResolvedValue([]); h.audit.mockResolvedValue([]); h.members.mockResolvedValue([]);
  h.raw.mockImplementation(async (first: Prisma.Sql | TemplateStringsArray) => {
    const sql = 'sql' in first ? first.sql : first.join('?');
    return sql.includes('current_assignments') ? [{ userId: 'primary' }, { userId: 'alias' }, { userId: 'changed' }] : [];
  });
});

describe('Coursera provisioning confirmed assignment population', () => {
  it('filters the exact member/tenant population before the 2000 cap and never promotes a stale pointer after hydration', async () => {
    h.members.mockResolvedValue([
      member('primary', null, [enrollment]),
      member('alias', 'comptia-a-plus', [{ ...enrollment, isPrimary: false }]),
      member('changed', 'old-other-program', [{ ...enrollment, isPrimary: false }]),
    ]);
    const result = await loadCourseraProvisioningQueue('org-1', now);
    expect(result.rows.map((row) => [row.memberId, row.programSlug])).toEqual([['primary', program], ['alias', program]]);
    expect(result.summary.total).toBe(2);
    expect(result.programs).toHaveLength(1);
    const query = h.raw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain(confirmedCurrentProgramAssignmentsSql().sql);
    expect(query.sql).toContain(memberOnlySqlJoin().sql);
    expect(query.sql).toContain('u.organization_id = ? AND u.deleted_at IS NULL');
    expect(query.sql.trim()).toMatch(/ORDER BY u.full_name ASC, u.id ASC LIMIT 2000$/);
    expect(query.values).toContain('org-1');
    expect(h.members).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['primary', 'alias', 'changed'] }, organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    }));
    expect(h.courses.mock.calls[0][0].where.userId.in).toEqual(['primary', 'alias']);
  });

  it('returns an empty truthful summary without loading provider signals when no assignment qualifies', async () => {
    h.raw.mockResolvedValue([]);
    const result = await loadCourseraProvisioningQueue('org-1', now);
    expect(result.rows).toEqual([]); expect(result.summary.total).toBe(0);
    expect(h.members).not.toHaveBeenCalled(); expect(h.courses).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled(); expect(h.raw).toHaveBeenCalledTimes(1);
  });
});
