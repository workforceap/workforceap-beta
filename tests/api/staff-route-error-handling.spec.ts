// @vitest-environment node
/**
 * Staff-facing API routes (admin / counselor) must answer malformed input,
 * unknown ids and the wrong role with a JSON `{ error }` 4xx, and their raw
 * SQL must run against the real column types. Each case below returned a
 * 500 against the route before its fix (verified against the seeded
 * demo_test database with the super admin and counselor accounts):
 *
 *  - GET  /api/admin/analytics/dashboard, /placements, /programs
 *         `u.organization_id = ${orgId}::uuid` on a TEXT column -> Postgres
 *         42883 "operator does not exist: text = uuid" for every admin.
 *  - GET  /api/counselor/dashboard and /api/counselor/inbox-zero
 *         `t.member_id = ANY($1::uuid[])` on a TEXT column -> same 42883 for
 *         every counselor with at least one assignment.
 *  - GET  /api/counselor/members/[memberId]/messages   unknown member -> 500
 *  - POST /api/counselor/nudge                          JSON `null` / unknown member
 *  - PATCH /api/admin/members/at-risk                   bad JSON / `null` / wrong types
 *  - POST /api/admin/feature-flags, PATCH + DELETE /[id] `null`, bad JSON, unknown id
 *  - POST /api/admin/chapters                           bad JSON
 *  - POST /api/admin/certifications/review              JSON `null`
 *  - POST /api/admin/blog, PATCH /[id]                  bad JSON / `null` / wrong types
 *  - POST /api/admin/invites, /api/admin/members/create,
 *         /api/admin/messages/threads, /api/admin/messages/thread/[threadId]/staff
 *                                                       JSON `null`
 *  - POST /api/admin/members/[id]/erase                 JSON `null` (leaked a TypeError message)
 *  - PATCH /api/admin/members/[id]/edit-profile         unknown member -> "Update failed" 500
 *  - JSON `null` bodies (a TypeError on the first property read) in
 *         counselor messages / award-points / notes / session-notes / bulk-followup /
 *         feedback / placements / remind-member, admin award-points / placements /
 *         placement-surveys resend / email-crons toggle / member messages,
 *         employer checkout / messages, partner messages
 *  - POST /api/admin/organization/logo, /api/employer/logo  non-multipart body
 *  - PATCH + DELETE /api/admin/employer-screening-packs/[id]  unknown id
 *  - GET  /api/admin/partners/[id]/quarterly-outcomes   unknown id
 *  - GET  /api/admin/members/[id]/billing-packets, POST /reset-assessment
 *         a counselor (non-admin) got a 500 from a thrown `requireAdmin`
 *         instead of a 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  const defaults: Record<string, () => unknown> = {
    findMany: () => [],
    count: () => 0,
    groupBy: () => [],
  };
  /** Emulates the Postgres planner rejecting a uuid comparison against TEXT ids. */
  const pgTypeCheck = (sql: string) => {
    if (/::uuid/.test(sql)) {
      throw new Error('Raw query failed. Code: `42883`. Message: `ERROR: operator does not exist: text = uuid`');
    }
  };
  const rawResult = { rows: [] as unknown[] };
  const fn = (key: string) => {
    if (!fns.has(key)) {
      const method = key.split('.')[1];
      fns.set(key, vi.fn(async () => defaults[method]?.() ?? null));
    }
    return fns.get(key)!;
  };
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => fn(`${name}.${method}`) });
  const prisma: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]);
        }
        if (prop === '$queryRaw') {
          return async (strings: TemplateStringsArray) => {
            pgTypeCheck(strings.join('?'));
            return rawResult.rows;
          };
        }
        if (prop === '$queryRawUnsafe') {
          return async (sql: string) => {
            pgTypeCheck(sql);
            return rawResult.rows;
          };
        }
        return model(prop);
      },
    },
  );
  const reset = () => {
    fns.clear();
    rawResult.rows = [];
  };
  return { prisma, fn, reset, rawResult };
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
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  isSuperAdmin: vi.fn(async () => false),
  isCounselor: vi.fn(async () => false),
  isAdminInOrg: vi.fn(async () => true),
  getProfileRole: vi.fn(async () => 'member'),
  requireAdmin: vi.fn(async () => undefined),
  requireAdminOrCounselor: vi.fn(async () => ({ ok: true, userId: 'admin-1' })),
  hasAdminAccess: vi.fn(() => false),
  getEmployerForUser: vi.fn(async () => ({ employerId: 'emp-1', companyName: 'Acme' })),
  getPartnerForUser: vi.fn(async () => ({ partnerId: 'partner-1', partnerName: 'Partner' })),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
  getSubjectOrganizationId: vi.fn(async (memberId: string) => {
    if (memberId === 'member-1') return 'org-1';
    throw new Error(`getSubjectOrganizationId: no user row for id=${memberId}`);
  }),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => fn(h.prisma)),
  memberInOrg: vi.fn(() => ({})),
}));

