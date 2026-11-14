import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request, context?: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/db/prisma', () => {
  const testimonial = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const placementSurvey = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
  };
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), testimonial, placementSurvey, user } };
});

// ─── Imports after mocks ───
import { GET as listTestimonials } from '@/app/api/admin/testimonials/route';
import { PATCH as updateTestimonial, DELETE as deleteTestimonial } from '@/app/api/admin/testimonials/[id]/route';
import { GET as checkSurvey, POST as submitSurvey } from '@/app/api/placement-survey/route';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { TestimonialStatus } from '@prisma/client';
import { issuePlacementSurveyToken, verifyPlacementSurveyToken } from '@/lib/security/placementSurveyToken';

describe('GET /api/admin/testimonials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
  });

  it('returns 403 when not admin or counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);

    const res = await listTestimonials(new Request('http://localhost:3000/api/admin/testimonials'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 for non-super staff without an organization', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isCounselor).mockResolvedValue(false);
    vi.mocked(isSuperAdmin).mockResolvedValue(false);
    vi.mocked(getActorOrganizationId).mockResolvedValue(null as any);

    const res = await listTestimonials(new Request('http://localhost:3000/api/admin/testimonials'));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(prisma.testimonial.findMany).not.toHaveBeenCalled();
    expect(prisma.testimonial.count).not.toHaveBeenCalled();
  });

  it('scopes list and stats to the actor org via the member organization', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.testimonial.count).mockResolvedValue(0);

    const res = await listTestimonials(new Request('http://localhost:3000/api/admin/testimonials'));
    expect(res.status).toBe(200);
    const orgWhere = { deletedAt: null, member: { organizationId: 'org-1' } };
    expect(prisma.testimonial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: orgWhere,
      }),
    );
    expect(prisma.testimonial.count).toHaveBeenCalledWith({ where: orgWhere });
    expect(prisma.testimonial.count).toHaveBeenCalledWith({
      where: { ...orgWhere, status: TestimonialStatus.PENDING },
    });
  });

  it('keeps an empty org filter for a super-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('must not be needed'));
    vi.mocked(prisma.testimonial.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.testimonial.count).mockResolvedValue(0);

    const res = await listTestimonials(new Request('http://localhost:3000/api/admin/testimonials'));
    expect(res.status).toBe(200);
    expect(getActorOrganizationId).not.toHaveBeenCalled();
    expect(prisma.testimonial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
  });

  it('returns testimonials with stats for admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findMany).mockResolvedValue([
      {
        id: 't1',
        memberId: 'user-1',
        content: 'Great program!',
        rating: 5,
        status: TestimonialStatus.PENDING,
        source: 'SURVEY',
        member: { fullName: 'Alice', email: 'alice@example.com', enrolledProgram: 'CNA' },
        reviewer: null,
      },
    ] as any);
    vi.mocked(prisma.testimonial.count)
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1) // pending
      .mockResolvedValueOnce(0) // approved
      .mockResolvedValueOnce(0) // rejected
      .mockResolvedValueOnce(0); // published

    const res = await listTestimonials(new Request('http://localhost:3000/api/admin/testimonials'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.testimonials).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.stats).toMatchObject({ pending: 1, approved: 0, rejected: 0, published: 0 });
  });

  it('filters by status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.testimonial.count).mockResolvedValue(0);

    const res = await listTestimonials(
      new Request('http://localhost:3000/api/admin/testimonials?status=PUBLISHED')
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: TestimonialStatus.PUBLISHED }),
      })
    );
  });

  it('ignores invalid status filter', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.testimonial.count).mockResolvedValue(0);

    const res = await listTestimonials(
      new Request('http://localhost:3000/api/admin/testimonials?status=invalid')
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });
});

