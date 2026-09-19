// @vitest-environment node
/**
 * Public (no-session) API routes: malformed bodies and upstream failures.
 *
 * Companion to tests/api/member-route-null-body.spec.ts (#2359). Two kinds of
 * defect, each handler invoked directly with mocked dependencies:
 *
 * 1. A JSON body that parses but is not an object (`null`, `[]`, `"text"`)
 *    passed `request.json()` and threw on the first property read, which the
 *    generic catch turned into a 500. The routes now read through
 *    `readJsonObjectBody` and answer 400 like they already did for bad JSON.
 * 2. Error bodies echoed the raw text of an upstream exception (Stripe
 *    signature error / missing webhook secret, the mail provider, O*NET's
 *    response body) to an unauthenticated caller. They now answer with a
 *    stable message and keep the detail in the server log.
 *
 * Every case pairs the previously-broken input with a well-formed request
 * that still reaches the route's own next check.
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
  withSystemGuc: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(async () => null),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    application: { findFirst: vi.fn(async () => ({ id: 'app-1' })) },
    placementSurvey: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    employer: { findFirst: vi.fn(async () => null) },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkPlacementSurveyRateLimit: vi.fn(async () => ({ success: true })),
  checkAuthRateLimit: vi.fn(async () => ({ success: true })),
  checkVerifyMfaRateLimit: vi.fn(async () => ({ success: true })),
  checkConfirmationEmailRateLimit: vi.fn(async () => ({ success: true })),
  checkConfirmationEmailEmailRateLimit: vi.fn(async () => ({ success: true })),
  checkPublicInterestProfilerRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: vi.fn(() => '127.0.0.1') }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/auth/mfaConfig', () => ({ isStaffMfaEnforcementEnabled: vi.fn(() => true) }));
vi.mock('@/lib/auth/mfaTrust', () => ({
  getAdminMfaTrustCookieName: vi.fn(() => 'mfa-trust'),
  getAdminMfaTrustCookieOptions: vi.fn(() => ({})),
  issueAdminMfaTrustToken: vi.fn(async () => 'token'),
}));
vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: vi.fn(() => ({ url: 'http://supabase.test', anonKey: 'anon' })) }));
vi.mock('@/lib/supabaseCookieOptions', () => ({ getSupabaseCookieOptions: vi.fn(() => ({})) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => { throw new Error('createServerClient must not be reached'); }) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/security/placementSurveyToken', () => ({
  verifyPlacementSurveyToken: vi.fn(async () => ({ ok: false, reason: 'invalid' })),
}));
vi.mock('@/lib/member/counselorEscalation', () => ({ escalateToCounselor: vi.fn(async () => undefined) }));

const stripeState = { secretError: null as string | null, constructError: 'No signatures found matching the expected signature for payload.' };
vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error(stripeState.constructError);
      }),
    },
    subscriptions: { retrieve: vi.fn() },
  })),
  getStripeWebhookSecret: vi.fn(() => {
    if (stripeState.secretError) throw new Error(stripeState.secretError);
    return 'whsec_test';
  }),
}));
vi.mock('@/lib/stripe/subscriptionPersistence', () => ({ reconcileEmployerSubscription: vi.fn() }));
vi.mock('@/lib/stripe/stripeSubscriptionSnapshot', () => ({ canonicalSubscriptionSnapshot: vi.fn(), stripeObjectId: vi.fn() }));

const PROVIDER_ERROR = 'Resend 422: API key re_live_abc123 is not authorised for domain example.test';
vi.mock('@/lib/email', () => ({
  sendApplicationConfirmationEmail: vi.fn(async () => ({ ok: false, error: PROVIDER_ERROR })),
}));

const ONET_ERROR = 'O*NET request failed: 502 <html><body>upstream gateway error at 10.0.0.7</body></html>';
vi.mock('@/lib/onet/client', () => ({ isOnetConfigured: vi.fn(() => true) }));
vi.mock('@/lib/onet/interestProfiler', () => ({
  fetchAllMiniIpQuestions: vi.fn(async () => { throw new Error(ONET_ERROR); }),
  getInterestProfilerResults: vi.fn(async () => { throw new Error(ONET_ERROR); }),
  getInterestProfilerCareers: vi.fn(async () => ({ career: [], total: 0 })),
}));
vi.mock('@/lib/onet/interestProfilerCareerFallback', () => ({ applyRiasecCareerFallback: vi.fn((rows: unknown[]) => rows) }));
vi.mock('@/lib/content/quizIpMerge', () => ({ riasecFromResultRows: vi.fn(() => ({})) }));
vi.mock('@/lib/onet/ipMapToPrograms', () => ({ mapIpCareerRowsToProgramSlugs: vi.fn(async () => []) }));
vi.mock('@/lib/career/careerQuizRules', () => ({ areaScoresToOnetAnswers: vi.fn(() => '3'.repeat(30)) }));
vi.mock('@/lib/career/careerQuizAreas', () => ({ getMiniIpAreaOrder: vi.fn(async () => ['R', 'I', 'A', 'S', 'E', 'C']) }));

import { POST as placementSurvey } from '@/app/api/placement-survey/route';
import { PATCH as setupMfaConfirm } from '@/app/api/auth/setup-mfa/route';
import { POST as verifyMfa } from '@/app/api/auth/verify-mfa/route';
import { POST as employerWebhook } from '@/app/api/employer/webhook/route';
import { POST as confirmationEmail } from '@/app/api/apply/confirmation-email/route';
import { GET as profilerQuestions } from '@/app/api/public/interest-profiler/questions/route';
import { POST as profilerScore } from '@/app/api/public/interest-profiler/score/route';
import { POST as careerQuizScore } from '@/app/api/public/career-quiz/score/route';

type Handler = (req: any) => Promise<Response>;

// Handlers are typed against NextRequest; the mocked next/server makes a plain
// Request sufficient at runtime, so the helper is typed loosely on purpose.
function jsonRequest(url: string, method: string, body: string, headers: Record<string, string> = {}): any {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stripeState.secretError = null;
});

describe('non-object JSON bodies answer 400, not 500', () => {
  const cases: Array<{ name: string; url: string; method: string; handler: Handler; error: string; wellFormed: string }> = [
    {
      name: 'POST /api/placement-survey',
      url: '/api/placement-survey',
      method: 'POST',
      handler: placementSurvey,
      error: 'Invalid JSON body',
      wellFormed: '{"jobSatisfaction":4}',
    },
    {
      name: 'PATCH /api/auth/setup-mfa',
      url: '/api/auth/setup-mfa',
      method: 'PATCH',
      handler: setupMfaConfirm,
      error: 'Factor ID and code are required.',
      wellFormed: '{"factorId":"f1"}',
    },
    {
      name: 'POST /api/auth/verify-mfa',
      url: '/api/auth/verify-mfa',
      method: 'POST',
      handler: verifyMfa,
      error: 'Please enter your 6-digit verification code.',
      wellFormed: '{"trustDevice":true}',
    },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      for (const [label, raw] of NON_OBJECT_BODIES) {
        it(`returns 400 for ${label}`, async () => {
          const res = await c.handler(jsonRequest(c.url, c.method, raw));
          expect(res.status).toBe(400);
          const body = await readJson(res);
          expect(body.error).toBe(c.error);
        });
      }

      it('returns 400 for malformed JSON', async () => {
        const res = await c.handler(jsonRequest(c.url, c.method, '{not json'));
        expect(res.status).toBe(400);
      });

      it('still reaches the required-field check for an object without the fields', async () => {
        const res = await c.handler(jsonRequest(c.url, c.method, c.wellFormed));
        expect(res.status).toBe(400);
        const body = await readJson(res);
        expect(typeof body.error).toBe('string');
      });
    });
  }

  it('POST /api/placement-survey still rejects an object whose token is not a string', async () => {
    const res = await placementSurvey(jsonRequest('/api/placement-survey', 'POST', '{"token":42}'));
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('Missing token');
  });
});

describe('error bodies do not echo upstream exception text', () => {
  it('POST /api/employer/webhook: Stripe signature failure is a generic 400', async () => {
    const res = await employerWebhook(jsonRequest('/api/employer/webhook', 'POST', '{}', { 'stripe-signature': 'bad' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe('Webhook signature verification failed');
    expect(JSON.stringify(body)).not.toContain('No signatures found');
  });

  it('POST /api/employer/webhook: a missing STRIPE_WEBHOOK_SECRET is not disclosed', async () => {
    stripeState.secretError = 'STRIPE_WEBHOOK_SECRET is not configured';
    const res = await employerWebhook(jsonRequest('/api/employer/webhook', 'POST', '{}', { 'stripe-signature': 'bad' }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe('Webhook signature verification failed');
    expect(JSON.stringify(body)).not.toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('POST /api/apply/confirmation-email: provider failure is a generic 502', async () => {
    const res = await confirmationEmail(
      jsonRequest('/api/apply/confirmation-email', 'POST', '{"email":"applicant@example.test","fullName":"Test Applicant"}'),
    );
    expect(res.status).toBe(502);
    const body = await readJson(res);
    expect(typeof body.error).toBe('string');
    expect(JSON.stringify(body)).not.toContain('Resend');
    expect(JSON.stringify(body)).not.toContain('re_live_abc123');
  });

  const onetCases: Array<{ name: string; run: () => Promise<Response> }> = [
    {
      name: 'GET /api/public/interest-profiler/questions',
      run: () => profilerQuestions(new Request('http://localhost/api/public/interest-profiler/questions') as any),
    },
    {
      name: 'POST /api/public/interest-profiler/score',
      run: () => profilerScore(jsonRequest('/api/public/interest-profiler/score', 'POST', JSON.stringify({ answers: '3'.repeat(30) }))),
    },
    {
      name: 'POST /api/public/career-quiz/score',
      run: () => careerQuizScore(jsonRequest('/api/public/career-quiz/score', 'POST', JSON.stringify({ answers: '333333' }))),
    },
  ];

  for (const c of onetCases) {
    it(`${c.name}: O*NET failure is a generic 502`, async () => {
      const res = await c.run();
      expect(res.status).toBe(502);
      const body = await readJson(res);
      expect(body.error).toBe('Career matching is temporarily unavailable. Please try again in a few minutes.');
      expect(JSON.stringify(body)).not.toContain('O*NET request failed');
      expect(JSON.stringify(body)).not.toContain('10.0.0.7');
    });
  }

  it('POST /api/public/interest-profiler/score still validates the answers string', async () => {
    const res = await profilerScore(jsonRequest('/api/public/interest-profiler/score', 'POST', '{"answers":"12"}'));
    expect(res.status).toBe(400);
  });
});