vi.mock('@/lib/tenant/adminSubjectAccess', () => ({ canAdminActInSubjectOrganization: vi.fn(() => true) }));
vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  invalidateCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(async () => ({ id: 'thread-1', counselorUserId: null })),
  assertStaffCanAccessThread: vi.fn(async () => null),
  assertStaffCanPost: vi.fn(async () => null),
  normalizeMessageBody: vi.fn((raw: string) => ({ ok: true, body: raw })),
  serializeMessage: vi.fn((m: unknown) => m),
  getMessageAuthorName: vi.fn(() => 'User'),
  compactStringIds: vi.fn(() => []),
}));
vi.mock('@/lib/messages/readCursor', () => ({
  readCursorInputSchema: { safeParse: vi.fn(() => ({ success: true, data: {} })) },
  advanceThreadReadCursor: vi.fn(async () => ({ ok: true, readAt: null })),
}));
vi.mock('@/lib/counselor/commandCenter', () => ({
  getCounselorCommandCenter: vi.fn(async () => ({
    needsReply: [],
    atRisk: [],
    interviewing: [],
    totals: { needsReplyCount: 0, atRiskCount: 0, interviewingCount: 0, slaBreachCount: 0 },
  })),
}));
vi.mock('@/lib/counselor/adminMemberScope', () => ({ resolveAdminEnrolledMemberIds: vi.fn(async () => []) }));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(() => null),
  getProgramDisplayTitle: vi.fn(() => 'Program'),
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'Curriculum migration pending',
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAdminInviteRateLimit: vi.fn(async () => ({ success: true })),
  checkAIToolRateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(async () => undefined),
  sendInactiveNudgeEmail: vi.fn(async () => undefined),
  getVoiceCoachTranscriptRecipients: vi.fn(() => []),
  sendVoiceCoachTranscriptEmail: vi.fn(async () => undefined),
  preparePlacementSurveyEmail: vi.fn(() => null),
  sendPreparedPlacementSurveyEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/invitations/loginCode', () => ({ loginCodeFromToken: vi.fn(() => '000000') }));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()) }));
