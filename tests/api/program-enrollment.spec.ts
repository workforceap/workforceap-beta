import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    after: vi.fn(),
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const user = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const courseEnrollment = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  };
  const courseProgress = {
    findMany: vi.fn(),
  };
  const $transaction = vi.fn(async (arg: any) => {
    const { prisma } = await import('@/lib/db/prisma');
    return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
  });
  const $executeRaw = vi.fn(async () => 0);
  return { prisma: { user, courseEnrollment, courseProgress, $transaction, $executeRaw } };
});

vi.mock('@/lib/platform/programCatalog', () => ({
  getActivePrograms: vi.fn(),
  isProgramSlugActiveInCatalog: vi.fn((programs: any[], slug: string) => programs.some((p) => p.slug === slug)),
}));

vi.mock('@/lib/platform/trainingEnrollmentGate', () => ({
  isMemberWioaVerified: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/notifications/partner-notify', () => ({
  sendPartnerMilestoneEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/email', () => ({
  sendCourseEnrolledEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/member/points', () => ({
  awardPoints: vi.fn(() => Promise.resolve()),
}));

// ─── Imports after mocks ───
import { POST as enrollPost } from '@/app/api/member/enroll/route';
import { GET as listEnrollments } from '@/app/api/member/enrollments/route';
import { GET as getEnrollment } from '@/app/api/member/enrollments/[id]/route';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { getActivePrograms } from '@/lib/platform/programCatalog';
import { isMemberWioaVerified } from '@/lib/platform/trainingEnrollmentGate';
import { NextRequest, after } from 'next/server';
import { sendCourseEnrolledEmail } from '@/lib/email';

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
  user2: '550e8400-e29b-41d4-a716-446655440002',
  org: '550e8400-e29b-41d4-a716-446655440003',
  enrollment: '550e8400-e29b-41d4-a716-446655440004',
  enrollment2: '550e8400-e29b-41d4-a716-446655440005',
};

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/member/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

