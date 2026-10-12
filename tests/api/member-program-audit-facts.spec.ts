import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  canBypassMemberAssessment: vi.fn(),
  findUser: vi.fn(),
  findPack: vi.fn(),
  findStaffProgress: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ canBypassMemberAssessment: mocks.canBypassMemberAssessment }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => {
  const db = {
    user: { findUnique: mocks.findUser },
    employerScreeningPack: { findFirst: mocks.findPack },
    courseProgress: { findFirst: mocks.findStaffProgress },
  };
  return { prisma: { ...db, $transaction: (run: (tx: typeof db) => unknown) => run(db) } };
});
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ auditRequestMeta: vi.fn(), logAuditEvent: vi.fn() }));

import { GET } from '@/app/api/member/profile/route';
import { READ_ONLY_PORTAL_AUDIT_HEADER, READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER } from '@/lib/audit/readOnlyPortalAudit';
import { loadProgramRouteAuditFacts } from '@/lib/member/programRouteAuditFacts';

const memberId = 'synthetic-member';
const primarySlug = 'comptia-a-plus';
const legacySlug = 'aws-cloud-practitioner';
const profile = {
  id: memberId,
  email: 'synthetic@example.test',
  fullName: 'Synthetic member',
  phone: null,
  profile: null,
};
const enrollment = (programSlug = primarySlug, isPrimary = true, enrolledAt = '2026-09-01') => ({
  id: `enrollment-${programSlug}`,
  programSlug,
  curriculumVersion: 'legacy-v1',
  isPrimary,
  enrolledAt: new Date(enrolledAt),
});
type ProgramMember = {
  enrolledProgram: string | null;
  courseEnrollments: ReturnType<typeof enrollment>[];
  courseProgress: { programSlug: string }[];
};

function setMember(member: ProgramMember | null) {
  mocks.findUser.mockImplementation(async (query: {
    include?: unknown;
    select?: { courseEnrollments?: { take?: number } };
  }) => {
    if (query.include) return member ? profile : null;
    if (!member) return null;
    return {
      ...member,
      courseEnrollments: member.courseEnrollments.slice(0, query.select?.courseEnrollments?.take),
    };
  });
}

type RequestOptions = { audit?: string; capability?: boolean; headers?: Record<string, string> };

function request(options: RequestOptions = {}) {
  const url = new URL('https://workforceap.example.test/api/member/profile');
  if (options.audit !== '') url.searchParams.set('portalAudit', options.audit ?? 'program-subpages');
  return new Request(url, {
    headers: {
      ...(options.capability === false ? {} : { [READ_ONLY_PORTAL_AUDIT_HEADER]: '1' }),
      ...options.headers,
    },
  });
}

async function facts() {
  const response = await GET(request());
  expect(response.status).toBe(200);
  return (await response.json()).programRouteFacts;
}

