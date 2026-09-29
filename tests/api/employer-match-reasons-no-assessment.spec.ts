/**
 * Employers never receive a member's assessment score in match reasons
 * (lib/employer/matchReasons.ts; Mike, Slack 2026-09-23 05:08 UTC).
 *
 * - The matcher no longer writes "Assessment score NN%" into the stored,
 *   employer-visible `matchReasons`, and the score still counts with the
 *   same weight.
 * - The employer matches API (GET list, PATCH status) strips the line from
 *   rows stored before this change.
 * - The admin payload keeps the score, in the staff-only `staffReasons`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  withApiGuc: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  getEmployerForUser: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: vi.fn(() => null) }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    user: { findMany: vi.fn() },
    job: { findFirst: vi.fn() },
    aIJobMatch: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { GET as listMatches } from '@/app/api/employer/jobs/[id]/matches/route';
import { PATCH as patchMatch } from '@/app/api/employer/jobs/[id]/matches/[studentId]/route';
import { serializeAdminJobMatchRow } from '@/lib/admin/runAdminJobMatchesGet';
import { matchStudentsForJob } from '@/lib/ai/matchStudents';
import { MATCH_WEIGHTS, scoreAssessmentReadiness } from '@/lib/ai/matchWeights';
import { getEmployerForUser } from '@/lib/auth/roles';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { employerVisibleMatchReasons } from '@/lib/employer/matchReasons';

const jobId = '550e8400-e29b-41d4-a716-446655440003';
const studentId = '550e8400-e29b-41d4-a716-446655440004';

/** A row written before 2026-09-23: the stored reasons still carry the score. */
const LEGACY_ROW = {
  id: 'match-1',
  jobId,
  studentId,
  matchScore: 62,
  matchReasons: ['Enrolled in suggested program: google-it-support', 'Assessment score 85%', '3 courses completed'],
  status: 'suggested',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  statusUpdatedAt: null,
  student: { id: studentId, fullName: 'Test Member', email: 'member@example.test' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'employer-user' } as never);
  vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'employer-1' } as never);
  vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: jobId, title: 'Help Desk' } as never);
});

describe('matcher output (stored, employer-visible reasons)', () => {
  it('gives no reason text for the assessment but keeps its score', () => {
    expect(scoreAssessmentReadiness(85)).toEqual({ score: 1, reason: null });
    expect(scoreAssessmentReadiness(55)).toEqual({ score: 0.5, reason: null });
    expect(scoreAssessmentReadiness(20)).toEqual({ score: 0.2, reason: null });
    expect(MATCH_WEIGHTS.assessmentReadiness).toBe(0.2);
  });

  it('writes no "Assessment score" into matchReasons, and the score still counts', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: studentId,
        enrolledProgram: 'google-it-support',
        assessmentScorePct: 85,
        memberProgramProgress: [],
        courseProgress: [],
        userCertifications: [],
        profile: null,
      },
    ] as never);

    const [match] = await matchStudentsForJob('org-1', {
      requirements: [],
      suggestedPrograms: ['google-it-support'],
      preferredCertifications: [],
    });

    expect(JSON.stringify(match)).not.toContain('Assessment score');
    // programAlignment 0.35 * 1 + assessmentReadiness 0.2 * 1 = 55.
    expect(match.matchScore).toBe(55);
  });
});

describe('employer matches API', () => {
  it('GET list strips the assessment line from legacy stored rows', async () => {
    vi.mocked(prisma.aIJobMatch.findMany).mockResolvedValue([LEGACY_ROW] as never);

    const res = await listMatches(new Request('http://localhost/api') as never, {
      params: Promise.resolve({ id: jobId }),
    });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain('Assessment score');
    expect(JSON.parse(text).matches[0].matchReasons).toEqual([
      'Enrolled in suggested program: google-it-support',
      '3 courses completed',
    ]);
  });

  it('PATCH status response strips the assessment line from a legacy row', async () => {
    vi.mocked(prisma.aIJobMatch.findFirst).mockResolvedValue(LEGACY_ROW as never);
    vi.mocked(prisma.aIJobMatch.update).mockResolvedValue({ ...LEGACY_ROW, status: 'contacted' } as never);

    const res = await patchMatch(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'contacted' }),
      }) as never,
      { params: Promise.resolve({ id: jobId, studentId }) },
    );
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain('Assessment score');
    expect(JSON.parse(text).matchReasons).toHaveLength(2);
  });
});

describe('admin payload keeps the score as a staff-only field', () => {
  it('moves the assessment into staffReasons and out of matchReasons', () => {
    const row = serializeAdminJobMatchRow({
      studentId,
      matchScore: 62,
      matchReasons: LEGACY_ROW.matchReasons,
      status: 'suggested',
      student: {
        id: studentId,
        fullName: 'Test Member',
        email: 'member@example.test',
        enrolledProgram: 'google-it-support',
        assessmentScorePct: 85,
        profile: null,
        userCertifications: [],
      },
    });

    expect(row.staffReasons).toEqual(['Assessment score 85%']);
    expect(row.matchReasons).not.toContain('Assessment score 85%');
  });

  it('has no staff line when the member has no assessment', () => {
    const row = serializeAdminJobMatchRow({
      studentId,
      matchScore: 35,
      matchReasons: ['Enrolled in google-it-support'],
      status: 'suggested',
      student: {
        id: studentId,
        fullName: 'Test Member',
        email: 'member@example.test',
        enrolledProgram: 'google-it-support',
        assessmentScorePct: null,
        profile: null,
        userCertifications: [],
      },
    });
    expect(row.staffReasons).toEqual([]);
    expect(employerVisibleMatchReasons(null)).toEqual([]);
  });
});
