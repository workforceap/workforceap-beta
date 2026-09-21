import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit S9 — the AI member summary fed the model numbers the page beside it
 * contradicts. It counted every COMPLETED CourseProgress row across all
 * programs ("8 completed" for a member whose page reads "3 of 17") and took
 * `memberProgramProgress[0]` from a relation with no orderBy (one member
 * carries four rollups: 24%, 77%, 6%, 0%). The facts must come from the same
 * reconciliation the member-detail page uses.
 */

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request, ctx: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => true), isSuperAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/rate-limit', () => ({ checkAIToolRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/ai/groq', () => ({ chatCompletion: vi.fn(async () => 'ok'), isAIConfigured: vi.fn(() => true) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/memberProgramTrainingView', () => ({ loadMemberProgramTrainingView: vi.fn(async () => null) }));

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { findUnique } }),
    user: { findUnique },
  },
}));

import { POST } from '@/app/api/admin/members/[id]/summary/route';
import { getUser } from '@/lib/auth/server';
import { chatCompletion } from '@/lib/ai/groq';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';

const PROGRAM = 'software-developer-professional-certificate-ibm';

function call() {
  return POST(new Request('http://localhost/api/admin/members/m1/summary', { method: 'POST' }), {
    params: Promise.resolve({ id: 'm1' }),
  });
}

function promptText(): string {
  const call0 = vi.mocked(chatCompletion).mock.calls[0];
  const messages = call0[0] as Array<{ role: string; content: string }>;
  return messages.map((m) => m.content).join('\n');
}

describe('POST /api/admin/members/[id]/summary facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'staff-1' } as never);
    vi.mocked(chatCompletion).mockResolvedValue('ok');
    findUnique.mockResolvedValue({
      fullName: 'Fixture Member',
      email: 'fixture@example.com',
      deletedAt: null,
      enrolledProgram: PROGRAM,
      enrolledAt: new Date('2026-03-01T00:00:00Z'),
      assessmentCompleted: true,
      assessmentScorePct: 80,
      wioaReviewStatus: null,
      profile: null,
      courseEnrollments: [{ programSlug: PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true }],
      // 8 COMPLETED rows spread over every program the member ever touched —
      // the figure the old route handed the model.
      courseProgress: Array.from({ length: 8 }, (_, i) => ({
        courseSlug: `c${i}`,
        status: 'COMPLETED',
        percentComplete: 100,
        lastUpdatedAt: new Date('2026-09-10T00:00:00Z'),
      })),
      placementRecord: null,
    });
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue({
      completedCount: 3,
      totalCourses: 17,
      progressPercentDisplay: 24,
      allCoursesComplete: false,
      nextIncompleteCourseSlug: 'ibm-course-2',
      nextIncompleteCourseName: 'Introduction to Software Engineering',
      hasStartedTraining: true,
      hasCompletedFirstCourse: true,
      lastTrainingActivityAt: new Date('2026-09-12T00:00:00Z'),
      averageGradePercentDisplay: null,
      completedSlugsAuthoritative: [],
      courseRows: [],
      validatedCourseSlugs: [],
    });
  });

  it('feeds the model the reconciled program counts, not a raw COMPLETED tally', async () => {
    const res = await call();
    expect(res.status).toBe(200);

    expect(loadMemberProgramTrainingView).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'm1', programSlug: PROGRAM }),
    );
    // Admin surfaces reconcile local rows only; no live B4B map is merged here.
    const viewArgs = vi.mocked(loadMemberProgramTrainingView).mock.calls[0][0] as Record<string, unknown>;
    expect(viewArgs.b4bProgress).toBeUndefined();

    const prompt = promptText();
    expect(prompt).toContain('Program progress: 3 of 17 courses complete (24% overall)');
    expect(prompt).toContain('Next incomplete course: Introduction to Software Engineering');
    expect(prompt).toContain('Last course activity: 2026-09-12');
    expect(prompt).not.toContain('8 completed');
    expect(prompt).not.toContain('% average');
  });

  it('never selects the unordered memberProgramProgress relation', async () => {
    await call();
    const select = (findUnique.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(select.memberProgramProgress).toBeUndefined();
    expect(select.courseEnrollments).toBeDefined();
  });

  it('does not 500 when the member row carries no courseEnrollments', async () => {
    // Callers that select a narrower member shape (and the tenant-boundary
    // spec's fixture) leave the relation undefined; resolving the assignment
    // must not throw before the route can answer.
    findUnique.mockResolvedValue({
      fullName: 'Sparse Fixture', email: 'sparse@example.com', deletedAt: null,
      enrolledProgram: null, enrolledAt: null, assessmentCompleted: false,
      assessmentScorePct: null, wioaReviewStatus: null, profile: null,
      courseProgress: [], placementRecord: null,
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(promptText()).toContain('Enrolled program: None');
  });

  it('says "unavailable" when the training view fails to load, not "no course data"', async () => {
    vi.mocked(loadMemberProgramTrainingView).mockRejectedValue(new Error('db down'));
    const res = await call();
    expect(res.status).toBe(200);
    const prompt = promptText();
    expect(prompt).toContain('Program progress: unavailable');
    expect(prompt).not.toContain('no course data');
  });

  it('says so plainly when the assigned program has no course data', async () => {
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue(null);
    await call();
    const prompt = promptText();
    expect(prompt).toContain('Program progress: no course data for the assigned program');
  });
});
