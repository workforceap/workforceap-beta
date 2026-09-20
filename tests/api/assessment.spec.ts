import { describe, it, expect, vi, beforeEach } from 'vitest';

const resendSend = vi.hoisted(() => vi.fn());

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
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const prismaMock: any = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(),
    },
    aIToolResult: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    userCertification: {
      findMany: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
    workflowDiagnostic: {
      create: vi.fn(),
    },
    memberEvent: {
      create: vi.fn(),
    },
    pointsTransaction: {
      create: vi.fn(),
    },
    memberPoints: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  };
  prismaMock.$transaction = vi.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );
  return { prisma: prismaMock };
});

vi.mock('@/lib/member/points', () => ({
  awardPoints: vi.fn(),
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/member/starterProfileReview', () => ({
  getCounselorStarterProfileReview: vi.fn(),
  getStarterProfileFieldLabels: vi.fn((fields: string[]) => fields),
}));

vi.mock('@/lib/email/template', () => ({
  brandedEmailLayout: vi.fn(() => '<html>mock email</html>'),
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: vi.fn(),
}));

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: {
        send: resendSend,
      },
    };
  }),
}));

// Sends go through lib/email/send.ts (unsubscribe token signing + failure
// diagnostics); the member fixture uses a non-reserved domain so the wrapper
// hands it to the provider mock instead of skipping it as a fixture.
process.env.UNSUBSCRIBE_TOKEN_SECRET ??= 'test-unsubscribe-secret';
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));

// ─── Imports after mocks ───
import { POST as submitAssessment } from '@/app/api/member/assessment/submit/route';
import { POST as resetAssessment } from '@/app/api/member/assessment/reset/route';
import { GET as getSkillProfile } from '@/app/api/member/skill-profile/route';
import { POST as saveSkillAssessment } from '@/app/api/member/skill-assessment/route';
import {
  ASSESSMENT_QUESTIONS,
  scoreAssessment,
  TOTAL_POINTS,
} from '@/lib/assessment/answer-key';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { getCounselorStarterProfileReview } from '@/lib/member/starterProfileReview';
import { awardPoints } from '@/lib/member/points';
import { trackEvent } from '@/lib/events/track';

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
  admin: '550e8400-e29b-41d4-a716-446655440002',
  resultId: '550e8400-e29b-41d4-a716-446655440003',
};

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/member/assessment/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

