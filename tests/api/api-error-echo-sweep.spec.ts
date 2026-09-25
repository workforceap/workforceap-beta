// @vitest-environment node
/**
 * Member- and staff-facing API routes must keep upstream error text (Prisma,
 * Coursera B4B, O*NET, the email provider) in the server log and answer the
 * browser with one stable sentence, and must answer a JSON body that is not
 * an object with a 400 instead of a TypeError-driven 500. Each case below
 * failed against the route before its fix:
 *
 *  Upstream text echoed to the client
 *  - POST /api/member/coursera/refresh-progress          502 `{ error: <B4B error> }`
 *  - GET  /api/member/interest-profiler/questions        502 `{ error: <O*NET error> }`
 *  - POST /api/member/interest-profiler/score            502 `{ error: <O*NET error> }`
 *  - POST /api/member/prep-bundle/send                   502 `{ error: <email provider error> }`
 *  - POST /api/admin/users/[id]/reset-password,
 *         /api/admin/members/[id]/reset-password         500 `{ error: <Supabase auth error> }`
 *  - GET  /api/admin/onet/search                         503 `O*NET search unavailable: <error>`
 *  - GET  /api/admin/outcomes/snapshot                   500 `{ error: <Prisma error> }` (and no log)
 *  - PATCH /api/admin/members/[id]/partner               500 `{ error, detail: <Prisma error> }`
 *  - POST /api/admin/email-crons/[id]/dry-run,
 *    GET  /api/admin/email-crons/[id]/preview            500 `{ error: <Prisma error> }`
 *  - POST /api/admin/coursera/backfill-orphans, /sync-b4b, /auto-heal,
 *    GET  /api/admin/coursera/link-health, /mappings     500 `{ error: <library error> }`
 *
 *  JSON `null` body -> TypeError on the first property read -> 500
 *  - POST /api/member/prep-bundle/send
 *  - POST /api/admin/coursera/mappings, /map-unmatched, /backfill-xapi
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  const fn = (key: string) => {
    if (!fns.has(key)) fns.set(key, vi.fn(async () => null));
    return fns.get(key)!;
  };
  const model = (name: string) => new Proxy({}, { get: (_t, method: string) => fn(`${name}.${method}`) });
  const prisma: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]);
        }
        return model(prop);
      },
    },
  );
  return {
    prisma,
    fn,
    reset: () => fns.clear(),
    fetchLearnerProgressFromB4B: vi.fn(),
    fetchAllMiniIpQuestions: vi.fn(),
    getInterestProfilerResults: vi.fn(),
    searchOccupations: vi.fn(),
    fetchInterviewPrepBundle: vi.fn(),
    sendInterviewPrepBundleEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    getBoardSnapshot: vi.fn(),
    backfillAllOrphanedCourseraProgress: vi.fn(),
    auditCourseraLinkHealth: vi.fn(),
    syncCourseraB4BEnrollmentReports: vi.fn(),
    autoHealUnmatchedXapiEvents: vi.fn(),
    listCourseraIdentityMappings: vi.fn(),
    captureApiError: vi.fn(),
  };
});

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
vi.mock('@/lib/db/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(async () => ({ id: 'user-1', email: 'member@example.com', user_metadata: {} })),
}));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  isSuperAdmin: vi.fn(async () => true),
  requireAdmin: vi.fn(async () => undefined),
}));
vi.mock('@/lib/auth/roleAccess', () => ({ hasSuperAdminAccess: vi.fn(() => false) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => fn(h.prisma)),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: h.captureApiError }));
vi.mock('@/lib/rate-limit', () => ({
  checkInterestProfilerRateLimit: vi.fn(async () => ({ success: true })),
  checkContactRateLimit: vi.fn(async () => ({ success: true })),
}));

// Member routes
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: h.fetchLearnerProgressFromB4B }));
vi.mock('@/lib/content/courseraDiscoveredCatalog', () => ({ DISCOVERED_COURSERA_PROGRAMS: {} }));
vi.mock('@/lib/onet/client', () => ({ isOnetConfigured: vi.fn(() => true), searchOccupations: h.searchOccupations }));
vi.mock('@/lib/onet/interestProfiler', () => ({
  fetchAllMiniIpQuestions: h.fetchAllMiniIpQuestions,
  getInterestProfilerResults: h.getInterestProfilerResults,
  getInterestProfilerCareers: vi.fn(async () => ({ career: [], total: 0 })),
}));
vi.mock('@/lib/onet/interestProfilerCareerFallback', () => ({ applyRiasecCareerFallback: vi.fn((rows: unknown) => rows) }));
vi.mock('@/lib/content/quizIpMerge', () => ({ riasecFromResultRows: vi.fn(() => ({})) }));
vi.mock('@/lib/onet/ipMapToPrograms', () => ({ mapIpCareerRowsToProgramSlugs: vi.fn(() => []) }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/interviewPrepBundle', () => ({ fetchInterviewPrepBundle: h.fetchInterviewPrepBundle }));
vi.mock('@/lib/email', () => ({ sendInterviewPrepBundleEmail: h.sendInterviewPrepBundleEmail }));

// Staff routes
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: h.sendPasswordResetEmail }));
vi.mock('@/lib/admin/boardOutcomes', () => ({
  getBoardSnapshot: h.getBoardSnapshot,
  formatBoardSnapshotMarkdown: vi.fn(() => ''),
  formatBoardSnapshotPdf: vi.fn(async () => Buffer.from('')),
}));
vi.mock('@/lib/csv/export', () => ({
  dataToCsv: vi.fn(() => ''),
  csvDownloadResponse: vi.fn(() => new Response('')),
  exportFilename: vi.fn(() => 'file'),
}));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerNewMemberAssignedEmail: vi.fn(async () => undefined) }));
vi.mock('@/emails', () => ({
  weeklyRecapHtml: vi.fn(() => ''),
  inactiveNudgeHtml: vi.fn(() => ''),
  applicantFollowupHtml: vi.fn(() => ''),
  adminWeeklyRecapHtml: vi.fn(() => ''),
  partnerWeeklyDigestHtml: vi.fn(() => ''),
  courseCompletedHtml: vi.fn(() => ''),
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: vi.fn(() => '') }));
vi.mock('@/lib/recap/buildWeeklyRecapEmailSummary', () => ({ buildWeeklyRecapEmailSummary: vi.fn(() => ({})) }));
vi.mock('@/lib/coursera/csvImport.server', () => ({ backfillAllOrphanedCourseraProgress: h.backfillAllOrphanedCourseraProgress }));
vi.mock('@/lib/coursera/linkHealth', () => ({ auditCourseraLinkHealth: h.auditCourseraLinkHealth }));
vi.mock('@/lib/coursera/b4bSync', () => ({ syncCourseraB4BEnrollmentReports: h.syncCourseraB4BEnrollmentReports }));
vi.mock('@/lib/xapi/reprocess', () => ({ autoHealUnmatchedXapiEvents: h.autoHealUnmatchedXapiEvents }));
vi.mock('@/lib/xapi/mappings', () => ({
  listCourseraIdentityMappings: h.listCourseraIdentityMappings,
  listRecentUnmatchedXapiEvents: vi.fn(async () => []),
}));
vi.mock('@/lib/coursera/mapIdentityAndProgress.server', () => ({ mapCourseraIdentityAndProgress: vi.fn() }));
vi.mock('@/lib/db/exactEmailMatch', () => ({ EXACT_EMAIL_CANDIDATE_LIMIT: 5, pickExactEmailMatch: vi.fn(() => null) }));
vi.mock('@/lib/xapi/statementModel', () => ({
  parseXapiStatement: vi.fn(() => null),
  isXapiCompletionVerb: vi.fn(() => false),
  isXapiCourseProgressVerb: vi.fn(() => false),
}));
vi.mock('@/lib/member/courseProgress', () => ({ upsertCourseProgressFromXapiStatement: vi.fn(async () => undefined) }));

import { POST as refreshProgress } from '@/app/api/member/coursera/refresh-progress/route';
import { GET as ipQuestions } from '@/app/api/member/interest-profiler/questions/route';
import { POST as ipScore } from '@/app/api/member/interest-profiler/score/route';
import { POST as sendPrepBundle } from '@/app/api/member/prep-bundle/send/route';
import { POST as adminUserResetPassword } from '@/app/api/admin/users/[id]/reset-password/route';
import { POST as adminMemberResetPassword } from '@/app/api/admin/members/[id]/reset-password/route';
import { GET as onetSearch } from '@/app/api/admin/onet/search/route';
import { GET as outcomesSnapshot } from '@/app/api/admin/outcomes/snapshot/route';
import { PATCH as memberPartner } from '@/app/api/admin/members/[id]/partner/route';
import { POST as cronDryRun } from '@/app/api/admin/email-crons/[id]/dry-run/route';
import { GET as cronPreview } from '@/app/api/admin/email-crons/[id]/preview/route';
import { POST as backfillOrphans } from '@/app/api/admin/coursera/backfill-orphans/route';
import { GET as linkHealth } from '@/app/api/admin/coursera/link-health/route';
import { POST as syncB4b } from '@/app/api/admin/coursera/sync-b4b/route';
import { POST as autoHeal } from '@/app/api/admin/coursera/auto-heal/route';
import { GET as mappingsGet, POST as mappingsPost } from '@/app/api/admin/coursera/mappings/route';
import { POST as mapUnmatched } from '@/app/api/admin/coursera/map-unmatched/route';
import { POST as backfillXapi } from '@/app/api/admin/coursera/backfill-xapi/route';

type Handler = (req: any, ctx?: any) => Promise<Response>;

const UPSTREAM = 'connect ECONNREFUSED db.internal:5432 (prisma) — invalid_api_key re_123 for https://api.upstream.example';

function req(url: string, method = 'GET', body?: string): any {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function expectGeneric(res: Response, status: number, sentence: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type') ?? '').toContain('application/json');
  const body = await res.json();
  expect(body.error).toBe(sentence);
  expect(body).not.toHaveProperty('detail');
  const text = JSON.stringify(body);
  expect(text).not.toContain('ECONNREFUSED');
  expect(text).not.toContain('db.internal');
  expect(text).not.toContain('invalid_api_key');
  expect(text).not.toContain('upstream.example');
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.reset();
  h.captureApiError.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('member routes keep upstream error text server-side', () => {
  it('POST /api/member/coursera/refresh-progress', async () => {
    h.fn('user.findUnique').mockResolvedValue({ enrolledProgram: null });
    h.fetchLearnerProgressFromB4B.mockRejectedValue(new Error(UPSTREAM));
    const res = await refreshProgress(req('/api/member/coursera/refresh-progress', 'POST'));
    await expectGeneric(res, 502, 'Unable to refresh your progress from Coursera right now. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[member/coursera/refresh-progress] B4B refresh failed:', expect.any(Error));
  });

  it('GET /api/member/interest-profiler/questions', async () => {
    h.fetchAllMiniIpQuestions.mockRejectedValue(new Error(UPSTREAM));
    const res = await ipQuestions();
    await expectGeneric(res, 502, 'Unable to load the interest profiler questions right now. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[member/interest-profiler/questions] O*NET request failed:', expect.any(Error));
  });

  it('POST /api/member/interest-profiler/score', async () => {
    h.getInterestProfilerResults.mockRejectedValue(new Error(UPSTREAM));
    const res = await ipScore(req('/api/member/interest-profiler/score', 'POST', JSON.stringify({ answers: '3'.repeat(30) })));
    await expectGeneric(res, 502, 'Unable to score your interest profile right now. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[member/interest-profiler/score] O*NET request failed:', expect.any(Error));
  });

  it('POST /api/member/prep-bundle/send (email provider text)', async () => {
    h.fetchInterviewPrepBundle.mockResolvedValue({ empty: false, items: [{ toolType: 'resume' }] });
    h.sendInterviewPrepBundleEmail.mockResolvedValue({ ok: false, error: UPSTREAM });
    const res = await sendPrepBundle(req('/api/member/prep-bundle/send', 'POST', '{}'));
    await expectGeneric(res, 502, 'Unable to send your prep bundle right now. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[member/prep-bundle/send] email send failed:', UPSTREAM);
  });
});

describe('staff routes keep upstream error text server-side', () => {
  it('POST /api/admin/users/[id]/reset-password', async () => {
    h.fn('user.findFirst').mockResolvedValue({ email: 'target@example.com', profile: { role: 'member' }, userRoles: [] });
    h.sendPasswordResetEmail.mockResolvedValue({ error: new Error(UPSTREAM) });
    const res = await adminUserResetPassword(req('/api/admin/users/u1/reset-password', 'POST'), params('u1'));
    await expectGeneric(res, 500, 'Unable to send the password reset email. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[admin/users/[id]/reset-password] reset email failed:', expect.any(Error));
  });

  it('POST /api/admin/members/[id]/reset-password', async () => {
    h.fn('user.findFirst').mockResolvedValue({ email: 'target@example.com', fullName: 'Target' });
    h.sendPasswordResetEmail.mockResolvedValue({ error: new Error(UPSTREAM) });
    const res = await adminMemberResetPassword(req('/api/admin/members/m1/reset-password', 'POST'), params('m1'));
    await expectGeneric(res, 500, 'Unable to send the password reset email. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('[admin/members/[id]/reset-password] reset email failed:', expect.any(Error));
  });

  it('GET /api/admin/onet/search', async () => {
    h.searchOccupations.mockRejectedValue(new Error(UPSTREAM));
    const res = await onetSearch(new NextRequest('http://localhost/api/admin/onet/search?q=welder'));
    expect((await res.clone().json()).occupations).toEqual([]);
    await expectGeneric(res, 503, 'O*NET search is unavailable right now. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('/admin/onet/search O*NET error:', expect.any(Error));
  });

  it('GET /api/admin/outcomes/snapshot', async () => {
    h.getBoardSnapshot.mockRejectedValue(new Error(UPSTREAM));
    const res = await outcomesSnapshot(req('/api/admin/outcomes/snapshot?period=all-time'));
    await expectGeneric(res, 500, 'Unable to build the outcomes snapshot. Please try again in a few minutes.');
    expect(consoleError).toHaveBeenCalledWith('/admin/outcomes/snapshot:', expect.any(Error));
  });

  it('PATCH /api/admin/members/[id]/partner', async () => {
    h.fn('user.findFirst').mockResolvedValue({ id: 'm1', deletedAt: null });
    h.fn('partner.findFirst').mockResolvedValue({ id: '3f1d2b4e-8c6a-4f2e-9b1d-2a3c4d5e6f70' });
    h.fn('partnerReferral.findMany').mockResolvedValue([]);
    h.fn('partnerReferral.deleteMany').mockRejectedValue(new Error(UPSTREAM));
    const res = await memberPartner(
      req('/api/admin/members/m1/partner', 'PATCH', JSON.stringify({ partnerId: '3f1d2b4e-8c6a-4f2e-9b1d-2a3c4d5e6f70' })),
      params('m1'),
    );
    await expectGeneric(res, 500, 'Could not update partner assignment.');
    expect(consoleError).toHaveBeenCalledWith('[admin] PATCH member partner:', expect.any(Error));
  });

  it('POST /api/admin/email-crons/[id]/dry-run', async () => {
    h.fn('user.findMany').mockRejectedValue(new Error(UPSTREAM));
    const res = await cronDryRun(req('/api/admin/email-crons/weekly-recap/dry-run', 'POST'), params('weekly-recap'));
    await expectGeneric(res, 500, 'Unable to run the dry run for this email cron.');
    expect(consoleError).toHaveBeenCalledWith('[admin/email-crons/[id]/dry-run] simulation failed:', expect.any(Error));
  });

  it('GET /api/admin/email-crons/[id]/preview', async () => {
    h.fn('user.findMany').mockRejectedValue(new Error(UPSTREAM));
    const res = await cronPreview(req('/api/admin/email-crons/weekly-recap/preview'), params('weekly-recap'));
    await expectGeneric(res, 500, 'Unable to load the preview recipients for this email cron.');
    expect(consoleError).toHaveBeenCalledWith('[admin/email-crons/[id]/preview] recipient lookup failed:', expect.any(Error));
  });

  it('POST /api/admin/coursera/backfill-orphans', async () => {
    h.backfillAllOrphanedCourseraProgress.mockRejectedValue(new Error(UPSTREAM));
    const res = await backfillOrphans(req('/api/admin/coursera'));
    await expectGeneric(res, 500, 'Unable to backfill orphaned Coursera progress.');
    expect(consoleError).toHaveBeenCalledWith('/admin/coursera/backfill-orphans error:', expect.any(Error));
  });

  it('GET /api/admin/coursera/link-health', async () => {
    h.auditCourseraLinkHealth.mockRejectedValue(new Error(UPSTREAM));
    const res = await linkHealth(req('/api/admin/coursera'));
    await expectGeneric(res, 500, 'Unable to load Coursera link health.');
    expect(consoleError).toHaveBeenCalledWith('/api/admin/coursera/link-health error:', expect.any(Error));
  });

  it('POST /api/admin/coursera/sync-b4b', async () => {
    h.syncCourseraB4BEnrollmentReports.mockRejectedValue(new Error(UPSTREAM));
    const res = await syncB4b(req('/api/admin/coursera'));
    await expectGeneric(res, 500, 'Unable to sync Coursera enrollment reports.');
    expect(h.captureApiError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: 'admin/coursera/sync-b4b' }));
  });

  it('POST /api/admin/coursera/auto-heal', async () => {
    h.autoHealUnmatchedXapiEvents.mockRejectedValue(new Error(UPSTREAM));
    const res = await autoHeal(req('/api/admin/coursera'));
    await expectGeneric(res, 500, 'Unable to auto-heal unmatched xAPI events.');
    expect(consoleError).toHaveBeenCalledWith('[admin/coursera/auto-heal] heal failed:', expect.any(Error));
  });

  it('GET /api/admin/coursera/mappings', async () => {
    h.listCourseraIdentityMappings.mockRejectedValue(new Error(UPSTREAM));
    const res = await mappingsGet(req('/api/admin/coursera/mappings'));
    await expectGeneric(res, 500, 'Unable to load Coursera mapping data.');
    expect(consoleError).toHaveBeenCalledWith('[admin/coursera/mappings] load failed:', expect.any(Error));
  });
});

const NON_OBJECT_BODIES: Array<[string, string]> = [
  ['the JSON literal null', 'null'],
  ['a JSON array', '[]'],
  ['a JSON string', '"text"'],
];

describe('non-object JSON bodies answer 400, not 500', () => {
  const cases: Array<{ name: string; url: string; handler: Handler; error: string }> = [
    {
      name: 'POST /api/member/prep-bundle/send',
      url: '/api/member/prep-bundle/send',
      handler: sendPrepBundle,
      error: 'Invalid JSON body',
    },
    {
      name: 'POST /api/admin/coursera/mappings',
      url: '/api/admin/coursera/mappings',
      handler: mappingsPost,
      error: 'Invalid JSON',
    },
    {
      name: 'POST /api/admin/coursera/map-unmatched',
      url: '/api/admin/coursera/map-unmatched',
      handler: mapUnmatched,
      error: 'Invalid JSON',
    },
    {
      name: 'POST /api/admin/coursera/backfill-xapi',
      url: '/api/admin/coursera/backfill-xapi',
      handler: backfillXapi,
      error: 'Invalid JSON body',
    },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      for (const [label, raw] of NON_OBJECT_BODIES) {
        it(`returns 400 for ${label}`, async () => {
          h.fetchInterviewPrepBundle.mockResolvedValue({ empty: false, items: [{ toolType: 'resume' }] });
          const res = await c.handler(req(c.url, 'POST', raw));
          expect(res.status).toBe(400);
          const body = await res.json();
          expect(body.error).toBe(c.error);
        });
      }
    });
  }

  it('POST /api/member/prep-bundle/send still accepts an empty body', async () => {
    h.fetchInterviewPrepBundle.mockResolvedValue({ empty: false, items: [{ toolType: 'resume' }] });
    h.sendInterviewPrepBundleEmail.mockResolvedValue({ ok: true });
    const res = await sendPrepBundle(new Request('http://localhost/api/member/prep-bundle/send', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sentTo: 'member@example.com', itemCount: 1 });
  });
});