describe('POST /api/member/enroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([]);
  });

  it('enrolls member in program', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(getActivePrograms).mockResolvedValue([
      { slug: 'tech-support', name: 'Tech Support', static: { title: 'Tech Support' } },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      wioaReviewStatus: 'verified',
      courseEnrollments: [],
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      email: 'user@example.com',
      fullName: 'Test User',
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.courseEnrollment.upsert).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user,
      programSlug: 'tech-support',
      isPrimary: true,
    } as any);

    const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, programSlug: 'tech-support' });
  });

  it('creates enrollment record', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(getActivePrograms).mockResolvedValue([
      { slug: 'tech-support', name: 'Tech Support', static: { title: 'Tech Support' } },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      wioaReviewStatus: 'verified',
      courseEnrollments: [],
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      email: 'user@example.com',
      fullName: 'Test User',
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.courseEnrollment.upsert).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user,
      programSlug: 'tech-support',
      isPrimary: true,
    } as any);

    await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

    expect(prisma.courseEnrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_programSlug: { userId: UUIDS.user, programSlug: 'tech-support' } },
        create: expect.objectContaining({
          userId: UUIDS.user,
          programSlug: 'tech-support',
          isPrimary: true,
        }),
        update: expect.objectContaining({
          isPrimary: true,
        }),
      })
    );
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid program', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(getActivePrograms).mockResolvedValue([
      { slug: 'other-program', name: 'Other Program' },
    ] as any);

    const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'That program is not available for enrollment right now.',
    });
  });

  it('skips the WIOA gate for Grant-funded programs', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(getActivePrograms).mockResolvedValue([
      {
        slug: 'digital-literacy-empowerment-class',
        name: 'Digital Literacy',
        static: { title: 'Digital Literacy', fundingSource: 'Grant' },
      },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      wioaReviewStatus: null,
      courseEnrollments: [],
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      email: 'user@example.com',
      fullName: 'Test User',
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.courseEnrollment.upsert).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user,
      programSlug: 'digital-literacy-empowerment-class',
      isPrimary: true,
    } as any);
    vi.mocked(isMemberWioaVerified).mockReturnValue({ ok: false, code: 'WIOA_NOT_STARTED' });

    const res = await enrollPost(
      makePostRequest({ programSlug: 'digital-literacy-empowerment-class' })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      programSlug: 'digital-literacy-empowerment-class',
    });
    expect(isMemberWioaVerified).not.toHaveBeenCalled();
  });

  it('still WIOA-gates WIOA-funded programs', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(getActivePrograms).mockResolvedValue([
      {
        slug: 'tech-support',
        name: 'Tech Support',
        static: { title: 'Tech Support', fundingSource: 'WIOA' },
      },
    ] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      wioaReviewStatus: null,
      courseEnrollments: [],
    } as any);
    vi.mocked(isMemberWioaVerified).mockReturnValue({ ok: false, code: 'WIOA_NOT_STARTED' });

    const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'WIOA_NOT_STARTED' });
    expect(isMemberWioaVerified).toHaveBeenCalled();
  });

  describe('idempotency and the NULL-pointer primary row (T02)', () => {
    const PROGRAMS = [
      { slug: 'tech-support', name: 'Tech Support', static: { title: 'Tech Support' } },
      { slug: 'data-entry', name: 'Data Entry', static: { title: 'Data Entry' } },
      {
        slug: 'it-automation-with-python-google',
        name: 'IT Automation with Python',
        static: { title: 'IT Automation with Python' },
      },
    ];

    function memberRow(args: { pointer: string | null; primarySlug?: string | null }) {
      return {
        id: UUIDS.user,
        enrolledProgram: args.pointer,
        wioaReviewStatus: 'verified',
        courseEnrollments: args.primarySlug
          ? [{ enrolledByAdminId: null, programSlug: args.primarySlug }]
          : [],
      } as any;
    }

    beforeEach(() => {
      vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
      vi.mocked(getActivePrograms).mockResolvedValue(PROGRAMS as any);
      vi.mocked(isMemberWioaVerified).mockReturnValue({ ok: true } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({
        email: 'user@example.com',
        fullName: 'Test User',
        organizationId: UUIDS.org,
      } as any);
      vi.mocked(prisma.courseEnrollment.upsert).mockResolvedValue({
        id: UUIDS.enrollment,
        userId: UUIDS.user,
        programSlug: 'tech-support',
        isPrimary: true,
      } as any);
    });

    function expectNoWritesOrSideEffects() {
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.courseEnrollment.upsert).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
      expect(sendCourseEnrolledEmail).not.toHaveBeenCalled();
    }

    it('a retry of a successful enroll (pointer already on the same program) is a 200 no-op', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: 'tech-support', primarySlug: 'tech-support' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        programSlug: 'tech-support',
        alreadyEnrolled: true,
      });
      expectNoWritesOrSideEffects();
    });

    it('a primary row with a NULL pointer on the same program is a 200 no-op: no re-stamped enrolledAt, no second email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: null, primarySlug: 'tech-support' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        programSlug: 'tech-support',
        alreadyEnrolled: true,
      });
      expectNoWritesOrSideEffects();
    });

    it('a primary row with a NULL pointer on a different program is the handled 400, never a second primary row or a 500', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: null, primarySlug: 'data-entry' }),
      );
      // What the partial unique index course_enrollments_user_primary_uidx
      // does if the route ever reaches the write.
      vi.mocked(prisma.courseEnrollment.upsert).mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Already enrolled in a program. Changes require admin.',
        code: 'ALREADY_ENROLLED',
      });
      expectNoWritesOrSideEffects();
    });

    it('a pointer on a different program still refuses self-serve reassignment', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: 'data-entry', primarySlug: 'data-entry' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'ALREADY_ENROLLED' });
      expectNoWritesOrSideEffects();
    });

    it('the primary row wins over a drifted pointer: requesting the pointer program is not "already enrolled"', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: 'tech-support', primarySlug: 'data-entry' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'ALREADY_ENROLLED' });
      expectNoWritesOrSideEffects();
    });

    it('an assignment stored under a retired alias counts as the same program', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({
          pointer: 'it-automation-with-python-professional-certificate-google',
          primarySlug: 'it-automation-with-python-professional-certificate-google',
        }),
      );

      const res = await enrollPost(
        makePostRequest({ programSlug: 'it-automation-with-python-google' }),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        programSlug: 'it-automation-with-python-google',
        alreadyEnrolled: true,
      });
      expectNoWritesOrSideEffects();
    });

    it('takes a per-member advisory lock before reading the assignment, inside the write transaction', async () => {
      const order: string[] = [];
      vi.mocked(prisma.$executeRaw).mockImplementation((async (...args: any[]) => {
        order.push(`lock:${JSON.stringify(args)}`);
        return 0;
      }) as any);
      vi.mocked(prisma.user.findUnique).mockImplementation((async () => {
        order.push('read');
        return memberRow({ pointer: null });
      }) as any);
      vi.mocked(prisma.user.update).mockImplementation((async () => {
        order.push('write');
        return { email: 'user@example.com', fullName: 'Test User', organizationId: UUIDS.org };
      }) as any);

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, programSlug: 'tech-support' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(order).toHaveLength(3);
      expect(order[0]).toMatch(/^lock:.*pg_advisory_xact_lock/);
      expect(order[0]).toContain(`member-program-enroll:${UUIDS.user}`);
      expect(order.slice(1)).toEqual(['read', 'write']);
    });

    it('a double submit: the request that waited on the lock sees the winner\'s row and fires no second email', async () => {
      // First request enrolled while this one waited on the lock; the read
      // taken under the lock therefore sees the committed primary row.
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        memberRow({ pointer: 'tech-support', primarySlug: 'tech-support' }),
      );

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, alreadyEnrolled: true });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expectNoWritesOrSideEffects();
    });

    it('a first enroll still writes once and schedules the enrolled email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(memberRow({ pointer: null }));

      const res = await enrollPost(makePostRequest({ programSlug: 'tech-support' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, programSlug: 'tech-support' });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.courseEnrollment.upsert).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalled();
    });
  });
});