// ─────────────────────────────────────────────
// Assessment Questions / Start
// ─────────────────────────────────────────────
describe('Assessment start — questions & scoring', () => {
  it('exports a non-empty array of assessment questions', () => {
    expect(ASSESSMENT_QUESTIONS.length).toBeGreaterThan(0);
  });

  it('each question has required fields', () => {
    for (const q of ASSESSMENT_QUESTIONS) {
      expect(q.id).toBeDefined();
      expect(typeof q.question).toBe('string');
      expect(q.choices.length).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D']).toContain(q.correct);
      expect(typeof q.points).toBe('number');
      expect(q.points).toBeGreaterThan(0);
    }
  });

  it('calculates a perfect score when all answers are correct', () => {
    const answers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
    for (const q of ASSESSMENT_QUESTIONS) {
      answers[q.id] = q.correct;
    }
    const { raw, pct } = scoreAssessment(answers);
    expect(raw).toBe(TOTAL_POINTS);
    expect(pct).toBe(100);
  });

  it('calculates zero score when all answers are wrong', () => {
    const answers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
    for (const q of ASSESSMENT_QUESTIONS) {
      const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== q.correct)!;
      answers[q.id] = wrong;
    }
    const { raw, pct } = scoreAssessment(answers);
    expect(raw).toBe(0);
    expect(pct).toBe(0);
  });

  it('returns 401 for unauthenticated user on submit', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);
    const req = makeRequest({});
    const res = await submitAssessment(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for unauthenticated user on skill-profile', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);
    const res = await getSkillProfile(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

// ─────────────────────────────────────────────
// POST /api/member/assessment/submit
// ─────────────────────────────────────────────
describe('POST /api/member/assessment/submit', () => {
  const validBody = {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '512-555-1234',
    programInterest: 'Digital Literacy Empowerment Class (6 weeks, 30 hours total)',
    answers: {
      '1': 'A',
      '2': 'C',
      '3': 'C',
      '4': 'A',
      '5': 'A',
    } as Record<string, string>,
  };

  const mockUser = {
    id: UUIDS.user,
    email: 'jane@example.org',
    assessmentCompleted: false,
    phone: '512-555-1234',
    courseEnrollments: [{ enrolledByAdminId: null }],
    profile: {
      profilePhone: '512-555-1234',
      profileAddress: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      referralSource: 'Friend',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resendSend.mockReset();
    resendSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    vi.stubEnv('EMAIL_FROM', 'test@workforceap.org');
    vi.stubEnv('EMAIL_TO_ADMIN', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.workforceap.org');
  });

  it('submits answers and calculates score for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({ required: false, missing: [] });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(awardPoints).mockResolvedValue({ awarded: true, points: 10, total: 10, level: 'starter' });

    const req = makeRequest(validBody);
    const res = await submitAssessment(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.rawScore).toBe('number');
    expect(typeof body.scorePct).toBe('number');
    expect(body.scorePct).toBeGreaterThanOrEqual(0);
    expect(body.scorePct).toBeLessThanOrEqual(100);
    expect(body.adminEmailSent).toBe(true);
    expect(body.emailsSent).toBe(true);
    expect(resendSend.mock.calls[0]?.[0]?.to).toEqual([
      'info@workforceap.org',
      'michael.brown@workforceap.org',
      'michael.brown2@workforceap.org',
    ]);
  });

  it('does not claim staff delivery when Resend returns a provider error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({ required: false, missing: [] });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    resendSend
      .mockResolvedValueOnce({ data: null, error: { name: 'validation_error' } })
      .mockResolvedValueOnce({ data: { id: 'member-email-123' }, error: null });

    const res = await submitAssessment(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.adminEmailSent).toBe(false);
    expect(body.emailsSent).toBe(true);
  });

  it('stores results in member profile', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({ required: false, missing: [] });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);

    const req = makeRequest(validBody);
    await submitAssessment(req);

    // Route now uses an atomic updateMany with assessmentCompleted=false in
    // the WHERE clause (double-submit race guard).
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.user, assessmentCompleted: false },
        data: expect.objectContaining({
          assessmentCompleted: true,
          assessmentScore: expect.any(Number),
          assessmentScorePct: expect.any(Number),
          programInterest: validBody.programInterest,
        }),
      })
    );
  });

  it('awards points on submission', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({ required: false, missing: [] });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);

    const req = makeRequest(validBody);
    await submitAssessment(req);

    expect(awardPoints).toHaveBeenCalledWith(UUIDS.user, 'assessment_completed');
  });

  it('tracks assessment completion event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({ required: false, missing: [] });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);

    const req = makeRequest(validBody);
    await submitAssessment(req);

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UUIDS.user,
        eventName: 'apply_signup_completed',
        entityType: 'assessment',
        metadata: expect.objectContaining({
          rawScore: expect.any(Number),
          scorePct: expect.any(Number),
          programInterest: validBody.programInterest,
        }),
        sourcePage: '/dashboard/assessment',
      })
    );
  });

  it('returns 400 when assessment already completed', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      assessmentCompleted: true,
    } as any);

    const req = makeRequest(validBody);
    const res = await submitAssessment(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Assessment already completed' });
  });

  it('returns 400 for invalid submission data', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);

    const req = makeRequest({ firstName: '', lastName: '', phone: '', programInterest: '', answers: {} });
    const res = await submitAssessment(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid submission data' });
  });

  it('still accepts the submission when starter profile review is pending', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getCounselorStarterProfileReview).mockReturnValue({
      required: true,
      missing: ['phone', 'address'],
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      courseEnrollments: [{ enrolledByAdminId: 'admin-123' }],
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);

    const req = makeRequest(validBody);
    const res = await submitAssessment(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profileReviewPending).toEqual(['phone', 'address']);
  });
});