describe('member program prerequisite facts on the existing profile endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ id: memberId });
    mocks.canBypassMemberAssessment.mockResolvedValue(false);
    mocks.findPack.mockResolvedValue(null);
    setMember({ enrolledProgram: null, courseEnrollments: [], courseProgress: [] });
  });

  it('reports the two unavailable program routes without looking for a pack', async () => {
    expect(await facts()).toEqual({
      version: 1,
      start: { hasResolvedProgram: false },
      employerScreening: { hasResolvedProgram: false, pack: 'not_applicable' },
    });
    expect(mocks.findPack).not.toHaveBeenCalled();
    expect(mocks.findStaffProgress).not.toHaveBeenCalled();
  });

  it('uses the primary enrollment ahead of a conflicting legacy field for both routes', async () => {
    setMember({
      enrolledProgram: legacySlug,
      courseEnrollments: [enrollment(), enrollment(legacySlug, false, '2026-10-01')],
      courseProgress: [],
    });
    mocks.findPack.mockResolvedValue({ questionsJson: [{ id: 'one', prompt: 'Ready?', type: 'yes_no' }] });
    expect(await facts()).toEqual({
      version: 1,
      start: { hasResolvedProgram: true },
      employerScreening: { hasResolvedProgram: true, pack: 'available' },
    });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: memberId },
      select: expect.objectContaining({
        courseEnrollments: {
          orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
          take: 1,
          select: { programSlug: true, curriculumVersion: true },
        },
      }),
    }));
    expect(mocks.findPack).toHaveBeenCalledWith({
      where: { programSlug: primarySlug, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('retains the screening first-enrollment rule when the start resolver uses legacy enrollment', async () => {
    setMember({
      enrolledProgram: legacySlug,
      courseEnrollments: [enrollment(primarySlug, false)],
      courseProgress: [],
    });
    expect(await facts()).toMatchObject({
      start: { hasResolvedProgram: true },
      employerScreening: { hasResolvedProgram: true, pack: 'absent' },
    });
    expect(mocks.findPack).toHaveBeenCalledWith(expect.objectContaining({
      where: { programSlug: primarySlug, isActive: true },
    }));
  });

  it('uses the legacy program for screening only when there is no enrollment row', async () => {
    setMember({ enrolledProgram: legacySlug, courseEnrollments: [], courseProgress: [] });
    expect(await facts()).toMatchObject({
      start: { hasResolvedProgram: true },
      employerScreening: { hasResolvedProgram: true, pack: 'absent' },
    });
    expect(mocks.findPack).toHaveBeenCalledWith(expect.objectContaining({
      where: { programSlug: legacySlug, isActive: true },
    }));
  });

  it('keeps a non-primary enrollment screening-only when no legacy program is assigned', async () => {
    setMember({ enrolledProgram: null, courseEnrollments: [enrollment(primarySlug, false)], courseProgress: [] });
    expect(await facts()).toEqual({
      version: 1,
      start: { hasResolvedProgram: false },
      employerScreening: { hasResolvedProgram: true, pack: 'absent' },
    });
  });

  it('recognizes the real progress-only start fallback without inventing a screening enrollment', async () => {
    setMember({
      enrolledProgram: null,
      courseEnrollments: [],
      courseProgress: [{ programSlug: primarySlug }],
    });
    expect(await facts()).toEqual({
      version: 1,
      start: { hasResolvedProgram: true },
      employerScreening: { hasResolvedProgram: false, pack: 'not_applicable' },
    });
    expect(mocks.findPack).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'absent'],
    [{ questionsJson: null }, 'invalid'],
    [{ questionsJson: { question: 'not an array' } }, 'invalid'],
    [{ questionsJson: [] }, 'available'],
    [{ questionsJson: [{ id: 'one', prompt: 'Ready?', type: 'yes_no' }] }, 'available'],
  ])('classifies only the latest active exact-program pack: %j → %s', async (pack, expected) => {
    setMember({ enrolledProgram: null, courseEnrollments: [enrollment()], courseProgress: [] });
    mocks.findPack.mockResolvedValue(pack);
    expect((await facts()).employerScreening).toEqual({ hasResolvedProgram: true, pack: expected });
  });

  it.each<RequestOptions>([
    { audit: '' },
    { audit: 'other-audit' },
    { capability: false },
    { headers: { [READ_ONLY_PORTAL_AUDIT_HEADER]: 'true' } },
    { capability: false, headers: { [READ_ONLY_PORTAL_AUDIT_TOKEN_HEADER]: 'unvalidated-input' } },
    { capability: false, headers: { cookie: 'wap-read-only-portal-audit-token=unvalidated-input' } },
  ])('preserves the ordinary response unless both opt-in and validated capability are present: %j', async (options) => {
    const response = await GET(request(options));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: profile.id, email: profile.email, fullName: profile.fullName, phone: null },
      profile: null,
    });
    expect(mocks.findUser).toHaveBeenCalledTimes(1);
    expect(mocks.findPack).not.toHaveBeenCalled();
    expect(mocks.canBypassMemberAssessment).not.toHaveBeenCalled();
  });

  it('keeps unauthenticated requests unauthorized even with the audit opt-in', async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('keeps a missing member as 404 without returning audit facts', async () => {
    setMember(null);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'User not found' });
    expect(mocks.findUser).toHaveBeenCalledTimes(1);
    expect(mocks.findPack).not.toHaveBeenCalled();
  });

  it('handles a missing member in the shared resolvers without fabricating a program', async () => {
    setMember(null);
    expect(await loadProgramRouteAuditFacts(memberId)).toEqual({
      version: 1,
      start: { hasResolvedProgram: false },
      employerScreening: { hasResolvedProgram: false, pack: 'not_applicable' },
    });
  });

  it.each(['program', 'pack'])('fails closed when the %s evidence read fails', async (failure) => {
    setMember({ enrolledProgram: null, courseEnrollments: [enrollment()], courseProgress: [] });
    if (failure === 'program') {
      mocks.findUser.mockImplementation(async (query: { include?: unknown }) => {
        if (query.include) return profile;
        throw new Error('Program evidence unavailable');
      });
    } else {
      mocks.findPack.mockRejectedValue(new Error('Pack evidence unavailable'));
    }
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