describe('GET /api/member/enrollments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns member's enrollments", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      { id: UUIDS.enrollment, userId: UUIDS.user, programSlug: 'tech-support', isPrimary: true, enrolledAt: new Date('2026-01-01') },
    ] as any);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);

    const res = await listEnrollments(makeGetRequest('http://localhost:3000/api/member/enrollments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollments).toHaveLength(1);
    expect(body.enrollments[0].programSlug).toBe('tech-support');
  });

  it('includes progress status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      { id: UUIDS.enrollment, userId: UUIDS.user, programSlug: 'tech-support', isPrimary: true, enrolledAt: new Date('2026-01-01') },
    ] as any);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([
      { id: 'cp-1', userId: UUIDS.user, programSlug: 'tech-support', courseSlug: 'course-1', status: 'IN_PROGRESS', percentComplete: 50 },
    ] as any);

    const res = await listEnrollments(makeGetRequest('http://localhost:3000/api/member/enrollments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollments[0].status).toBe('IN_PROGRESS');
    expect(body.enrollments[0].progress.overallPercent).toBe(50);
  });

  it('filters by status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      { id: UUIDS.enrollment, userId: UUIDS.user, programSlug: 'tech-support', isPrimary: true, enrolledAt: new Date('2026-01-01') },
      { id: UUIDS.enrollment2, userId: UUIDS.user, programSlug: 'data-entry', isPrimary: false, enrolledAt: new Date('2026-01-02') },
    ] as any);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([
      { id: 'cp-1', userId: UUIDS.user, programSlug: 'tech-support', courseSlug: 'course-1', status: 'COMPLETED', percentComplete: 100 },
      { id: 'cp-2', userId: UUIDS.user, programSlug: 'data-entry', courseSlug: 'course-2', status: 'NOT_STARTED', percentComplete: 0 },
    ] as any);

    const res = await listEnrollments(
      makeGetRequest('http://localhost:3000/api/member/enrollments?status=COMPLETED')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollments).toHaveLength(1);
    expect(body.enrollments[0].programSlug).toBe('tech-support');
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await listEnrollments(makeGetRequest('http://localhost:3000/api/member/enrollments'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/member/enrollments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enrollment details', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user,
      programSlug: 'tech-support',
      isPrimary: true,
      enrolledAt: new Date('2026-01-01'),
    } as any);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([]);

    const res = await getEnrollment(
      makeGetRequest(`http://localhost:3000/api/member/enrollments/${UUIDS.enrollment}`),
      { params: Promise.resolve({ id: UUIDS.enrollment }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollment.id).toBe(UUIDS.enrollment);
    expect(body.enrollment.programSlug).toBe('tech-support');
  });

  it('includes course progress', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user,
      programSlug: 'tech-support',
      isPrimary: true,
      enrolledAt: new Date('2026-01-01'),
    } as any);
    vi.mocked(prisma.courseProgress.findMany).mockResolvedValue([
      { id: 'cp-1', userId: UUIDS.user, programSlug: 'tech-support', courseSlug: 'course-1', status: 'COMPLETED', percentComplete: 100 },
    ] as any);

    const res = await getEnrollment(
      makeGetRequest(`http://localhost:3000/api/member/enrollments/${UUIDS.enrollment}`),
      { params: Promise.resolve({ id: UUIDS.enrollment }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrollment.courseProgress).toHaveLength(1);
    expect(body.enrollment.courseProgress[0].courseSlug).toBe('course-1');
  });

  it('returns 404 for missing enrollment', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(null);

    const res = await getEnrollment(
      makeGetRequest(`http://localhost:3000/api/member/enrollments/${UUIDS.enrollment}`),
      { params: Promise.resolve({ id: UUIDS.enrollment }) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Enrollment not found' });
  });

  it("returns 403 for other member's enrollment", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'user@example.com' } as any);
    vi.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({
      id: UUIDS.enrollment,
      userId: UUIDS.user2,
      programSlug: 'tech-support',
      isPrimary: true,
      enrolledAt: new Date('2026-01-01'),
    } as any);

    const res = await getEnrollment(
      makeGetRequest(`http://localhost:3000/api/member/enrollments/${UUIDS.enrollment}`),
      { params: Promise.resolve({ id: UUIDS.enrollment }) }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });
});