vi.mock('@/lib/analytics/partnerQuarterlyOutcomes', () => ({
  generatePartnerQuarterlyOutcomes: vi.fn(async () => ({ ok: true })),
  getDefaultQuarter: vi.fn(() => ({ quarter: 'Q1', year: 2026 })),
}));
vi.mock('@/lib/billing/packetAccess', () => ({
  resolveProgramTitle: vi.fn(() => 'Program'),
  serializeBillingPacket: vi.fn((p: unknown) => p),
}));
vi.mock('@/lib/billing/packetNumber', () => ({
  isUniqueViolation: vi.fn(() => false),
  nextPacketNumber: vi.fn(async () => 'INV-1'),
}));
vi.mock('@/lib/billing/packetSchema', () => ({
  createPacketSchema: { safeParse: vi.fn(() => ({ success: false, error: { errors: [] } })) },
  sumLineItems: vi.fn(() => 0),
}));
vi.mock('@/lib/billing/providerIdentity', () => ({ getPacketNumberPrefix: vi.fn(() => 'INV') }));
vi.mock('@prisma/client', async (importOriginal) => {
  // Routes build raw fragments with the real Prisma.sql / raw / join / empty
  // (e.g. the shared member-only join); keep those real so the SQL the
  // `pgTypeCheck` proxy inspects is the SQL production would send.
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    InvitationStatus: { pending: 'pending', accepted: 'accepted', expired: 'expired', revoked: 'revoked' },
    MessageThreadKind: { member: 'member', employer: 'employer', partner: 'partner' },
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {},
      sql: actual.Prisma.sql,
      raw: actual.Prisma.raw,
      join: actual.Prisma.join,
      empty: actual.Prisma.empty,
    },
  };
});
vi.mock('@/lib/member/getMemberState', () => ({ invalidateMemberState: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn(() => null) }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth/roleAccess', () => ({ hasAdminAccess: vi.fn(() => false), hasSuperAdminAccess: vi.fn(() => false) }));
vi.mock('@/lib/gdpr/deleteUserStorage', () => ({
  ACCOUNT_STORAGE_DELETE_FAILED: 'ACCOUNT_STORAGE_DELETE_FAILED',
  MEMBER_FILES_BUCKET: 'member-files',
  MEMBER_RESUME_BUCKET: 'member-resumes',
  deleteUserStorageObjects: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/referralSources', () => ({ ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES: [] }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined), persistEvent: vi.fn(async () => ({ id: 'event' })) }));
vi.mock('@/lib/auth/passwordReset', () => ({ sendPasswordResetEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/coursera/courseKickoff', () => ({ maybeSendCourseKickoffEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ activeCurriculumVersion: vi.fn(() => 'v1') }));
vi.mock('@/lib/content/programSlug', () => ({ canonicalizeProgramSlug: vi.fn((s: string) => s) }));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  getSlaStatusForThreads: vi.fn(async () => new Map()),
  getThreadIdsBreachingSla: vi.fn(async () => []),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/storage/publicAssetUrl', () => ({ resolveSupabasePublicAssetUrl: vi.fn(() => null) }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn(async () => true) }));
vi.mock('@/lib/counselor/followUpTemplates', () => ({
  getFollowUpTemplate: vi.fn(() => null),
  renderFollowUpTemplate: vi.fn(() => ''),
}));
vi.mock('@/lib/counselor/placementsQuery', () => ({ buildPlacementsQuery: vi.fn(() => ({})) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => ({ awarded: 0 })) }));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/anthropicChat', () => ({ claudeChat: vi.fn(async () => '') }));
vi.mock('@/lib/ai/postProcess', () => ({ cleanSpokenLine: vi.fn((s: string) => s) }));
vi.mock('@/lib/coach/memory', () => ({ updateCoachMemory: vi.fn(async () => undefined) }));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(() => null),
  EMPLOYER_PRICING_ENFORCED: true,
  EMPLOYER_TIERS: {},
  isValidTier: vi.fn(() => false),
}));
vi.mock('@/lib/admin/cronRegistry', () => ({ CRON_REGISTRY: [{ id: 'cron-1', name: 'Test cron' }] }));
vi.mock('@/lib/messages/portalThreads', () => ({
  getOrCreateEmployerMessageThread: vi.fn(async () => ({ id: 'thread-e' })),
  assertEmployerCanAccessThread: vi.fn(async () => null),
  getOrCreatePartnerMessageThread: vi.fn(async () => ({ id: 'thread-p' })),
  assertPartnerCanAccessThread: vi.fn(async () => null),
}));
vi.mock('@/lib/messages/rateLimit', () => ({ checkMessageRateLimit: vi.fn(async () => ({ success: true })) }));

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { GET as analyticsDashboard } from '@/app/api/admin/analytics/dashboard/route';
import { GET as analyticsPlacements } from '@/app/api/admin/analytics/placements/route';
import { GET as counselorDashboard } from '@/app/api/counselor/dashboard/route';
import { GET as counselorInboxZero } from '@/app/api/counselor/inbox-zero/route';
import { GET as memberMessages } from '@/app/api/counselor/members/[memberId]/messages/route';
import { POST as nudge } from '@/app/api/counselor/nudge/route';
import { PATCH as atRiskPatch } from '@/app/api/admin/members/at-risk/route';
import { POST as createFeatureFlag } from '@/app/api/admin/feature-flags/route';
import { PATCH as patchFeatureFlag, DELETE as deleteFeatureFlag } from '@/app/api/admin/feature-flags/[id]/route';
import { POST as createChapter } from '@/app/api/admin/chapters/route';
import { POST as reviewCertification } from '@/app/api/admin/certifications/review/route';
import { POST as createBlogPost } from '@/app/api/admin/blog/route';
import { PATCH as patchBlogPost } from '@/app/api/admin/blog/[id]/route';
import { POST as createInvite } from '@/app/api/admin/invites/route';
import { PATCH as patchScreeningPack, DELETE as deleteScreeningPack } from '@/app/api/admin/employer-screening-packs/[id]/route';
import { GET as partnerQuarterlyOutcomes } from '@/app/api/admin/partners/[id]/quarterly-outcomes/route';
import { GET as listBillingPackets } from '@/app/api/admin/members/[id]/billing-packets/route';
import { POST as resetAssessment } from '@/app/api/admin/members/[id]/reset-assessment/route';
import { POST as eraseMember } from '@/app/api/admin/members/[id]/erase/route';
import { PATCH as editProfile } from '@/app/api/admin/members/[id]/edit-profile/route';
import { POST as createMember } from '@/app/api/admin/members/create/route';
import { POST as postStaffMessage } from '@/app/api/admin/messages/thread/[threadId]/staff/route';
import { POST as openMemberThread } from '@/app/api/admin/messages/threads/route';
import { POST as postMemberMessage } from '@/app/api/counselor/members/[memberId]/messages/route';
import { POST as counselorAwardPoints } from '@/app/api/counselor/members/[memberId]/award-points/route';
import { POST as adminAwardPoints } from '@/app/api/admin/members/[id]/award-points/route';
import { DELETE as deleteCounselorNote } from '@/app/api/counselor/members/[memberId]/notes/route';
import { DELETE as deleteSessionNote } from '@/app/api/counselor/members/[memberId]/session-notes/route';
import { POST as bulkFollowUp } from '@/app/api/counselor/bulk-followup/route';
import { POST as counselorFeedback } from '@/app/api/counselor/feedback/route';
import { POST as counselorPlacement } from '@/app/api/counselor/placements/route';
import { POST as remindMember } from '@/app/api/counselor/remind-member/route';
import { POST as adminPlacement } from '@/app/api/admin/placements/route';
import { POST as resendPlacementSurvey } from '@/app/api/admin/placement-surveys/resend/route';
import { POST as toggleEmailCron } from '@/app/api/admin/email-crons/[id]/toggle/route';
import { POST as adminMemberMessage } from '@/app/api/admin/members/[id]/messages/route';
import { POST as employerCheckout } from '@/app/api/employer/checkout/route';
import { POST as employerMessage } from '@/app/api/employer/messages/route';
import { POST as partnerMessage } from '@/app/api/partner/messages/route';
import { POST as uploadOrgLogo } from '@/app/api/admin/organization/logo/route';
import { POST as uploadEmployerLogo } from '@/app/api/employer/logo/route';

const ADMIN = { id: 'admin-1', email: 'admin@example.org' } as any;
const UNKNOWN_ID = '00000000-0000-4000-8000-00000000dead';
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function req(method: string, path: string, body?: string, contentType = 'application/json') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': contentType },
    body,
  }) as any;
}

/** The three body shapes the member-route audit used: bad JSON, JSON null, text/plain. */
const MALFORMED: Array<[string, string, string]> = [
  ['bad JSON', '{bad json', 'application/json'],
  ['JSON null', 'null', 'application/json'],
  ['text/plain', 'hello', 'text/plain'],
];

async function expectJsonError(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toContain('application/json');
  const body = await res.json();
  expect(typeof body.error === 'string' || typeof body.error === 'object').toBe(true);
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  vi.mocked(getUser).mockResolvedValue(ADMIN);
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(isCounselor).mockResolvedValue(false);
});