describe('PATCH /api/admin/testimonials/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(403);
  });

  it('approves a testimonial and sets reviewer info', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1', fullName: 'Admin' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.PENDING,
      deletedAt: null,
    } as any);
    vi.mocked(prisma.testimonial.updateMany).mockResolvedValue({ count: 1 } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(200);
    const updateCall = vi.mocked(prisma.testimonial.updateMany).mock.calls[0][0];
    expect(updateCall.data).toMatchObject({
      status: TestimonialStatus.APPROVED,
      reviewedBy: 'admin-1',
    });
    expect(updateCall.data.reviewedAt).toBeInstanceOf(Date);
  });

  it('publishes a testimonial', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.APPROVED,
      deletedAt: null,
    } as any);
    vi.mocked(prisma.testimonial.updateMany).mockResolvedValue({ count: 1 } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'PUBLISHED' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TestimonialStatus.PUBLISHED }),
      })
    );
  });

  it('rejects a testimonial with reason', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.PENDING,
      deletedAt: null,
    } as any);
    vi.mocked(prisma.testimonial.updateMany).mockResolvedValue({ count: 1 } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Too vague' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(200);
    const updateCall = vi.mocked(prisma.testimonial.updateMany).mock.calls[0][0];
    expect(updateCall.data).toMatchObject({
      status: TestimonialStatus.REJECTED,
      rejectionReason: 'Too vague',
    });
  });

  it('returns 400 for invalid status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.PENDING,
      deletedAt: null,
    } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'INVALID' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Invalid status') });
  });

  it('returns 400 for invalid rating', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.PENDING,
      deletedAt: null,
    } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 10 }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Rating must be 1–5' });
  });

  it('returns 400 for empty content', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      status: TestimonialStatus.PENDING,
      deletedAt: null,
    } as any);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Content cannot be empty' });
  });

  it('returns 404 for non-existent testimonial', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue(null);

    const res = await updateTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t-missing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      }),
      { params: Promise.resolve({ id: 't-missing' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/testimonials/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes a testimonial', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue({
      id: 't1',
      deletedAt: null,
    } as any);
    vi.mocked(prisma.testimonial.updateMany).mockResolvedValue({ count: 1 } as any);

    const res = await deleteTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 't1' }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it('returns 404 for already deleted testimonial', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.testimonial.findFirst).mockResolvedValue(null);

    const res = await deleteTestimonial(
      new Request('http://localhost:3000/api/admin/testimonials/t1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 't1' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('Placement Survey → Testimonial auto-creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLACEMENT_SURVEY_TOKEN_SECRET = 'test-secret-32-bytes-long-1234567890';
  });

  afterEach(() => {
    delete process.env.PLACEMENT_SURVEY_TOKEN_SECRET;
  });

  const makeRequest = (body: Record<string, unknown>): any =>
    new Request('http://localhost:3000/api/placement-survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('creates a testimonial when allowTestimonial=true', async () => {
    const token = await issuePlacementSurveyToken({ surveyId: 'survey-auto' });
    vi.mocked(prisma.placementSurvey.findUnique).mockResolvedValue({
      id: 'survey-auto',
      userId: 'user-1',
      placementId: 'pl-1',
      completedAt: null,
    } as any);
    vi.mocked(prisma.placementSurvey.update).mockResolvedValue({
      id: 'survey-auto',
      completedAt: new Date(),
      userId: 'user-1',
      placementId: 'pl-1',
      allowTestimonial: true,
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      enrolledProgram: 'CNA',
    } as any);
    vi.mocked(prisma.testimonial.create).mockResolvedValue({ id: 't-new' } as any);

    const res = await submitSurvey(
      makeRequest({
        token,
        jobSatisfaction: 5,
        whatHelpedMost: 'The mentors were amazing',
        allowTestimonial: true,
      })
    );
    expect(res.status).toBe(200);

    expect(prisma.testimonial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: 'user-1',
          placementId: 'pl-1',
          programId: 'CNA',
          content: 'The mentors were amazing',
          rating: 5,
          source: 'SURVEY',
          status: 'PENDING',
          consentGiven: true,
        }),
      })
    );
  });

  it('does not create testimonial when allowTestimonial=false', async () => {
    const token = await issuePlacementSurveyToken({ surveyId: 'survey-no' });
    vi.mocked(prisma.placementSurvey.findUnique).mockResolvedValue({
      id: 'survey-no',
      userId: 'user-1',
      placementId: 'pl-1',
      completedAt: null,
    } as any);
    vi.mocked(prisma.placementSurvey.update).mockResolvedValue({
      id: 'survey-no',
      completedAt: new Date(),
      userId: 'user-1',
      placementId: 'pl-1',
      allowTestimonial: false,
    } as any);

    const res = await submitSurvey(
      makeRequest({
        token,
        jobSatisfaction: 4,
        allowTestimonial: false,
      })
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.create).not.toHaveBeenCalled();
  });

  it('still returns success even if testimonial creation fails', async () => {
    const token = await issuePlacementSurveyToken({ surveyId: 'survey-fail' });
    vi.mocked(prisma.placementSurvey.findUnique).mockResolvedValue({
      id: 'survey-fail',
      userId: 'user-1',
      placementId: 'pl-1',
      completedAt: null,
    } as any);
    vi.mocked(prisma.placementSurvey.update).mockResolvedValue({
      id: 'survey-fail',
      completedAt: new Date(),
      userId: 'user-1',
      placementId: 'pl-1',
      allowTestimonial: true,
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: 'IT' } as any);
    vi.mocked(prisma.testimonial.create).mockRejectedValue(new Error('DB error'));

    const res = await submitSurvey(
      makeRequest({
        token,
        jobSatisfaction: 4,
        allowTestimonial: true,
      })
    );
    expect(res.status).toBe(200);
    expect(prisma.testimonial.create).toHaveBeenCalled();
  });
});