// ─────────────────────────────────────────────
// GET /api/member/skill-profile
// ─────────────────────────────────────────────
describe('GET /api/member/skill-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns assessment summary for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([
      { certName: 'CompTIA A+' },
    ] as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      resumeEnhancedPath: null,
      resumeOriginalPath: null,
    } as any);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([] as any);

    const res = await getSkillProfile(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skillProfile).toBeDefined();
    expect(Array.isArray(body.skillProfile)).toBe(true);
    expect(body.certNames).toEqual(['CompTIA A+']);
  });

  it('includes skill breakdown with radar axes', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([
      {
        output: JSON.stringify({
          radarAxes: [
            { axis: 'Analytics', value: 70, maxValue: 100 },
            { axis: 'Engineering', value: 80, maxValue: 100 },
          ],
        }),
        createdAt: new Date(),
      },
    ] as any);

    const res = await getSkillProfile(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skillProfile).toBeInstanceOf(Array);
    expect(body.skillProfile.length).toBeGreaterThan(0);
    expect(body.skillProfile[0]).toHaveProperty('axis');
    expect(body.skillProfile[0]).toHaveProperty('value');
    expect(body.hasSavedAssessment).toBe(true);
  });

  it('returns empty profile when no data exists', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.aIToolResult.findMany).mockResolvedValue([] as any);

    const res = await getSkillProfile(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skillProfile).toBeInstanceOf(Array);
    expect(body.hasCerts).toBe(false);
    expect(body.hasSavedAssessment).toBe(false);
    expect(body.hasInterestProfiler).toBe(false);
  });
});

// ─────────────────────────────────────────────
// POST /api/member/skill-assessment
// ─────────────────────────────────────────────
describe('POST /api/member/skill-assessment', () => {
  const validSkillBody = {
    occupationTitle: 'Software Developer',
    occupationCode: '15-1252.00',
    radarAxes: [
      { axis: 'Analytics', value: 75, maxValue: 100 },
      { axis: 'Engineering', value: 90, maxValue: 100 },
    ],
    skills: [
      { id: 'js', name: 'JavaScript', score: 85, category: 'skill' as const },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves skill assessment for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user, email: 'jane@example.org' } as any);
    vi.mocked(prisma.aIToolResult.create).mockResolvedValue({
      id: UUIDS.resultId,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    } as any);

    const req = new Request('http://localhost:3000/api/member/skill-assessment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validSkillBody),
    });

    const res = await saveSkillAssessment(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resultId).toBe(UUIDS.resultId);
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const req = new Request('http://localhost:3000/api/member/skill-assessment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validSkillBody),
    });

    const res = await saveSkillAssessment(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);

    const req = new Request('http://localhost:3000/api/member/skill-assessment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ occupationTitle: '' }),
    });

    const res = await saveSkillAssessment(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// POST /api/member/assessment/reset
// ─────────────────────────────────────────────
describe('POST /api/member/assessment/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows authenticated member to reset assessment', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      fullName: 'Jane Doe',
      email: 'jane@example.org',
      assessmentCompleted: true,
      assessmentScore: 80,
      assessmentScorePct: 85,
      assessmentCompletedAt: new Date(),
      assessmentAnswers: { '1': 'A' },
      programInterest: 'IT Support',
    } as any);
    vi.mocked(prisma.workflowDiagnostic.create).mockResolvedValue({ id: 'wd-1' } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: UUIDS.user } as any);

    const res = await resetAssessment(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.user },
        data: expect.objectContaining({
          assessmentCompleted: false,
          assessmentScore: null,
          assessmentScorePct: null,
          assessmentCompletedAt: null,
        }),
      })
    );
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);
    const res = await resetAssessment(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when assessment not yet completed', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      assessmentCompleted: false,
    } as any);

    const res = await resetAssessment(new Request('http://localhost'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Assessment not completed yet — nothing to reset' });
  });
});