describe('raw SQL runs against the real TEXT id columns', () => {
  it('GET /api/admin/analytics/dashboard answers 200 for an admin', async () => {
    const res = await analyticsDashboard(req('GET', '/api/admin/analytics/dashboard'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ totalMembers: 0, placementsCount: 0 });
  });

  it('GET /api/admin/analytics/placements answers 200 for an admin', async () => {
    const res = await analyticsPlacements(req('GET', '/api/admin/analytics/placements'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ placements: [], outcomes: { total: 0 } });
  });

  it('GET /api/counselor/dashboard answers 200 for a counselor with assignments', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    h.fn('counselor.findFirst').mockResolvedValue({ id: 'c-1', partner: null });
    h.fn('counselorAssignment.findMany').mockResolvedValue([
      {
        id: 'a-1',
        memberId: 'member-1',
        assignedAt: new Date(),
        member: {
          id: 'member-1',
          fullName: 'Alicia Torres',
          email: 'alicia@example.org',
          programInterest: null,
          enrolledProgram: 'google-it-support',
          assessmentScorePct: null,
          memberProgramProgress: [],
        },
      },
    ]);
    h.rawResult.rows = [{ count: BigInt(1) }];

    const res = await counselorDashboard(req('GET', '/api/counselor/dashboard'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stats: { totalMembers: 1, messagesNeedingReply: 1 } });
  });

  it('GET /api/counselor/inbox-zero answers 200 for a counselor with assignments', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    h.fn('counselor.findFirst').mockResolvedValue({ id: 'c-1' });
    h.fn('counselorAssignment.findMany').mockResolvedValue([{ memberId: 'member-1', assignedAt: new Date() }]);
    h.fn('user.findMany').mockResolvedValue([]);

    const res = await counselorInboxZero(req('GET', '/api/counselor/inbox-zero'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('queue');
  });
});

