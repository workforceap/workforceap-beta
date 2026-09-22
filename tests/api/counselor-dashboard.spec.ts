import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'test-user' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
}));

vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string | null, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/db/prisma', () => {
  const counselor = {
    findFirst: vi.fn(),
  };
  const counselorAssignment = {
    findFirst: vi.fn(),
  };
  const counselorNote = {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  const $queryRaw = vi.fn();
  const $queryRawUnsafe = vi.fn();
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), counselor, counselorAssignment, counselorNote, user, $queryRaw, $queryRawUnsafe } };
});

// ─── Imports after mocks ───
import { GET as getInactiveMembers } from '@/app/api/counselor/inactive-members/route';
import { GET as getMemberNotes, POST as postMemberNote } from '@/app/api/counselor/members/[memberId]/notes/route';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { Prisma } from '@prisma/client';
import { memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';

const UUIDS = {
  counselorUser: '550e8400-e29b-41d4-a716-446655440001',
  adminUser: '550e8400-e29b-41d4-a716-446655440002',
  memberUser: '550e8400-e29b-41d4-a716-446655440003',
  counselorId: '550e8400-e29b-41d4-a716-446655440004',
  noteId: '550e8400-e29b-41d4-a716-446655440005',
  orgId: '550e8400-e29b-41d4-a716-446655440006',
};

// ─── Helpers ───
function makeRequest(url: string, opts?: RequestInit): any {
  return new Request(url, { ...opts, headers: { 'content-type': 'application/json', ...(opts?.headers || {}) } });
}

describe('GET /api/counselor/inactive-members — counselor dashboard member list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.counselor.findFirst).mockReset();
    vi.mocked(prisma.$queryRaw).mockReset();
  });

  it('scopes the inactive-member queue to the one member definition', async () => {
    // The queue used to filter on a hand-written `p.role = 'member'`, so a
    // revert leaves this counselor surface on the old definition while the
    // counts beside it move (WAP-182 item 3).
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({ id: UUIDS.counselorId, userId: UUIDS.counselorUser } as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members?days=7'));
    expect(res.status).toBe(200);

    expect(vi.mocked(prisma.$queryRaw)).toHaveBeenCalledTimes(1);
    // The route passes a prebuilt `Prisma.Sql`, not a tagged template.
    const query = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as Prisma.Sql;
    expect(query.sql).toContain(memberOnlyRoleSql('u').sql);
    expect(query.sql).not.toContain("p.role = 'member'");
  });

  it('returns assigned members for a counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);

    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: UUIDS.counselorId,
      userId: UUIDS.counselorUser,
    } as any);

    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);

    const mockMembers = [
      {
        id: UUIDS.memberUser,
        email: 'member@example.com',
        joined_at: new Date('2026-01-01'),
        last_active_at: new Date('2026-01-02'),
        profile_phone: '512-555-1234',
      },
    ];
    vi.mocked(prisma.$queryRaw).mockResolvedValue(mockMembers as any);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members?days=7'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].email).toBe('member@example.com');
    expect(body.days).toBe(7);
    expect(body.count).toBe(1);
  });

  it('includes member progress summaries (days inactive calculation)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);

    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: UUIDS.counselorId,
      userId: UUIDS.counselorUser,
    } as any);

    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);

    const mockMembers = [
      {
        id: UUIDS.memberUser,
        email: 'member@example.com',
        joined_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        last_active_at: null,
        profile_phone: null,
      },
    ];
    vi.mocked(prisma.$queryRaw).mockResolvedValue(mockMembers as any);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members?days=7'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members[0].daysInactive).toBeGreaterThanOrEqual(10);
    expect(body.members[0].lastActiveAt).toBeNull();
  });

  it('filters by days parameter (14, 30)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);

    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: UUIDS.counselorId,
      userId: UUIDS.counselorUser,
    } as any);

    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const res14 = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members?days=14'));
    const body14 = await res14.json();
    expect(body14.days).toBe(14);

    const res30 = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members?days=30'));
    const body30 = await res30.json();
    expect(body30.days).toBe(30);
  });

  it('returns 403 for non-counselor / non-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.memberUser, email: 'member@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue(null);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when counselor record is not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue(null);

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({ id: UUIDS.counselorId } as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('DB connection lost'));

    const res = await getInactiveMembers(makeRequest('http://localhost:3000/api/counselor/inactive-members'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

describe('GET /api/counselor/members/[memberId]/notes — member details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.counselorNote.findMany).mockReset();
  });

  it('returns member notes with author details', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const mockNotes = [
      {
        id: UUIDS.noteId,
        memberId: UUIDS.memberUser,
        authorId: UUIDS.counselorUser,
        content: 'Member is progressing well in the ComTIA A+ program.',
        createdAt: new Date('2026-05-01'),
        author: { fullName: 'Counselor Jane', email: 'counselor@wap.org' },
      },
    ];
    vi.mocked(prisma.counselorNote.findMany).mockResolvedValue(mockNotes as any);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].content).toBe('Member is progressing well in the ComTIA A+ program.');
    expect(body[0].author.fullName).toBe('Counselor Jane');
  });

  it('includes placement history via note content when present', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const mockNotes = [
      {
        id: UUIDS.noteId,
        memberId: UUIDS.memberUser,
        authorId: UUIDS.counselorUser,
        content: 'Placed at TechCorp as Junior IT Support — $45k starting salary.',
        createdAt: new Date('2026-04-15'),
        author: { fullName: 'Counselor Jane', email: 'counselor@wap.org' },
      },
    ];
    vi.mocked(prisma.counselorNote.findMany).mockResolvedValue(mockNotes as any);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].content).toContain('Placed at TechCorp');
  });

  it('includes assessment score notes when present', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const mockNotes = [
      {
        id: UUIDS.noteId,
        memberId: UUIDS.memberUser,
        authorId: UUIDS.counselorUser,
        content: 'Initial assessment score: 78%. Recommended Digital Literacy track.',
        createdAt: new Date('2026-03-10'),
        author: { fullName: 'Counselor Jane', email: 'counselor@wap.org' },
      },
    ];
    vi.mocked(prisma.counselorNote.findMany).mockResolvedValue(mockNotes as any);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].content).toContain('78%');
  });

  it('returns 403 for non-assigned member (staff access denied)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 404 when member does not exist', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.counselorNote.findMany).mockResolvedValue([] as any);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/nonexistent/notes'),
      { params: Promise.resolve({ memberId: 'nonexistent' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 for non-counselor / non-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.memberUser, email: 'member@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);

    const res = await getMemberNotes(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes'),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });
});

describe('POST /api/counselor/members/[memberId]/notes — counselor note creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.counselorNote.create).mockReset();
    vi.mocked(prisma.user.findFirst).mockReset();
  });

  it('creates a counselor note linked to member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: UUIDS.memberUser } as any);

    const createdNote = {
      id: UUIDS.noteId,
      memberId: UUIDS.memberUser,
      authorId: UUIDS.counselorUser,
      content: 'Follow-up needed for resume revision.',
      createdAt: new Date('2026-05-10'),
      author: { fullName: 'Counselor Jane', email: 'counselor@wap.org' },
    };
    vi.mocked(prisma.counselorNote.create).mockResolvedValue(createdNote as any);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Follow-up needed for resume revision.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.content).toBe('Follow-up needed for resume revision.');
    expect(body.memberId).toBe(UUIDS.memberUser);
    expect(body.authorId).toBe(UUIDS.counselorUser);
  });

  it('links note to correct member via memberId param', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: UUIDS.memberUser } as any);

    const createdNote = {
      id: UUIDS.noteId,
      memberId: UUIDS.memberUser,
      authorId: UUIDS.counselorUser,
      content: 'Scheduled mock interview for next Tuesday.',
      createdAt: new Date('2026-05-10'),
      author: { fullName: 'Counselor Jane', email: 'counselor@wap.org' },
    };
    vi.mocked(prisma.counselorNote.create).mockResolvedValue(createdNote as any);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Scheduled mock interview for next Tuesday.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.memberId).toBe(UUIDS.memberUser);

    expect(prisma.counselorNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: UUIDS.memberUser,
          authorId: UUIDS.counselorUser,
          content: 'Scheduled mock interview for next Tuesday.',
        }),
      })
    );
  });

  it('returns 401 for non-counselor / non-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.memberUser, email: 'member@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'This should not work.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(prisma.counselorNote.create).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Unauthorized note.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for missing note content', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Note content required');
    expect(prisma.counselorNote.create).not.toHaveBeenCalled();
  });

  it('returns 400 for empty note content', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Note content required');
  });

  it('returns 403 for non-assigned member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Should not create.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(prisma.counselorNote.create).not.toHaveBeenCalled();
  });

  it('returns 404 when member does not exist in tenant', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);

    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Member does not exist.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Member not found');
    expect(prisma.counselorNote.create).not.toHaveBeenCalled();
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.counselorUser, email: 'counselor@wap.org' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.orgId);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: UUIDS.memberUser } as any);
    vi.mocked(prisma.counselorNote.create).mockRejectedValue(new Error('DB write failed'));

    const res = await postMemberNote(
      makeRequest('http://localhost:3000/api/counselor/members/' + UUIDS.memberUser + '/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'This will fail.' }),
      }),
      { params: Promise.resolve({ memberId: UUIDS.memberUser }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
