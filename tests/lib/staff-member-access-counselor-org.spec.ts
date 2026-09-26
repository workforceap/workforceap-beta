/**
 * assertStaffCanAccessMemberRecord (used by the counselor student page, which
 * now also lists billing packet summaries): an assignment only grants access
 * while the counselor is active, not deleted and in the member's CURRENT
 * organization. A counselor who transferred orgs, or was deleted, is denied;
 * a same-org counselor is unaffected. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ORG = 'aaaaaaaa-0000-4000-8000-000000000009';
const MEMBER = 'b0000000-0000-4000-8000-000000000002';
const COUNSELOR_USER = 'c0000000-0000-4000-8000-000000000003';

const state = vi.hoisted(() => ({
  counselor: { userId: '', organizationId: '', deletedAt: null as Date | null, active: true },
  assignmentActive: true,
  memberOrg: '',
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => false),
  isAdminInOrg: vi.fn(async () => false),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ organizationId: state.memberOrg })) },
    counselorAssignment: {
      // Evaluates the WHERE the way Postgres would for this one assignment.
      findFirst: vi.fn(async ({ where }: { where: { memberId: string; active: boolean; counselor: { userId: string; active: boolean; user?: { organizationId?: string; deletedAt?: null } } } }) => {
        const c = state.counselor;
        const u = where.counselor.user;
        const ok =
          where.memberId === MEMBER
          && state.assignmentActive === where.active
          && c.userId === where.counselor.userId
          && c.active === where.counselor.active
          && (u?.organizationId === undefined || u.organizationId === c.organizationId)
          && (!u || !('deletedAt' in u) || c.deletedAt === null);
        return ok ? { id: 'assignment-1' } : null;
      }),
    },
  },
}));

import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

beforeEach(() => {
  state.counselor = { userId: COUNSELOR_USER, organizationId: ORG, deletedAt: null, active: true };
  state.assignmentActive = true;
  state.memberOrg = ORG;
});

describe('assertStaffCanAccessMemberRecord: counselor org at read time', () => {
  it('a same-org, active counselor with an active assignment keeps access', async () => {
    expect(await assertStaffCanAccessMemberRecord(COUNSELOR_USER, MEMBER)).toBe(true);
  });

  it('a counselor who transferred to another org is denied, even though the assignment is still active', async () => {
    state.counselor.organizationId = OTHER_ORG;
    expect(await assertStaffCanAccessMemberRecord(COUNSELOR_USER, MEMBER)).toBe(false);
  });

  it('a deleted counselor is denied', async () => {
    state.counselor.deletedAt = new Date();
    expect(await assertStaffCanAccessMemberRecord(COUNSELOR_USER, MEMBER)).toBe(false);
  });

  it('an inactive counselor or inactive assignment is denied (unchanged)', async () => {
    state.counselor.active = false;
    expect(await assertStaffCanAccessMemberRecord(COUNSELOR_USER, MEMBER)).toBe(false);
    state.counselor.active = true;
    state.assignmentActive = false;
    expect(await assertStaffCanAccessMemberRecord(COUNSELOR_USER, MEMBER)).toBe(false);
  });
});