describe('counselor routes: unknown member and malformed body', () => {
  it('GET /api/counselor/members/[memberId]/messages -> 404 for an unknown member', async () => {
    const res = await memberMessages(req('GET', `/api/counselor/members/${UNKNOWN_ID}/messages`), params({ memberId: UNKNOWN_ID }));
    expect(await expectJsonError(res, 404)).toEqual({ error: 'Member not found' });
  });

  it('POST /api/counselor/nudge -> 400 on JSON null', async () => {
    const res = await nudge(req('POST', '/api/counselor/nudge', 'null'));
    await expectJsonError(res, 400);
  });

  it('POST /api/counselor/nudge -> 404 for an unknown member', async () => {
    const res = await nudge(req('POST', '/api/counselor/nudge', JSON.stringify({ memberId: UNKNOWN_ID, templateId: 'check_in' })));
    expect(await expectJsonError(res, 404)).toEqual({ error: 'Member not found' });
  });
});

describe('admin routes: malformed body -> 400 JSON', () => {
  for (const [label, body, contentType] of MALFORMED) {
    it(`PATCH /api/admin/members/at-risk -> 400 on ${label}`, async () => {
      await expectJsonError(await atRiskPatch(req('PATCH', '/api/admin/members/at-risk', body, contentType)), 400);
    });
    it(`POST /api/admin/feature-flags -> 400 on ${label}`, async () => {
      await expectJsonError(await createFeatureFlag(req('POST', '/api/admin/feature-flags', body, contentType)), 400);
    });
    it(`PATCH /api/admin/feature-flags/[id] -> 400 on ${label}`, async () => {
      await expectJsonError(await patchFeatureFlag(req('PATCH', `/api/admin/feature-flags/${UNKNOWN_ID}`, body, contentType), params({ id: UNKNOWN_ID })), 400);
    });
    it(`POST /api/admin/chapters -> 400 on ${label}`, async () => {
      await expectJsonError(await createChapter(req('POST', '/api/admin/chapters', body, contentType)), 400);
    });
    it(`POST /api/admin/certifications/review -> 400 on ${label}`, async () => {
      await expectJsonError(await reviewCertification(req('POST', '/api/admin/certifications/review', body, contentType)), 400);
    });
    it(`POST /api/admin/blog -> 400 on ${label}`, async () => {
      await expectJsonError(await createBlogPost(req('POST', '/api/admin/blog', body, contentType)), 400);
    });
    it(`PATCH /api/admin/blog/[id] -> 400 on ${label}`, async () => {
      await expectJsonError(await patchBlogPost(req('PATCH', `/api/admin/blog/${UNKNOWN_ID}`, body, contentType), params({ id: UNKNOWN_ID })), 400);
    });
    it(`POST /api/admin/invites -> 400 on ${label}`, async () => {
      await expectJsonError(await createInvite(req('POST', '/api/admin/invites', body, contentType)), 400);
    });
  }

  it('POST /api/admin/members/create -> 400 on JSON null', async () => {
    expect(await expectJsonError(await createMember(req('POST', '/api/admin/members/create', 'null')), 400)).toEqual({ error: 'Invalid JSON' });
  });

  it('POST /api/admin/messages/thread/[threadId]/staff -> 400 on JSON null', async () => {
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    const res = await postStaffMessage(req('POST', '/api/admin/messages/thread/t-1/staff', 'null'), params({ threadId: 't-1' }));
    expect(await expectJsonError(res, 400)).toEqual({ error: 'Invalid JSON' });
  });

  it('POST /api/admin/messages/threads -> 400 on JSON null', async () => {
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    expect(await expectJsonError(await openMemberThread(req('POST', '/api/admin/messages/threads', 'null')), 400)).toEqual({ error: 'Invalid JSON' });
  });

  it('POST /api/admin/members/[id]/erase -> no TypeError on JSON null (unknown member is a 404)', async () => {
    const res = await eraseMember(req('POST', `/api/admin/members/${UNKNOWN_ID}/erase`, 'null'), params({ id: UNKNOWN_ID }));
    expect(res.status).toBe(404);
  });

  it('PATCH /api/admin/members/[id]/edit-profile -> 404 for an unknown member instead of "Update failed"', async () => {
    const res = await editProfile(req('PATCH', `/api/admin/members/${UNKNOWN_ID}/edit-profile`, JSON.stringify({ fullName: 'New Name' })), params({ id: UNKNOWN_ID }));
    expect(await expectJsonError(res, 404)).toEqual({ error: 'Member not found' });
    expect(h.fn('user.update')).not.toHaveBeenCalled();
  });

  it('PATCH /api/admin/members/at-risk -> 400 when alertId is not a string', async () => {
    const res = await atRiskPatch(req('PATCH', '/api/admin/members/at-risk', JSON.stringify({ alertId: 1, status: 'resolved' })));
    expect(await expectJsonError(res, 400)).toEqual({ error: 'Invalid alertId or status' });
  });

  it('PATCH /api/admin/feature-flags/[id] -> 200 and ignores non-string name/description instead of throwing', async () => {
    h.fn('featureFlag.findUnique').mockResolvedValue({ id: 'flag-1', key: 'k', name: 'Old', allowedRoles: [] });
    h.fn('featureFlag.update').mockResolvedValue({ id: 'flag-1', key: 'k', name: 'Old' });
    const res = await patchFeatureFlag(req('PATCH', '/api/admin/feature-flags/flag-1', JSON.stringify({ name: 1, description: 2 })), params({ id: 'flag-1' }));
    expect(res.status).toBe(200);
    expect(h.fn('featureFlag.update')).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Old', description: null } }));
  });

  it('POST /api/admin/blog -> 400 when slug/title/content are not strings', async () => {
    const res = await createBlogPost(req('POST', '/api/admin/blog', JSON.stringify({ slug: 1, title: 1, content: 1 })));
    await expectJsonError(res, 400);
  });

  it('POST /api/admin/blog still creates a post from the editor payload', async () => {
    h.fn('blogPost.findUnique').mockResolvedValue(null);
    h.fn('blogPost.create').mockResolvedValue({ id: 'post-1', slug: 'hello' });
    const res = await createBlogPost(req('POST', '/api/admin/blog', JSON.stringify({
      slug: 'hello', title: 'Hello', content: 'Body', excerpt: null, coverImage: null, authorName: null, category: null, published: false, scheduledAt: null,
    })));
    expect(res.status).toBe(200);
    expect(h.fn('blogPost.create')).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: 'hello', title: 'Hello', content: 'Body', published: false, scheduledAt: null }),
    }));
  });
});

