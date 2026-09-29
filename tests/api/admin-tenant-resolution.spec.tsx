// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const delegate = () => ({
    findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
    aggregate: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  });
  return {
    db: {
      $transaction: vi.fn(), $queryRaw: vi.fn(), user: delegate(), subgroup: delegate(),
      partner: delegate(), atRiskAlert: delegate(), placementSurvey: delegate(),
      placementRecord: delegate(), memberEvent: delegate(), xapiStatement: delegate(),
    },
    getOrg: vi.fn(), getSubjectOrg: vi.fn(), isSuperAdmin: vi.fn(), pageScope: vi.fn(),
    snapshot: vi.fn(), chat: vi.fn(), sendInterview: vi.fn(), sendEligibility: vi.fn(),
    sendSurvey: vi.fn(), prepareSurvey: vi.fn(), issueToken: vi.fn(), progress: vi.fn(),
    audit: vi.fn(), auditEvent: vi.fn(), capture: vi.fn(), staffAccess: vi.fn(),
  };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'actor-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true), isCounselor: vi.fn(async () => false),
  requireAdmin: vi.fn(async () => undefined), isSuperAdmin: mocks.isSuperAdmin,
  requireAdminOrCounselor: vi.fn(async () => ({ ok: true, userId: 'actor-1' })),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: mocks.getOrg, getSubjectOrganizationId: mocks.getSubjectOrg,
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: mocks.pageScope }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: mocks.staffAccess }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.auditEvent, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: mocks.capture }));
vi.mock('@/lib/ai/groq', () => ({ chatCompletion: mocks.chat, isAIConfigured: () => true }));
vi.mock('@/lib/rate-limit', () => ({ checkAIToolRateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/admin/boardOutcomes', () => ({ getBoardSnapshot: mocks.snapshot }));
vi.mock('@/lib/email', () => ({
  sendInterviewPrepLink: mocks.sendInterview, sendEligibilityLink: mocks.sendEligibility,
  preparePlacementSurveyEmail: mocks.prepareSurvey, sendPreparedPlacementSurveyEmail: mocks.sendSurvey,
}));
vi.mock('@/lib/security/placementSurveyToken', () => ({ issuePlacementSurveyToken: mocks.issueToken }));
vi.mock('@/lib/member/atRiskScoring', () => ({ THRESHOLDS: { HIGH: 50, CRITICAL: 75 }, getRiskLevel: () => 'high' }));
vi.mock('@/lib/member/courseProgress', () => ({ upsertCourseProgressFromXapiStatement: mocks.progress }));
vi.mock('@/lib/xapi/statementModel', () => ({
  parseXapiStatement: () => ({ courseSlug: 'fixture-course' }),
  isXapiCompletionVerb: () => true, isXapiCourseProgressVerb: () => true,
}));
vi.mock('@/emails', () => ({
  weeklyRecapHtml: () => '<p>Fixture recap</p>', inactiveNudgeHtml: () => '',
  applicantFollowupHtml: () => '', adminWeeklyRecapHtml: () => '',
  partnerWeeklyDigestHtml: () => '', courseCompletedHtml: () => '',
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: () => '<p>Fixture preview</p>' }));
vi.mock('@/app/seo', () => ({ buildPageMetadata: () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: () => null }));
vi.mock('@/components/admin/MemberDuplicatesClient', () => ({ default: () => null }));
vi.mock('@/components/admin/MembersListNav', () => ({ default: () => null }));
vi.mock('@/components/portal/kit', () => ({ DesignSurface: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/DuplicatesKit', () => ({ DuplicatesKit: () => null }));

import { GET as riskStats } from '@/app/api/admin/pipeline/at-risk-stats/route';
import { GET as surveyStats } from '@/app/api/admin/pipeline/surveys/route';
import { PATCH as patchSubgroup, DELETE as deleteSubgroup } from '@/app/api/admin/subgroups/[id]/route';
import { GET as surveys } from '@/app/api/admin/placement-surveys/route';
import { POST as resendSurvey } from '@/app/api/admin/placement-surveys/resend/route';
import { GET as duplicates } from '@/app/api/admin/members/duplicates/route';
import { GET as riskMembers, PATCH as patchRisk } from '@/app/api/admin/members/at-risk/route';
import { POST as summary } from '@/app/api/admin/members/[id]/summary/route';
import { POST as interview } from '@/app/api/admin/members/[id]/send-interview-link/route';
import { POST as eligibility } from '@/app/api/admin/members/[id]/send-eligibility-link/route';
import { GET as preview } from '@/app/api/admin/email-crons/[id]/preview/route';
import { POST as dryRun } from '@/app/api/admin/email-crons/[id]/dry-run/route';
import { GET as backfillGet, POST as backfillPost } from '@/app/api/admin/coursera/backfill-xapi/route';
import { GET as snapshot } from '@/app/api/admin/outcomes/snapshot/route';
import DuplicatesPage from '@/app/admin/members/duplicates/page';

const db = mocks.db;
const params = (id = 'fixture-member') => ({ params: Promise.resolve({ id }) });
const req = (path: string, method = 'GET', body?: unknown) => new NextRequest(`https://example.test/api/admin/${path}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
});
const scoped = (fn: ReturnType<typeof vi.fn>, ...keys: string[]) => (orgId?: string) => {
  let value: any = fn.mock.calls[0]?.[0]?.where;
  for (const key of keys) value = value?.[key];
  expect(fn).toHaveBeenCalled();
  expect(value).toBe(orgId);
};
const sqlScope = (orgId?: string) => {
  expect(db.$queryRaw).toHaveBeenCalled();
  const sql = JSON.stringify(db.$queryRaw.mock.calls);
  if (orgId) {
    expect(sql).toContain('organization_id');
    expect(sql).toContain(orgId);
  } else expect(sql).not.toContain('organization_id');
};
const fixtureMember = {
  id: 'fixture-member', email: 'fixture@example.test', fullName: 'Fixture Member', deletedAt: null,
  enrolledProgram: 'fixture-program', enrolledAt: null, courseProgress: [], memberProgramProgress: [],
};
const surveyPayload = { from: 'fixture@example.test', to: 'recipient@example.test', subject: 'Fixture',
  html: '<p>Fixture</p>', text: 'Fixture', headers: {}, idempotencyKey: 'fixture-survey/1' };
const cases = [
  { name: 'pipeline risk statistics GET', run: () => riskStats(req('pipeline/at-risk-stats')), scope: scoped(db.atRiskAlert.count, 'user', 'organizationId') },
  { name: 'pipeline surveys GET', run: () => surveyStats(req('pipeline/surveys')), scope: scoped(db.placementSurvey.count, 'user', 'organizationId') },
  { name: 'subgroup PATCH', run: () => patchSubgroup(req('subgroups/fixture-member', 'PATCH', { name: 'Fixture group' }), params()), scope: scoped(db.subgroup.findFirst, 'leader', 'organizationId'), target: db.subgroup.findFirst },
  { name: 'subgroup DELETE', run: () => deleteSubgroup(req('subgroups/fixture-member', 'DELETE'), params()), scope: scoped(db.subgroup.findFirst, 'leader', 'organizationId'), target: db.subgroup.findFirst },
  { name: 'placement surveys GET', run: () => surveys(req('placement-surveys')), scope: scoped(db.placementSurvey.findMany, 'user', 'organizationId') },
  { name: 'placement survey resend POST', run: () => resendSurvey(req('placement-surveys/resend', 'POST', { placementId: 'fixture-placement' })), scope: scoped(db.placementRecord.findFirst, 'user', 'organizationId'), target: db.placementRecord.findFirst },
  { name: 'duplicate members GET', run: () => duplicates(req('members/duplicates')), scope: sqlScope },
  { name: 'at-risk members GET', run: () => riskMembers(req('members/at-risk')), scope: sqlScope },
  { name: 'at-risk member PATCH', run: () => patchRisk(req('members/at-risk', 'PATCH', { alertId: 'fixture-alert', status: 'acknowledged' })), scope: scoped(db.atRiskAlert.findFirst, 'user', 'organizationId'), target: db.atRiskAlert.findFirst },
  { name: 'member summary POST', run: () => summary(req('members/fixture-member/summary', 'POST'), params()), scope: scoped(db.user.findUnique, 'organizationId'), target: db.user.findUnique },
  { name: 'member interview link POST', run: () => interview(req('members/fixture-member/send-interview-link', 'POST'), params()), scope: scoped(db.user.findUnique, 'organizationId'), target: db.user.findUnique },
  { name: 'member eligibility link POST', run: () => eligibility(req('members/fixture-member/send-eligibility-link', 'POST'), params()), scope: scoped(db.user.findUnique, 'organizationId'), target: db.user.findUnique },
  { name: 'email cron preview GET', run: () => preview(req('email-crons/weekly-recap/preview'), params('weekly-recap')), scope: scoped(db.user.findMany, 'organizationId') },
  { name: 'email cron dry-run POST', run: () => dryRun(req('email-crons/weekly-recap/dry-run', 'POST'), params('weekly-recap')), scope: scoped(db.user.findMany, 'organizationId') },
  { name: 'partner digest preview GET', run: () => preview(req('email-crons/partner-outcome-digest/preview'), params('partner-outcome-digest')), scope: scoped(db.partner.findMany, 'organizationId') },
  { name: 'partner digest dry-run POST', run: () => dryRun(req('email-crons/partner-outcome-digest/dry-run', 'POST'), params('partner-outcome-digest')), scope: (orgId?: string) => {
    scoped(db.partner.findMany, 'organizationId')(orgId);
    scoped(db.partner.count, 'organizationId')(orgId);
  } },
  { name: 'Coursera backfill GET', run: () => backfillGet(req('coursera/backfill-xapi?email=fixture@example.test')), scope: scoped(db.user.findMany, 'organizationId'), target: db.user.findMany },
  { name: 'Coursera backfill POST', run: () => backfillPost(req('coursera/backfill-xapi', 'POST', { email: 'fixture@example.test' })), scope: scoped(db.user.findMany, 'organizationId'), target: db.user.findMany },
  { name: 'outcomes snapshot GET', run: () => snapshot(req('outcomes/snapshot')), scope: (orgId?: string) => expect(mocks.snapshot).toHaveBeenCalledWith('all-time', orgId) },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getOrg.mockResolvedValue('org-1');
  mocks.getSubjectOrg.mockResolvedValue('org-1');
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.staffAccess.mockResolvedValue(true);
  mocks.pageScope.mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
  mocks.snapshot.mockResolvedValue({ fixture: true });
  mocks.chat.mockResolvedValue('Fixture summary');
  for (const fn of [mocks.sendInterview, mocks.sendEligibility, mocks.sendSurvey]) fn.mockResolvedValue({ ok: true });
  for (const fn of [mocks.audit, mocks.auditEvent, mocks.progress]) fn.mockResolvedValue(undefined);
  for (const model of Object.values(db)) {
    if (typeof model !== 'object') continue;
    for (const [method, fn] of Object.entries(model)) {
      fn.mockResolvedValue(method === 'count' ? 0 : method === 'aggregate' ? { _avg: {} } : method === 'findMany' || method === 'groupBy' ? [] : { id: 'fixture-id' });
    }
  }
  db.$transaction.mockImplementation((callback) => callback(db));
  db.$queryRaw.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue(fixtureMember);
  db.user.findMany.mockResolvedValue([fixtureMember]);
  db.subgroup.findFirst.mockResolvedValue({ id: 'fixture-group', name: 'Fixture group', type: 'manager' });
  db.placementRecord.findFirst.mockResolvedValue({
    id: 'fixture-placement', userId: fixtureMember.id, user: fixtureMember,
    placementSurveys: [{ id: 'fixture-survey', wave: 'thirty_day', deliveryAttempt: 1, acceptedAttempt: 0,
      tokenExpiresAt: new Date('2027-01-01'), deliveryPayload: surveyPayload }],
  });
  db.xapiStatement.findMany.mockResolvedValue([{ statementId: 'fixture-statement', actorEmail: fixtureMember.email, verb: 'completed' }]);
});
afterEach(() => vi.restoreAllMocks());

function expectNoDataOrEffects() {
  for (const value of Object.values(db)) {
    if (typeof value === 'function') expect(value).not.toHaveBeenCalled();
    else for (const fn of Object.values(value)) expect(fn).not.toHaveBeenCalled();
  }
  for (const fn of [mocks.snapshot, mocks.chat, mocks.sendInterview, mocks.sendEligibility,
    mocks.sendSurvey, mocks.prepareSurvey, mocks.issueToken, mocks.progress, mocks.audit,
    mocks.auditEvent, mocks.getSubjectOrg]) expect(fn).not.toHaveBeenCalled();
}

describe.each(cases)('$name actor tenant boundary', ({ run, scope }) => {
  it('stops before data access or effects when ordinary actor org resolution fails', async () => {
    mocks.getOrg.mockRejectedValueOnce(new Error('actor organization unavailable'));
    const response = await run();
    expect(response.status).toBe(500);
    expect(mocks.getOrg).toHaveBeenCalledWith('actor-1');
    expectNoDataOrEffects();
  });
  it('retains the organization filter for an ordinary administrator', async () => {
    expect((await run()).status).toBe(200);
    scope('org-1');
    expect(mocks.getOrg).toHaveBeenCalledWith('actor-1');
  });
  it('retains only the explicit super-admin cross-tenant path', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.getOrg.mockRejectedValue(new Error('must not be needed for positive super-admin branch'));
    expect((await run()).status).toBe(200);
    scope(undefined);
    expect(mocks.getOrg).not.toHaveBeenCalled();
  });
});

describe.each(cases.filter((entry) => 'target' in entry))('$name foreign subject', ({ run, scope, target }) => {
  it('returns not found and never mutates, sends, generates, or backfills a foreign member', async () => {
    target!.mockResolvedValueOnce(target === db.user.findMany ? [] : null);
    expect((await run()).status).toBe(404);
    scope('org-1');
    for (const value of Object.values(db)) {
      if (typeof value !== 'object') continue;
      for (const operation of ['create', 'update', 'delete'] as const) expect(value[operation]).not.toHaveBeenCalled();
    }
    for (const fn of [mocks.chat, mocks.sendInterview, mocks.sendEligibility, mocks.sendSurvey,
      mocks.issueToken, mocks.progress, mocks.audit, mocks.auditEvent]) expect(fn).not.toHaveBeenCalled();
  });
});

describe('duplicate-member server page tenant boundary', () => {
  it('does not run the duplicate detector when the later actor org lookup fails', async () => {
    mocks.getOrg.mockRejectedValueOnce(new Error('actor organization unavailable'));
    await expect(DuplicatesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/admin/members/duplicates?ui=legacy');
    expectNoDataOrEffects();
    expect(mocks.capture).toHaveBeenCalledOnce();
  });
  it('scopes duplicate detection to the ordinary administrator organization', async () => {
    await DuplicatesPage({ searchParams: Promise.resolve({}) });
    sqlScope('org-1');
  });
  it('retains explicit super-admin duplicate detection across organizations', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    await DuplicatesPage({ searchParams: Promise.resolve({}) });
    sqlScope(undefined);
    expect(mocks.getOrg).not.toHaveBeenCalled();
  });
});

describe.each(['preview', 'dry-run'])('partner digest %s recipient boundary', (mode) => {
  const partners = [
    { organizationId: 'org-1', name: 'Own partner', contactEmail: 'own@example.test' },
    { organizationId: 'org-2', name: 'Other partner', contactEmail: 'other@example.test' },
  ];
  const run = () => mode === 'preview'
    ? preview(req('email-crons/partner-outcome-digest/preview'), params('partner-outcome-digest'))
    : dryRun(req('email-crons/partner-outcome-digest/dry-run', 'POST'), params('partner-outcome-digest'));
  const usePartners = (rows: typeof partners) => {
    const matches = (args: { where: { organizationId?: string } }) =>
      rows.filter((partner) => !args.where.organizationId || partner.organizationId === args.where.organizationId);
    db.partner.findMany.mockImplementation(async (args) => matches(args).slice(0, args.take));
    db.partner.count.mockImplementation(async (args) => matches(args).length);
  };
  it('includes only its own organization in recipients, sample and count', async () => {
    usePartners(partners);
    const body = await (await run()).json();
    expect(JSON.stringify(body)).toContain('own@example.test');
    expect(JSON.stringify(body)).not.toContain('other@example.test');
    expect(mode === 'preview' ? body.count : body.recipientCount).toBe(1);
  });
  it('returns no recipient when only a foreign partner is eligible', async () => {
    usePartners([partners[1]]);
    const body = await (await run()).json();
    expect(mode === 'preview' ? body.count : body.recipientCount).toBe(0);
    expect(mode === 'preview' ? body.recipients : body.sampleRecipient).toEqual(mode === 'preview' ? [] : null);
    expect(JSON.stringify(body)).not.toContain('other@example.test');
  });
  it('retains cross-tenant recipients and counts for a positive super-admin role', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    usePartners([partners[1], partners[0]]);
    const body = await (await run()).json();
    expect(JSON.stringify(body)).toContain('other@example.test');
    expect(mode === 'preview' ? body.count : body.recipientCount).toBe(2);
    expect(mocks.getOrg).not.toHaveBeenCalled();
  });
});
