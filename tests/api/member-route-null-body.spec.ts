// @vitest-environment node
/**
 * Follow-up to tests/api/member-route-malformed-input.spec.ts (#2356).
 *
 * These member-facing routes already answered a body that is not JSON with a
 * 400, but the JSON literal `null` (and other non-object JSON such as `[]`)
 * passed `request.json()` and threw on the first property read, which the
 * generic catch turned into a 500. Each route now reads its body through
 * `readJsonObjectBody` (lib/api/readJsonBody.ts).
 *
 * For every route there is (a) a non-object body case that failed with a 500
 * before the fix and (b) an object-body case that reaches the route's own
 * next check with the response it produced before the change.
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
  cookies: vi.fn(async () => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
  headers: vi.fn(async () => new Headers()),
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
    $executeRaw: vi.fn(async () => 1),
    profile: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
    user: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
    memberEvent: { create: vi.fn(async () => ({ id: 'evt-1' })), findFirst: vi.fn(async () => null) },
    courseEnrollment: { findUnique: vi.fn(async () => null) },
    invitation: { findFirst: vi.fn(async () => null) },
    aIToolResult: { create: vi.fn(async () => ({ id: 'r-1' })) },
  },
}));

vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => undefined) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
  checkInviteAcceptRateLimit: vi.fn(async () => ({ success: true })),
  checkResumeDraftSaveRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/email', () => ({
  sendVoiceInterviewTranscriptEmail: vi.fn(async () => undefined),
  sendCourseEnrolledEmail: vi.fn(async () => undefined),
  sendInvitationAcceptedEmail: vi.fn(async () => undefined),
  getVoiceCoachTranscriptRecipients: vi.fn(async () => []),
  sendVoiceCoachTranscriptEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn(() => ({ storage: { from: vi.fn() } })) }));
vi.mock('@/lib/ai/groq', () => ({ chatCompletion: vi.fn(), isAIConfigured: () => false }));
vi.mock('@/lib/ai/anthropicChat', () => ({ claudeChat: vi.fn(), isAnthropicConfigured: () => false }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: vi.fn(async () => ({ id: 'r-1' })) }));
vi.mock('@/lib/coach/memory', () => ({ updateCoachMemory: vi.fn(async () => undefined) }));
vi.mock('@/lib/messages/rateLimit', () => ({ checkMessageRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/coursera/b4bClient', () => ({ getB4BOrgId: vi.fn(() => 'b4b-org') }));
vi.mock('@/lib/coursera/enrollPort', () => ({ buildB4BPort: vi.fn(), writeEnrollAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn(async (_org: string, fn: (db: unknown) => unknown) => fn({})) }));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
  getDefaultOrganizationId: vi.fn(async () => 'org-1'),
}));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({ tryResolveOrgFromRequest: vi.fn(async () => null) }));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: vi.fn(() => '127.0.0.1') }));
vi.mock('@/lib/auth/supabaseAdminUsers', () => ({ findSupabaseAuthUserByEmail: vi.fn(async () => null) }));
vi.mock('@/lib/member/getMemberResumePlainText', () => ({ getMemberResumePlainText: vi.fn(async () => null) }));
vi.mock('@/lib/member/getMemberState', () => ({ invalidateMemberState: vi.fn(async () => undefined) }));
vi.mock('@/lib/platform/programCatalog', () => ({
  getActivePrograms: vi.fn(async () => []),
  isProgramSlugActiveInCatalog: vi.fn(() => false),
}));
vi.mock('@/lib/workflows/completeCareerOsActions', () => ({
  completeCareerOsResumeActions: vi.fn(async () => undefined),
  completeCareerOsInterviewActions: vi.fn(async () => undefined),
}));

import { PATCH as gdprConsent } from '@/app/api/gdpr/consent/route';
import { POST as interviewHistory } from '@/app/api/interview/history/route';
import { POST as inviteAccept } from '@/app/api/invite/accept/route';
import { POST as coachCompletion } from '@/app/api/member/career-business-coach/completion/route';
import { POST as courseraEnroll } from '@/app/api/member/coursera/enroll-in-course/route';
import { POST as courseComplete } from '@/app/api/member/courses/complete/route';
import { POST as memberEnroll } from '@/app/api/member/enroll/route';
import { POST as linkedinEnrich } from '@/app/api/member/linkedin-enrich/route';
import { POST as memberMessages } from '@/app/api/member/messages/route';
import { POST as pitchDeployments } from '@/app/api/member/pitch-deployments/route';
import { PATCH as memberSettings } from '@/app/api/member/settings/route';
import { POST as resumeGenerate } from '@/app/api/member/resume/generate/route';
import { POST as resumePlainText } from '@/app/api/member/resume/plain-text/route';
import { POST as parseSuggestions } from '@/app/api/member/resume-coach/parse-suggestions/route';
import { POST as voiceRecording } from '@/app/api/member/voice-interview/recording/route';
import { POST as voiceTranscript } from '@/app/api/member/voice-interview/transcript/route';
import { POST as voiceCheckpoint } from '@/app/api/member/voice-session/checkpoint/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';

const MEMBER = { id: 'member-1', email: 'member@example.test', created_at: '2026-01-01T00:00:00Z' };

type Handler = (req: any) => Promise<Response>;

function jsonRequest(url: string, method: string, body: string) {
  return new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body });
}

async function readJson(res: Response) {
  expect(res.headers.get('content-type') ?? '').toContain('application/json');
  return res.json() as Promise<Record<string, unknown>>;
}

const NON_OBJECT_BODIES: Array<[string, string]> = [
  ['the JSON literal null', 'null'],
  ['a JSON array', '[]'],
  ['a JSON string', '"text"'],
];

interface RouteCase {
  name: string;
  handler: Handler;
  method: string;
  url: string;
  /** Expected answer to a non-object body after the fix (500 before). */
  nonObject: { status: number; error?: string };
  /** An object body that reaches the route's own next check, with the response master already gave it. */
  object: { body: Record<string, unknown>; status: number; error?: string; json?: Record<string, unknown> };
  /** Prisma write that must not run for a non-object body. */
  write?: () => { mock: { calls: unknown[][] } };
}

