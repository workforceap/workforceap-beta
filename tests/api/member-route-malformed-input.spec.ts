// @vitest-environment node
/**
 * Member-facing API routes must answer malformed or unexpected input with a
 * JSON `{ error }` body and a 4xx status, never an unhandled throw that the
 * generic catch turns into a 500. The member portal (see
 * lib/http/requestFailureCopy) now shows "couldn't connect" copy for anything
 * it cannot read, so a 500 here hides the real cause from the member.
 *
 * Each case below failed against the route before its fix:
 *  - GET  /api/gdpr/export             500: `ai_job_matches` has no `user_id` column
 *  - POST /api/mentors/[id]/sessions   500 on bad JSON, `null`, empty date, wrong types, unknown mentor
 *  - POST /api/mentors/apply           500 on wrong field types
 *  - POST /api/member/job-applications 500 on a body that is not JSON
 *  - POST /api/ai/export-pdf           500 on a body that is not JSON / not an object
 *  - POST /api/ai/interview-voice      500 on a body that is not JSON / not an object
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse, after: (fn: () => unknown) => void fn() };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    $queryRaw: vi.fn(async () => []),
    profile: { findUnique: vi.fn(async () => null) },
    mentor: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    mentorSession: { create: vi.fn() },
    jobApplication: { create: vi.fn() },
  },
}));

vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => undefined) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/applicationAiFeedback', () => ({
  findRecentAiToolsForApplicationFeedback: vi.fn(async () => []),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkAIToolRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/ai/elevenlabs', () => ({ generateSpeech: vi.fn() }));

import { GET as gdprExport } from '@/app/api/gdpr/export/route';
import { POST as createMentorSession } from '@/app/api/mentors/[id]/sessions/route';
import { POST as applyAsMentor } from '@/app/api/mentors/apply/route';
import { POST as createJobApplication } from '@/app/api/member/job-applications/route';
import { POST as exportPdf } from '@/app/api/ai/export-pdf/route';
import { POST as interviewVoice } from '@/app/api/ai/interview-voice/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { generateSpeech } from '@/lib/ai/elevenlabs';

const MEMBER = { id: 'member-1', email: 'member@example.test', created_at: '2026-01-01T00:00:00Z' };
const MENTOR_ID = 'mentor-1';

function jsonRequest(url: string, method: string, body: string, contentType = 'application/json') {
  return new Request(`http://localhost${url}`, { method, headers: { 'content-type': contentType }, body });
}

async function readJson(res: Response) {
  expect(res.headers.get('content-type') ?? '').toContain('application/json');
  return res.json() as Promise<Record<string, unknown>>;
}

const mentorParams = { params: Promise.resolve({ id: MENTOR_ID }) };

describe('member-facing routes answer malformed input with JSON 4xx bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(MEMBER as any);
  });

  describe('GET /api/gdpr/export', () => {
    it('reads ai_job_matches by student_id and returns the export as JSON', async () => {
      const res = await gdprExport(new Request('http://localhost/api/gdpr/export') as any);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(Array.isArray(body.aiJobMatches)).toBe(true);

      const rawSql = vi.mocked(prisma.$queryRaw).mock.calls.map((call) => (call[0] as TemplateStringsArray).join('?'));
      const aiJobMatchQuery = rawSql.find((sql) => sql.includes('FROM ai_job_matches'));
      expect(aiJobMatchQuery).toBeDefined();
      expect(aiJobMatchQuery).toContain('WHERE student_id = ?');
      expect(aiJobMatchQuery).not.toContain('user_id');
    });
  });

  describe('POST /api/mentors/[id]/sessions', () => {
    beforeEach(() => {
      vi.mocked(prisma.mentor.findFirst).mockResolvedValue({ id: MENTOR_ID } as any);
      vi.mocked(prisma.mentorSession.create).mockResolvedValue({ id: 'session-1' } as any);
    });

    it.each([
      ['a body that is not JSON', '{bad'],
      ['a JSON null body', 'null'],
      ['an empty scheduledAt (form submitted before a date was picked)', JSON.stringify({ scheduledAt: '', topic: 'x' })],
      ['an unparseable scheduledAt', JSON.stringify({ scheduledAt: 'next tuesday', topic: 'x' })],
      ['a durationMin of the wrong type', JSON.stringify({ scheduledAt: '2026-10-01T10:00', durationMin: '30' })],
    ])('answers %s with a 400 JSON error and writes nothing', async (_label, body) => {
      const res = await createMentorSession(jsonRequest(`/api/mentors/${MENTOR_ID}/sessions`, 'POST', body) as any, mentorParams);
      expect(res.status).toBe(400);
      const payload = await readJson(res);
      expect(typeof payload.error).toBe('string');
      expect(prisma.mentorSession.create).not.toHaveBeenCalled();
    });

    it('answers an unknown or inactive mentor with 404 instead of a foreign-key failure', async () => {
      vi.mocked(prisma.mentor.findFirst).mockResolvedValue(null);
      const res = await createMentorSession(
        jsonRequest(`/api/mentors/${MENTOR_ID}/sessions`, 'POST', JSON.stringify({ scheduledAt: '2026-10-01T10:00', topic: 'x' })) as any,
        mentorParams,
      );
      expect(res.status).toBe(404);
      expect((await readJson(res)).error).toBe('Mentor not found');
      expect(prisma.mentorSession.create).not.toHaveBeenCalled();
    });

    it('still books a session for a valid request, scoped to the signed-in member', async () => {
      const res = await createMentorSession(
        jsonRequest(`/api/mentors/${MENTOR_ID}/sessions`, 'POST', JSON.stringify({ scheduledAt: '2026-10-01T10:00', topic: 'Resume review' })) as any,
        mentorParams,
      );
      expect(res.status).toBe(201);
      expect(prisma.mentor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: MENTOR_ID, isActive: true }) }),
      );
      const created = vi.mocked(prisma.mentorSession.create).mock.calls[0][0] as any;
      expect(created.data.memberId).toBe(MEMBER.id);
      expect(created.data.mentorId).toBe(MENTOR_ID);
      expect(created.data.scheduledAt).toBeInstanceOf(Date);
      expect(Number.isNaN(created.data.scheduledAt.getTime())).toBe(false);
      expect(created.data.durationMin).toBe(30);
      expect(created.data.topic).toBe('Resume review');
      expect(created.data.notes).toBeNull();
    });
  });

  describe('POST /api/mentors/apply', () => {
    it('answers wrong field types with a 400 JSON error and writes nothing', async () => {
      const res = await applyAsMentor(
        jsonRequest('/api/mentors/apply', 'POST', JSON.stringify({ fullName: 1, title: 't', company: 'c', industry: 'i', bio: 'b', availableHours: 'lots' })) as any,
      );
      expect(res.status).toBe(400);
      expect(typeof (await readJson(res)).error).toBe('string');
      expect(prisma.mentor.create).not.toHaveBeenCalled();
    });

    it('answers a JSON null body with a 400 JSON error', async () => {
      const res = await applyAsMentor(jsonRequest('/api/mentors/apply', 'POST', 'null') as any);
      expect(res.status).toBe(400);
      expect(typeof (await readJson(res)).error).toBe('string');
    });

    it('still files a valid application for the signed-in user', async () => {
      vi.mocked(prisma.mentor.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.mentor.create).mockResolvedValue({ id: 'mentor-2' } as any);
      const res = await applyAsMentor(
        jsonRequest('/api/mentors/apply', 'POST', JSON.stringify({ fullName: 'Pat Mentor', title: 'Engineer', company: 'Acme', industry: 'Technology', bio: 'I mentor.', linkedinUrl: '', availableHours: 2 })) as any,
      );
      expect(res.status).toBe(200);
      const created = vi.mocked(prisma.mentor.create).mock.calls[0][0] as any;
      expect(created.data).toMatchObject({ userId: MEMBER.id, fullName: 'Pat Mentor', linkedinUrl: null, availableHours: 2, isActive: false });
    });
  });

  describe('POST /api/member/job-applications', () => {
    it('answers a body that is not JSON with a 400 instead of "Failed to create application"', async () => {
      const res = await createJobApplication(jsonRequest('/api/member/job-applications', 'POST', '{bad') as any);
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toBe('Invalid data');
      expect(prisma.jobApplication.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/ai/export-pdf', () => {
    it.each([
      ['a body that is not JSON', '{bad'],
      ['a JSON null body', 'null'],
      ['a JSON array body', '[]'],
    ])('answers %s with a 400 JSON error', async (_label, body) => {
      const res = await exportPdf(jsonRequest('/api/ai/export-pdf', 'POST', body) as any);
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toBe('Invalid body');
    });
  });

  describe('POST /api/ai/interview-voice', () => {
    it.each([
      ['a body that is not JSON', '{bad'],
      ['a JSON null body', 'null'],
    ])('answers %s with a 400 JSON error and never calls the speech provider', async (_label, body) => {
      const res = await interviewVoice(jsonRequest('/api/ai/interview-voice', 'POST', body) as any);
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toBe('Invalid JSON body');
      expect(generateSpeech).not.toHaveBeenCalled();
    });
  });
});