describe('JSON `null` bodies -> 400 JSON instead of a TypeError 500', () => {
  const MEMBER = 'member-1';
  const nullBody = (path: string) => req('POST', path, 'null');

  beforeEach(() => {
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    h.fn('user.findFirst').mockResolvedValue({ id: MEMBER, deletedAt: null });
  });

  it('POST /api/counselor/members/[memberId]/messages', async () => {
    await expectJsonError(await postMemberMessage(nullBody(`/api/counselor/members/${MEMBER}/messages`), params({ memberId: MEMBER })), 400);
  });
  it('POST /api/counselor/members/[memberId]/award-points', async () => {
    await expectJsonError(await counselorAwardPoints(nullBody(`/api/counselor/members/${MEMBER}/award-points`), params({ memberId: MEMBER })), 400);
  });
  it('POST /api/admin/members/[id]/award-points', async () => {
    await expectJsonError(await adminAwardPoints(nullBody(`/api/admin/members/${MEMBER}/award-points`), params({ id: MEMBER })), 400);
  });
  it('DELETE /api/counselor/members/[memberId]/notes', async () => {
    await expectJsonError(await deleteCounselorNote(req('DELETE', `/api/counselor/members/${MEMBER}/notes`, 'null'), params({ memberId: MEMBER })), 400);
  });
  it('DELETE /api/counselor/members/[memberId]/session-notes', async () => {
    await expectJsonError(await deleteSessionNote(req('DELETE', `/api/counselor/members/${MEMBER}/session-notes`, 'null'), params({ memberId: MEMBER })), 400);
  });
  it('POST /api/counselor/bulk-followup', async () => {
    await expectJsonError(await bulkFollowUp(nullBody('/api/counselor/bulk-followup')), 400);
  });
  it('POST /api/counselor/feedback', async () => {
    await expectJsonError(await counselorFeedback(nullBody('/api/counselor/feedback')), 400);
  });
  it('POST /api/counselor/placements', async () => {
    await expectJsonError(await counselorPlacement(nullBody('/api/counselor/placements')), 400);
  });
  it('POST /api/counselor/remind-member', async () => {
    await expectJsonError(await remindMember(nullBody('/api/counselor/remind-member')), 400);
  });
  it('POST /api/admin/placements', async () => {
    await expectJsonError(await adminPlacement(nullBody('/api/admin/placements')), 400);
  });
  it('POST /api/admin/placement-surveys/resend', async () => {
    await expectJsonError(await resendPlacementSurvey(nullBody('/api/admin/placement-surveys/resend')), 400);
  });
  it('POST /api/admin/email-crons/[id]/toggle', async () => {
    await expectJsonError(await toggleEmailCron(nullBody('/api/admin/email-crons/cron-1/toggle'), params({ id: 'cron-1' })), 400);
  });
  it('POST /api/admin/members/[id]/messages', async () => {
    await expectJsonError(await adminMemberMessage(nullBody(`/api/admin/members/${MEMBER}/messages`), params({ id: MEMBER })), 400);
  });
  it('POST /api/employer/checkout', async () => {
    await expectJsonError(await employerCheckout(nullBody('/api/employer/checkout')), 400);
  });
  it('POST /api/employer/messages', async () => {
    await expectJsonError(await employerMessage(nullBody('/api/employer/messages')), 400);
  });
  it('POST /api/partner/messages', async () => {
    await expectJsonError(await partnerMessage(nullBody('/api/partner/messages')), 400);
  });
});