const RESUME_TEXT = [
  'Jordan Williams - Austin, TX - jordan@example.test',
  'Professional summary: IT support specialist with four years of experience resolving hardware,',
  'software and network issues for offices of up to 200 staff.',
  'Experience: Help Desk Technician, Example Corp, 2022-2026. Triaged 40+ tickets a week,',
  'imaged laptops, administered Microsoft 365 accounts and documented fixes in the knowledge base.',
  'Education: Associate of Applied Science, Austin Community College, 2021.',
  'Certifications: CompTIA A+, Google IT Support Professional Certificate.',
].join('\n');

const ROUTES: RouteCase[] = [
  {
    name: 'PATCH /api/gdpr/consent',
    handler: gdprConsent, method: 'PATCH', url: '/api/gdpr/consent',
    // Bad JSON already read as `{}` here, so a non-object body gets the same field error.
    nonObject: { status: 400, error: 'consentCommunications required' },
    object: { body: { consentCommunications: true }, status: 200 },
    write: () => prisma.profile.update as any,
  },
  {
    name: 'POST /api/interview/history',
    handler: interviewHistory, method: 'POST', url: '/api/interview/history',
    nonObject: { status: 400, error: 'Invalid JSON body' },
    object: { body: {}, status: 400, error: 'sessionId is required' },
  },
  {
    name: 'POST /api/invite/accept',
    handler: inviteAccept, method: 'POST', url: '/api/invite/accept',
    nonObject: { status: 400, error: 'Invalid request body' },
    object: { body: {}, status: 400, error: 'Invalid or missing token' },
    write: () => prisma.invitation.findFirst as any,
  },
  {
    name: 'POST /api/member/career-business-coach/completion',
    handler: coachCompletion, method: 'POST', url: '/api/member/career-business-coach/completion',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 200, json: { ok: true, skipped: true } },
  },
  {
    name: 'POST /api/member/coursera/enroll-in-course',
    handler: courseraEnroll, method: 'POST', url: '/api/member/coursera/enroll-in-course',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'courseraCourseId required' },
  },
  {
    name: 'POST /api/member/courses/complete',
    handler: courseComplete, method: 'POST', url: '/api/member/courses/complete',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'courseSlug is required' },
  },
  {
    name: 'POST /api/member/enroll',
    handler: memberEnroll, method: 'POST', url: '/api/member/enroll',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'programSlug is required' },
  },
  {
    name: 'POST /api/member/linkedin-enrich',
    handler: linkedinEnrich, method: 'POST', url: '/api/member/linkedin-enrich',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'Provide a valid LinkedIn profile URL' },
  },
  {
    name: 'POST /api/member/messages',
    handler: memberMessages, method: 'POST', url: '/api/member/messages',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'Message cannot be empty' },
  },
  {
    name: 'POST /api/member/pitch-deployments',
    handler: pitchDeployments, method: 'POST', url: '/api/member/pitch-deployments',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'employer is required' },
    write: () => prisma.memberEvent.create as any,
  },
  {
    name: 'PATCH /api/member/settings',
    handler: memberSettings, method: 'PATCH', url: '/api/member/settings',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'No valid fields to update' },
    write: () => prisma.user.update as any,
  },
  {
    name: 'POST /api/member/resume/generate',
    handler: resumeGenerate, method: 'POST', url: '/api/member/resume/generate',
    // The body is optional here and bad JSON already read as "no body"; a
    // non-object body now does the same and reaches the AI-configured check.
    nonObject: { status: 503 },
    object: { body: { resumeBase: RESUME_TEXT, resumeRevision: 'stale-revision' }, status: 409, error: 'Your resume changed in another session. Reload and try again.' },
  },
  {
    name: 'POST /api/member/resume/plain-text',
    handler: resumePlainText, method: 'POST', url: '/api/member/resume/plain-text',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400 },
    write: () => prisma.profile.update as any,
  },
  {
    name: 'POST /api/member/resume-coach/parse-suggestions',
    handler: parseSuggestions, method: 'POST', url: '/api/member/resume-coach/parse-suggestions',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 200, json: { suggestions: [] } },
  },
  {
    name: 'POST /api/member/voice-interview/recording',
    handler: voiceRecording, method: 'POST', url: '/api/member/voice-interview/recording',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 400, error: 'Invalid action' },
  },
  {
    name: 'POST /api/member/voice-interview/transcript',
    handler: voiceTranscript, method: 'POST', url: '/api/member/voice-interview/transcript',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 200, json: { ok: true, skipped: true } },
  },
  {
    name: 'POST /api/member/voice-session/checkpoint',
    handler: voiceCheckpoint, method: 'POST', url: '/api/member/voice-session/checkpoint',
    nonObject: { status: 400, error: 'Invalid JSON' },
    object: { body: {}, status: 200, json: { ok: true, saved: false, reason: 'empty' } },
  },
];

