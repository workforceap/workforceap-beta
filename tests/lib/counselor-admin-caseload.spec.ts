import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '../helpers/prismaWhereMatches';
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findMany: db.findMany } } }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
import { resolveAdminEnrolledMemberIds } from '@/lib/counselor/adminMemberScope';

const enrollment = (programSlug = 'it-support', isPrimary = true) => ({ programSlug, isPrimary,
  organizationId: 'org-1', curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-09-01') });
const member = (id: string, enrolledProgram: string | null, courseEnrollments: ReturnType<typeof enrollment>[]) => ({
  id, enrolledProgram, courseEnrollments, organizationId: 'org-1', deletedAt: null,
  email: `${id}@mail.invalid`, profile: { role: 'member' }, userRoles: [],
});

beforeEach(() => vi.clearAllMocks());
describe('admin preview confirmed caseload', () => {
  it('admits primary and real legacy assignments while retaining scope and excluding ambiguous history and applicants', async () => {
    const rows = [member('primary', null, [enrollment()]), member('legacy', 'it-support', []),
      member('matched', 'comptia-a-plus', [enrollment('comptia-a-professional-certificate', false)]),
      member('stale', 'it-support', [enrollment('other-program', false)]), member('unassigned', null, []),
      member('blank-legacy', '', []),
      member('secondary', null, [enrollment('it-support', false)]),
      { ...member('foreign', null, [enrollment()]), organizationId: 'org-2' },
      { ...member('deleted', 'it-support', []), deletedAt: new Date() },
      { ...member('staff', 'it-support', []), profile: { role: 'admin' } }];
    db.findMany.mockImplementation(async ({ where, take }: { where: unknown; take: number }) => rows.filter((row) => matchesWhere(row, where)).slice(0, take));
    expect(await resolveAdminEnrolledMemberIds('admin-1', 200)).toEqual(['primary', 'legacy', 'matched']);
    const args = db.findMany.mock.calls[0][0];
    expect(args.take).toBe(200);
    expect(args.select.courseEnrollments.where).toEqual({ organizationId: 'org-1' });
  });

  it('retains the requested bounded candidate scan', async () => {
    db.findMany.mockResolvedValue([]);
    await resolveAdminEnrolledMemberIds('admin-1', 7);
    expect(db.findMany.mock.calls[0][0].take).toBe(7);
  });
});