describe('logo uploads: a non-multipart body -> 400 JSON', () => {
  it('POST /api/admin/organization/logo', async () => {
    await expectJsonError(await uploadOrgLogo(req('POST', '/api/admin/organization/logo', 'null')), 400);
  });
  it('POST /api/employer/logo', async () => {
    await expectJsonError(await uploadEmployerLogo(req('POST', '/api/employer/logo', '{"file":1}')), 400);
  });
});

describe('admin routes: unknown id -> 404 JSON', () => {
  it('DELETE /api/admin/feature-flags/[id]', async () => {
    const res = await deleteFeatureFlag(req('DELETE', `/api/admin/feature-flags/${UNKNOWN_ID}`), params({ id: UNKNOWN_ID }));
    await expectJsonError(res, 404);
    expect(h.fn('featureFlag.delete')).not.toHaveBeenCalled();
  });

  it('PATCH /api/admin/employer-screening-packs/[id]', async () => {
    const res = await patchScreeningPack(req('PATCH', `/api/admin/employer-screening-packs/${UNKNOWN_ID}`, '{}'), params({ id: UNKNOWN_ID }));
    await expectJsonError(res, 404);
    expect(h.fn('employerScreeningPack.update')).not.toHaveBeenCalled();
  });

  it('DELETE /api/admin/employer-screening-packs/[id]', async () => {
    const res = await deleteScreeningPack(req('DELETE', `/api/admin/employer-screening-packs/${UNKNOWN_ID}`), params({ id: UNKNOWN_ID }));
    await expectJsonError(res, 404);
    expect(h.fn('employerScreeningPack.delete')).not.toHaveBeenCalled();
  });

  it('GET /api/admin/partners/[id]/quarterly-outcomes', async () => {
    const res = await partnerQuarterlyOutcomes(req('GET', `/api/admin/partners/${UNKNOWN_ID}/quarterly-outcomes`), params({ id: UNKNOWN_ID }));
    expect(await expectJsonError(res, 404)).toEqual({ error: 'Partner not found' });
  });
});

describe('admin member routes: a non-admin gets 403, not 500', () => {
  beforeEach(() => {
    vi.mocked(isAdmin).mockResolvedValue(false);
  });

  it('GET /api/admin/members/[id]/billing-packets', async () => {
    const res = await listBillingPackets(req('GET', `/api/admin/members/${UNKNOWN_ID}/billing-packets`), params({ id: UNKNOWN_ID }));
    await expectJsonError(res, 403);
  });

  it('POST /api/admin/members/[id]/reset-assessment', async () => {
    const res = await resetAssessment(req('POST', `/api/admin/members/${UNKNOWN_ID}/reset-assessment`, '{}'), params({ id: UNKNOWN_ID }));
    await expectJsonError(res, 403);
  });
});