describe('member-facing routes answer a non-object JSON body with a JSON 4xx, not a 500', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(MEMBER as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: MEMBER.id, email: MEMBER.email, fullName: 'Jordan Williams', phone: null, enrolledProgram: null, profile: null,
    } as any);
  });

  describe.each(ROUTES.map((r) => [r.name, r] as const))('%s', (_name, route) => {
    it.each(NON_OBJECT_BODIES)('answers %s with a JSON error body and writes nothing', async (_label, body) => {
      const res = await route.handler(jsonRequest(route.url, route.method, body));
      expect(res.status).toBe(route.nonObject.status);
      expect(res.status).not.toBe(500);
      const payload = await readJson(res);
      expect(typeof payload.error).toBe('string');
      if (route.nonObject.error) expect(payload.error).toBe(route.nonObject.error);
      if (route.write) expect(route.write()).not.toHaveBeenCalled();
    });

    it('still passes an object body through to its own validation', async () => {
      const res = await route.handler(jsonRequest(route.url, route.method, JSON.stringify(route.object.body)));
      expect(res.status).toBe(route.object.status);
      const payload = await readJson(res);
      if (route.object.error) expect(payload.error).toBe(route.object.error);
      if (route.object.json) expect(payload).toEqual(route.object.json);
      if (route.object.status < 400) expect(payload.error).toBeUndefined();
    });
  });

  it('PATCH /api/gdpr/consent still persists a boolean consent value', async () => {
    const res = await gdprConsent(jsonRequest('/api/gdpr/consent', 'PATCH', JSON.stringify({ consentCommunications: false })));
    expect(res.status).toBe(200);
    expect(prisma.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MEMBER.id }, data: { consentCommunications: false } }),
    );
  });

  it('PATCH /api/member/settings still persists notification settings', async () => {
    const res = await memberSettings(jsonRequest('/api/member/settings', 'PATCH', JSON.stringify({ notificationsUpdates: true })));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER.id }, data: { notificationsUpdates: true } }),
    );
  });
});
