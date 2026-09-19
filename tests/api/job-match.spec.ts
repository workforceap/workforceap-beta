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
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const job = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
  };
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), job, user } };
});

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/jobs/publicJobFilters', () => ({
  isExcludedPublicEmployerName: vi.fn(() => false),
  isExcludedPublicJobTitle: vi.fn(() => false),
}));

vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: vi.fn((_bucket: string, path: string | null) => path),
}));

// ─── Imports after mocks ───
import { GET as getMatchedJobs } from '@/app/api/member/matched-jobs/route';
import { GET as getJobDetail } from '@/app/api/(portal)/dashboard/jobs/[id]/route';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  MATCH_WEIGHTS,
  scoreProgramAlignment,
  scoreAssessmentReadiness,
  scoreCertifications,
  scoreCourseCompletion,
  scoreSkillsMatching,
} from '@/lib/ai/matchWeights';

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
  user2: '550e8400-e29b-41d4-a716-446655440002',
  job1: '550e8400-e29b-41d4-a716-446655440003',
  job2: '550e8400-e29b-41d4-a716-446655440004',
  job3: '550e8400-e29b-41d4-a716-446655440005',
  employer1: '550e8400-e29b-41d4-a716-446655440006',
  employer2: '550e8400-e29b-41d4-a716-446655440007',
};

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: UUIDS.job1,
    title: 'Software Engineer',
    location: 'Austin, TX',
    locationType: 'hybrid',
    status: 'live',
    suggestedPrograms: ['it-cyber'],
    requirements: ['javascript', 'react', 'node.js'],
    preferredCertifications: ['CompTIA A+'],
    employer: { companyName: 'TechCorp' },
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// GET /api/member/matched-jobs
// ─────────────────────────────────────────────
describe('GET /api/member/matched-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await getMatchedJobs(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when user record is not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await getMatchedJobs(new Request('http://localhost'));
    // Route now 404s when the app user row is missing (an authenticated
    // session without a user record is an inconsistency, not "no matches").
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('User not found');
  });

  it('returns matching jobs for authenticated member sorted by match score', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: 'it-cyber',
      assessmentScorePct: 85,
      memberProgramProgress: [
        { programSlug: 'it-cyber', averagePercent: 75, coursesCompleted: 4 },
      ],
      courseProgress: [
        { programSlug: 'it-cyber', courseSlug: 'course-1' },
        { programSlug: 'it-cyber', courseSlug: 'course-2' },
        { programSlug: 'it-cyber', courseSlug: 'course-3' },
        { programSlug: 'it-cyber', courseSlug: 'course-4' },
      ],
      userCertifications: [{ certName: 'CompTIA A+' }],
    } as any);

    vi.mocked(getProgramBySlug).mockReturnValue({
      slug: 'it-cyber',
      title: 'IT Support',
      skills: ['Help desk', 'Hardware', 'Software', 'Customer service'],
    } as any);

    // Job 1: perfect match (same program, has cert, 4 courses, high assessment)
    const job1 = makeJob({
      id: UUIDS.job1,
      title: 'IT Support Specialist',
      suggestedPrograms: ['it-cyber'],
      requirements: ['hardware', 'software', 'customer service'],
      preferredCertifications: ['comptia a+'],
      employer: { companyName: 'TechCorp' },
    });

    // Job 2: partial match (different program, no cert overlap)
    const job2 = makeJob({
      id: UUIDS.job2,
      title: 'Data Analyst',
      suggestedPrograms: ['cloud-data'],
      requirements: ['sql', 'python', 'statistics'],
      preferredCertifications: ['google data analytics'],
      employer: { companyName: 'DataInc' },
    });

    // Job 3: good match (same program, no cert required)
    const job3 = makeJob({
      id: UUIDS.job3,
      title: 'Help Desk Technician',
      suggestedPrograms: ['it-cyber'],
      requirements: ['customer service', 'troubleshooting'],
      preferredCertifications: [],
      employer: { companyName: 'SupportCo' },
    });

    vi.mocked(prisma.job.findMany).mockResolvedValue([job1, job2, job3] as any);

    const res = await getMatchedJobs(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.jobs).toHaveLength(3);
    // Highest match first
    expect(body.jobs[0].id).toBe(UUIDS.job1);
    expect(body.jobs[0].matchPct).toBeGreaterThan(body.jobs[1].matchPct);
    // Job 2 should have lowest score
    expect(body.jobs[2].id).toBe(UUIDS.job2);
    expect(body.jobs[2].matchPct).toBeLessThan(body.jobs[1].matchPct);
  });

  it('includes location and locationType in response', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      assessmentScorePct: null,
      memberProgramProgress: [],
      courseProgress: [],
      userCertifications: [],
    } as any);

    vi.mocked(getProgramBySlug).mockReturnValue(undefined);
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      makeJob({ id: UUIDS.job1, location: 'Austin, TX', locationType: 'onsite' }),
    ] as any);

    const res = await getMatchedJobs(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].location).toBe('Austin, TX');
    expect(body.jobs[0].locationType).toBe('onsite');
  });

  it('limits results to top 5 jobs', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: 'it-cyber',
      assessmentScorePct: 90,
      memberProgramProgress: [{ programSlug: 'it-cyber', averagePercent: 80, coursesCompleted: 5 }],
      courseProgress: Array.from({ length: 5 }, (_, i) => ({
        programSlug: 'it-cyber',
        courseSlug: `course-${i}`,
      })),
      userCertifications: [{ certName: 'CompTIA A+' }],
    } as any);

    vi.mocked(getProgramBySlug).mockReturnValue({
      slug: 'it-cyber',
      title: 'IT Support',
      skills: ['Help desk', 'Hardware', 'Software', 'Customer service'],
    } as any);

    // Create 8 identical jobs
    const manyJobs = Array.from({ length: 8 }, (_, i) =>
      makeJob({
        id: `job-${i}`,
        title: `Job ${i}`,
        suggestedPrograms: ['it-cyber'],
        requirements: ['hardware'],
        preferredCertifications: ['comptia a+'],
      })
    );

    vi.mocked(prisma.job.findMany).mockResolvedValue(manyJobs as any);

    const res = await getMatchedJobs(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(5);
  });

  it('fetches up to 50 live jobs from database', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: UUIDS.user,
      enrolledProgram: null,
      assessmentScorePct: null,
      memberProgramProgress: [],
      courseProgress: [],
      userCertifications: [],
    } as any);

    vi.mocked(getProgramBySlug).mockReturnValue(undefined);
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);

    await getMatchedJobs(new Request('http://localhost'));

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // The route now also filters expired postings and joins employer name.
        where: expect.objectContaining({ status: 'live' }),
        take: 50,
      })
    );
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB failure'));

    const res = await getMatchedJobs(new Request('http://localhost'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

// ─────────────────────────────────────────────
// GET /api/(portal)/dashboard/jobs/[id]
// ─────────────────────────────────────────────
describe('GET /api/(portal)/dashboard/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeRequest = (id: string): any =>
    new Request(`http://localhost:3000/api/dashboard/jobs/${id}`);

  it('returns job details for a live job', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({
      id: UUIDS.job1,
      title: 'Software Engineer',
      location: 'Austin, TX',
      locationType: 'hybrid',
      description: 'Build great software',
      status: 'live',
      employer: { companyName: 'TechCorp' },
    } as any);

    const res = await getJobDetail(makeRequest(UUIDS.job1), { params: Promise.resolve({ id: UUIDS.job1 }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(UUIDS.job1);
    expect(body.title).toBe('Software Engineer');
    expect(body.employer.companyName).toBe('TechCorp');
  });

  it('returns 404 for a missing job', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await getJobDetail(makeRequest('non-existent-id'), { params: Promise.resolve({ id: 'non-existent-id' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({ code: 'NOT_FOUND', message: 'Job not found' });
  });

  it('returns 404 for non-live jobs', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await getJobDetail(makeRequest(UUIDS.job1), { params: Promise.resolve({ id: UUIDS.job1 }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({ code: 'NOT_FOUND', message: 'Job not found' });

    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.job1, status: 'live' },
      })
    );
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(prisma.job.findFirst).mockRejectedValue(new Error('DB failure'));

    const res = await getJobDetail(makeRequest(UUIDS.job1), { params: Promise.resolve({ id: UUIDS.job1 }) });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

// ─────────────────────────────────────────────
// Job Match Scoring
// ─────────────────────────────────────────────
describe('MATCH_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum =
      MATCH_WEIGHTS.programAlignment +
      MATCH_WEIGHTS.assessmentReadiness +
      MATCH_WEIGHTS.certifications +
      MATCH_WEIGHTS.courseCompletion +
      MATCH_WEIGHTS.skillsMatching;
    expect(sum).toBeCloseTo(1.0, 3);
  });
});

describe('scoreProgramAlignment', () => {
  it('returns 1.0 when enrolled program matches suggested program', () => {
    const result = scoreProgramAlignment('it-cyber', new Set(['it-cyber', 'cloud-data']));
    expect(result.score).toBe(1);
    expect(result.reason).toContain('it-cyber');
  });

  it('returns 0.33 when enrolled but not in suggested list', () => {
    const result = scoreProgramAlignment('business', new Set(['it-cyber']));
    expect(result.score).toBe(0.33);
  });

  it('returns 0 when no enrolled program', () => {
    const result = scoreProgramAlignment(null, new Set(['it-cyber']));
    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });
});

describe('scoreAssessmentReadiness', () => {
  it('returns 1.0 for scores >= 70%', () => {
    expect(scoreAssessmentReadiness(85).score).toBe(1);
    expect(scoreAssessmentReadiness(70).score).toBe(1);
  });

  it('returns 0.5 for scores >= 50% and < 70%', () => {
    expect(scoreAssessmentReadiness(65).score).toBe(0.5);
    expect(scoreAssessmentReadiness(50).score).toBe(0.5);
  });

  it('returns 0.2 for scores < 50%', () => {
    expect(scoreAssessmentReadiness(49).score).toBe(0.2);
    expect(scoreAssessmentReadiness(10).score).toBe(0.2);
  });

  it('returns 0 when no assessment score', () => {
    expect(scoreAssessmentReadiness(null).score).toBe(0);
  });
});

describe('scoreCertifications', () => {
  it('returns 0 when job has no preferred certifications', () => {
    expect(scoreCertifications(['CompTIA A+'], []).score).toBe(0);
  });

  it('returns 1.0 when all preferred certs are matched', () => {
    const result = scoreCertifications(['CompTIA A+', 'Network+'], ['comptia a+', 'network+']);
    expect(result.score).toBe(1);
    expect(result.reason).toContain('comptia a+');
  });

  it('returns partial score for partial match', () => {
    const result = scoreCertifications(['CompTIA A+'], ['comptia a+', 'network+']);
    expect(result.score).toBe(0.5);
  });

  it('returns 0 when no certs match', () => {
    expect(scoreCertifications(['AWS'], ['comptia a+']).score).toBe(0);
  });

  it('matches via substring inclusion', () => {
    const result = scoreCertifications(['CompTIA A+ Certification'], ['comptia a+']);
    expect(result.score).toBe(1);
  });
});

describe('scoreCourseCompletion', () => {
  it('returns 1.0 for 3+ completed courses', () => {
    expect(scoreCourseCompletion(['c1', 'c2', 'c3']).score).toBe(1);
    expect(scoreCourseCompletion(['c1', 'c2', 'c3', 'c4']).score).toBe(1);
  });

  it('returns 0.33 for 1-2 completed courses', () => {
    expect(scoreCourseCompletion(['c1']).score).toBe(0.33);
    expect(scoreCourseCompletion(['c1', 'c2']).score).toBe(0.33);
  });

  it('returns 0 for no completed courses', () => {
    expect(scoreCourseCompletion([]).score).toBe(0);
    expect(scoreCourseCompletion(null).score).toBe(0);
  });
});

describe('scoreSkillsMatching', () => {
  it('returns 0 when job has no requirements', () => {
    expect(scoreSkillsMatching([], ['javascript', 'react']).score).toBe(0);
  });

  it('boosts score for exact skill matches', () => {
    const result = scoreSkillsMatching(
      ['javascript programming', 'react development'],
      ['javascript', 'react', 'node.js']
    );
    expect(result.score).toBe(1);
    expect(result.reason).toContain('javascript');
  });

  it('returns partial score for partial skill matches', () => {
    const result = scoreSkillsMatching(
      ['javascript programming', 'python development', 'sql queries'],
      ['javascript', 'react']
    );
    expect(result.score).toBeCloseTo(1 / 3, 2);
  });

  it('returns 0 when no skills match', () => {
    expect(scoreSkillsMatching(['python', 'django'], ['javascript', 'react']).score).toBe(0);
  });

  it('matches via word-level substring inclusion', () => {
    const result = scoreSkillsMatching(
      ['customer service experience'],
      ['help desk', 'customer service']
    );
    expect(result.score).toBe(1);
  });
});
