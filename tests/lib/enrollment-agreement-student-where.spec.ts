// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(), createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));
vi.mock('@/lib/enrollmentAgreements/operationLock', () => ({ assertEnrollmentAgreementNotErasing: vi.fn() }));

import { agreementStudentWhere } from '@/lib/enrollmentAgreements/access';
import { admittedIds, matchesWhere, MEMBER_DEFINITION_ROSTER } from '@/tests/helpers/prismaWhereMatches';

const ORG = 'org-agreements';
const where = agreementStudentWhere(ORG);
const student = {
  ...MEMBER_DEFINITION_ROSTER.backfilledMember,
  organizationId: ORG,
};

describe('agreementStudentWhere admits students, not staff with a baseline member row', () => {
  it('admits profile-role members and excludes every staff or roleless roster row', () => {
    expect(admittedIds(where, { organizationId: ORG })).toEqual(['backfilled', 'profile-only']);
  });

  it('refuses counselors and admins even when they also hold the baseline member role', () => {
    expect(matchesWhere({ ...MEMBER_DEFINITION_ROSTER.counselorWithBaselineRow, organizationId: ORG }, where)).toBe(false);
    expect(matchesWhere({ ...MEMBER_DEFINITION_ROSTER.adminWithBaselineRow, organizationId: ORG }, where)).toBe(false);
    expect(matchesWhere({
      ...student,
      userRoles: [...student.userRoles, { role: { name: 'counselor' } }],
    }, where)).toBe(false);
  });

  it('stays inside the actor organization and ignores deleted accounts', () => {
    expect(matchesWhere(student, where)).toBe(true);
    expect(matchesWhere({ ...student, organizationId: 'other-org' }, where)).toBe(false);
    expect(matchesWhere({ ...student, deletedAt: new Date('2026-10-01T00:00:00Z') }, where)).toBe(false);
  });
});
