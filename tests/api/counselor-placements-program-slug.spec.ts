import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';

const state = vi.hoisted(() => ({
  member: null as {
    enrolledProgram: string | null;
    courseEnrollments: Array<{ programSlug: string; isPrimary: boolean; enrolledAt: Date }>;
  } | null,
  findFirst: vi.fn(),
  sql: vi.fn(),
  insertedProgramSlug: null as string | null,
}));

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'staff-1' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => false, isCounselor: async () => true, isSuperAdmin: async () => false }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: async () => true }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => undefined }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/lib/member/points', () => ({ awardPoints: async () => ({}) }));
vi.mock('@/lib/db/prisma', () => {
  const db = {
    user: { findFirst: state.findFirst },
    $queryRaw: state.sql,
    $executeRaw: async () => 1,
  };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});

import { POST } from '@/app/api/counselor/placements/route';

const PRIMARY = 'it-automation-with-python-google';
const PRIMARY_ALIAS = 'it-automation-with-python-professional-certificate-google';
const enrollment = (programSlug: string, isPrimary = true) => ({
  programSlug,
  isPrimary,
  enrolledAt: new Date('2026-09-01'),
});

function request(body: Record<string, unknown> = {}) {
  return new Request('https://example.test/api/counselor/placements', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'member-1',
      employerName: 'Example Employer',
      jobTitle: 'Support technician',
      startDateVerified: true,
      programSlug: 'client-forged-slug',
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.insertedProgramSlug = null;
  state.member = { enrolledProgram: 'stale-program', courseEnrollments: [enrollment(PRIMARY)] };
  state.findFirst.mockImplementation(async () => state.member);
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    expect(strings.join('?')).toContain('ON CONFLICT (user_id) DO NOTHING');
    state.insertedProgramSlug = values[7] as string | null;
    return [{ id: 'placement-1', user_id: 'member-1', program_slug: values[7] }];
  });
});

describe('counselor placement program attribution', () => {
  it('loads a live member-definition row and ignores a client-supplied program slug', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', deletedAt: null, NOT: MEMBER_ONLY_ROLE_NOT },
      select: expect.objectContaining({
        enrolledProgram: true,
        courseEnrollments: expect.objectContaining({
          take: 1,
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        }),
      }),
    });
    expect(state.insertedProgramSlug).toBe(PRIMARY);
  });

  it.each([
    {
      name: 'primary enrollment over leftover enrolledProgram',
      member: { enrolledProgram: 'stale-program', courseEnrollments: [enrollment(PRIMARY)] },
      expected: PRIMARY,
    },
    {
      name: 'legacy leftover when the member has no enrollment rows',
      member: { enrolledProgram: PRIMARY, courseEnrollments: [] },
      expected: PRIMARY,
    },
    {
      name: 'canonical catalog alias from the selected enrollment',
      member: { enrolledProgram: null, courseEnrollments: [enrollment(PRIMARY_ALIAS)] },
      expected: PRIMARY,
    },
    {
      name: 'most recent enrollment even when it is not marked primary',
      member: { enrolledProgram: null, courseEnrollments: [enrollment(PRIMARY, false)] },
      expected: PRIMARY,
    },
    {
      name: 'non-primary enrollment over leftover enrolledProgram',
      member: { enrolledProgram: 'legacy-track', courseEnrollments: [enrollment(PRIMARY, false)] },
      expected: PRIMARY,
    },
    {
      name: 'unknown catalog key kept as a canonicalized server value',
      member: { enrolledProgram: ' Org-Specific-Track ', courseEnrollments: [] },
      expected: 'org-specific-track',
    },
    {
      name: 'no leftover and no enrollment',
      member: { enrolledProgram: '   ', courseEnrollments: [] },
      expected: null,
    },
  ])('attributes $name', async ({ member, expected }) => {
    state.member = member;
    expect((await POST(request({ programSlug: 'should-never-win' }))).status).toBe(200);
    expect(state.insertedProgramSlug).toBe(expected);
  });

  it('does not write a placement when the member row is missing', async () => {
    state.member = null;
    expect((await POST(request())).status).toBe(404);
    expect(state.sql).not.toHaveBeenCalled();
  });
});
