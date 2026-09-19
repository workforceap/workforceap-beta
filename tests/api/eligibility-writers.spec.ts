import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  store: {} as any, actorId: 'member-1' as string | null, after: vi.fn(), audit: vi.fn(),
  transaction: vi.fn(), lock: vi.fn(), profile: vi.fn(), screening: vi.fn(), update: vi.fn(),
  consume: vi.fn(), realTransactions: true, failScreening: false, failLeadAudit: false,
  jsonConflict: false, expireAtConsume: false, failPreScreening: false,
  databaseError: null as unknown,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => h.actorId ? { id: h.actorId, email: 'actor@example.test' } : null }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => h.realTransactions }));
vi.mock('@/lib/rate-limit', () => ({ checkPublicQuestionnaireSubmitRateLimit: async () => ({ success: true }) }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: h.after }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/audit', () => ({ auditLog: async (input: unknown, tx?: { saveLead: (input: unknown) => void }) => {
  h.audit(input, tx);
  if (tx) { if (h.failLeadAudit) throw new Error('Evidence write failed'); tx.saveLead(input); }
} }));
vi.mock('@/lib/email', () => ({ sendEligibilityScreeningAdminEmail: vi.fn(), sendEligibilityScreeningConfirmationEmail: vi.fn(), sendPreScreeningReadyEmail: vi.fn() }));
vi.mock('@/lib/counselor/ambassadorAutoAssign', () => ({ autoAssignAmbassadorFromReferral: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $transaction: (...args: unknown[]) => h.transaction(...args),
  tokenizedLink: {
    findUnique: async ({ where }: any) => where.token === h.store.token.token ? structuredClone(h.store.token) : null,
    updateMany: async (args: unknown) => h.consume(args),
  },
} }));

import { PATCH as memberPatch } from '@/app/api/member/eligibility/route';
import { POST as tokenPost } from '@/app/api/q/[token]/submit/route';
import { POST as preScreeningPost } from '@/app/api/member/pre-screening/route';
import { consumeTokenizedLink } from '@/lib/tokenizedLink';

const token = 'local-fixture-questionnaire-token-1234567890';
const oldSnapshot = { version: 2, submittedAt: '2026-09-01T00:00:00Z', answers: { retained: true }, reasons: [{ code: 'staff_review' }], signal: 'review', extraServerMetadata: { keep: true } };
const questionnaire = { q1: 'no', q2: 'no', q3: 'yes', snapWic: 'yes', ageGroup: '25_50', county: ' Fulton ', city: 'Atlanta', primaryBarriers: ['none', 'transportation'], partnerAmbassadorReferral: ' Fixture Ambassador ' };
function request(body: unknown, method = 'PATCH') {
  return new Request('http://localhost/api/test', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as NextRequest;
}
const submitToken = (body: unknown = questionnaire) => tokenPost(request(body, 'POST'), { params: Promise.resolve({ token }) });

function transactionClient(draft: any) {
  return {
    $queryRaw: async (query: Prisma.Sql) => {
      h.lock(query);
      const [id, org] = query.values;
      return draft.member.id === id && !draft.member.deletedAt && (org === undefined || draft.member.organizationId === org) ? [{ id }] : [];
    },
    user: {
      findUnique: async ({ where }: any) => draft.member.id === where.id ? structuredClone(draft.member) : null,
      findFirst: async ({ where }: any) => draft.member.id === where.id && !draft.member.deletedAt && (!where.organizationId || where.organizationId === draft.member.organizationId) ? structuredClone(draft.member) : null,
      updateMany: async (args: any) => {
        h.update(args);
        if (h.jsonConflict) return { count: 0 };
        const expected = args.where.wioaQualificationJson.equals;
        if (expected !== Prisma.AnyNull && JSON.stringify(expected) !== JSON.stringify(draft.member.wioaQualificationJson)) return { count: 0 };
        Object.assign(draft.member, args.data);
        return { count: 1 };
      },
      update: async ({ data }: any) => { Object.assign(draft.member, data); return draft.member; },
    },
    profile: { upsert: async (args: any) => { h.profile(args); Object.assign(draft.profile, args.update); return draft.profile; } },
    applyEligibilityScreening: { upsert: async (args: any) => {
      h.screening(args);
      if (h.failScreening) throw new Error('Screening unavailable');
      draft.screening = { ...args.create, ...args.update };
      return draft.screening;
    } },
    tokenizedLink: { updateMany: async (args: any) => {
      h.consume(args);
      if (h.expireAtConsume) draft.token.expiresAt = new Date(0);
      const where = args.where;
      if (draft.token.id !== where.id || draft.token.consumedAt ||
          (where.expiresAt && draft.token.expiresAt < where.expiresAt.gte) ||
          draft.token.subjectUserId !== where.subjectUserId || draft.token.orgId !== where.orgId || draft.token.type !== where.type) return { count: 0 };
      draft.token.consumedAt = args.data.consumedAt;
      return { count: 1 };
    } },
    preScreeningDraft: { deleteMany: async () => { draft.preDraft = null; return { count: 1 }; } },
    preScreeningResponse: {
      findUnique: async () => draft.preScreening,
      create: async ({ data }: any) => { if (h.failPreScreening) throw new Error('Response unavailable'); draft.preScreening = { id: 'pre-1', ...data }; return draft.preScreening; },
    },
    saveLead: (input: unknown) => { draft.lead = input; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.actorId = 'member-1'; h.realTransactions = true;
  h.failScreening = false; h.failLeadAudit = false; h.jsonConflict = false; h.expireAtConsume = false; h.failPreScreening = false; h.databaseError = null;
  h.store = {
    member: { id: 'member-1', organizationId: 'org-1', deletedAt: null, fullName: 'Fixture Member', email: 'member@example.test', wioaQualificationJson: structuredClone(oldSnapshot), assessmentCompleted: true },
    profile: { city: 'Existing city', state: 'GA', zip: '30301', barrierTypes: ['housing'] }, screening: null, lead: null,
    token: { id: 'link-1', token, type: 'eligibility_questionnaire', orgId: 'org-1', subjectUserId: 'member-1', email: 'member@example.test', consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) },
    preDraft: { saved: true }, preScreening: null,
  };
  // Mock transaction commit/rollback instead of immediately mutating committed state.
  let transactionTail: Promise<unknown> = Promise.resolve();
  h.transaction.mockImplementation((callback: (tx: unknown) => unknown) => {
    const run = transactionTail.then(async () => {
      if (h.databaseError) throw h.databaseError;
      const draft = structuredClone(h.store);
      const result = await callback(transactionClient(draft));
      h.store = draft;
      return result;
    });
    transactionTail = run.catch(() => {});
    return run;
  });
});

describe('eligibility persistence', () => {
  it('saves the authenticated subject, preserves self-screening/ancillary keys, and keeps its existing qualification rule', async () => {
    const response = await memberPatch(request({ ...questionnaire, userId: 'another-member', organizationId: 'other-org' }));
    expect(response.status).toBe(200);
    expect(h.store.member.wioaQualificationJson).toMatchObject(oldSnapshot);
    expect(h.store.member.wioaQualificationJson.eligibilityForm).toMatchObject({ ageGroup: '25_50', county: 'Fulton', snapWic: 'yes', partnerAmbassadorReferral: 'Fixture Ambassador' });
    expect(h.store.screening).toMatchObject({ userId: 'member-1', organizationId: 'org-1', q1: 'no', q2: 'no', q3: 'yes', qualifies: true, yesCount: 1 });
    expect(h.store.profile).toMatchObject({ city: 'Atlanta', state: 'GA', barrierTypes: ['transportation'] });
    expect(h.lock.mock.calls[0][0].sql).toContain('FOR UPDATE');
    expect(h.lock.mock.invocationCallOrder[0]).toBeLessThan(h.profile.mock.invocationCallOrder[0]);
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(h.after).toHaveBeenCalledTimes(3);
  });

  it.each([null, 'legacy scalar', []])('accepts legacy JSON %j without spreading it into fake object keys', async (previous) => {
    h.store.member.wioaQualificationJson = previous;
    const response = await memberPatch(request({ county: 'Fulton' }));
    expect(response.status).toBe(200);
    expect(Object.keys(h.store.member.wioaQualificationJson)).toEqual(['eligibilityForm']);
    expect(h.store.screening).toBeNull();
    expect(h.store.profile).toEqual({ city: 'Existing city', state: 'GA', zip: '30301', barrierTypes: ['housing'] });
  });

  it('rolls back profile and JSON when screening persistence fails, with no notifications', async () => {
    h.failScreening = true;
    const before = structuredClone(h.store);
    expect((await memberPatch(request(questionnaire))).status).toBe(500);
    expect(h.store).toEqual(before);
    expect(h.after).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['cas', 'serialization'])('reports a %s conflict without acknowledging or emitting effects', async (kind) => {
    if (kind === 'cas') h.jsonConflict = true;
    else h.databaseError = new Prisma.PrismaClientKnownRequestError('Serialization conflict', { code: 'P2034', clientVersion: 'test' });
    expect((await memberPatch(request(questionnaire))).status).toBe(409);
    expect(h.store.member.wioaQualificationJson).toEqual(oldSnapshot);
    expect(h.after).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated or deleted subjects without writes', async () => {
    h.actorId = null;
    expect((await memberPatch(request(questionnaire))).status).toBe(401);
    h.actorId = 'member-1'; h.store.member.deletedAt = new Date();
    expect((await memberPatch(request(questionnaire))).status).toBe(404);
    expect(h.profile).not.toHaveBeenCalled();
  });

  it('requires a real transaction before any member writes', async () => {
    h.realTransactions = false;
    expect((await memberPatch(request(questionnaire))).status).toBe(503);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('repeated submissions update a single screening rather than duplicating it', async () => {
    expect((await memberPatch(request(questionnaire))).status).toBe(200);
    expect((await memberPatch(request({ q1: 'no', q2: 'no' }))).status).toBe(200);
    expect(h.store.screening).toMatchObject({ userId: 'member-1', q3: null, qualifies: false, yesCount: 0, snapWic: null });
    expect(h.screening.mock.calls.every(([args]) => args.where.userId === 'member-1')).toBe(true);
  });
});

describe('token questionnaire', () => {
  it('writes only the token subject and atomically claims its type, org and expiry', async () => {
    h.actorId = 'different-signed-in-user';
    expect((await submitToken({ ...questionnaire, userId: h.actorId })).status).toBe(200);
    expect(h.store.screening.userId).toBe('member-1');
    expect(h.store.token.consumedAt).toBeInstanceOf(Date);
    expect(h.consume).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'link-1', consumedAt: null, type: 'eligibility_questionnaire', email: 'member@example.test', subjectUserId: 'member-1', orgId: 'org-1', expiresAt: { gte: expect.any(Date) } } }));
    expect((await submitToken()).status).toBe(410);
    expect(h.screening).toHaveBeenCalledOnce();
  });

  it.each(['screening', 'cas', 'foreign-org'])('rolls back token consumption after %s failure', async (failure) => {
    if (failure === 'screening') h.failScreening = true;
    if (failure === 'cas') h.jsonConflict = true;
    if (failure === 'foreign-org') h.store.member.organizationId = 'different-org';
    const before = structuredClone(h.store);
    expect((await submitToken()).status).toBe(failure === 'screening' ? 500 : failure === 'cas' ? 409 : 404);
    expect(h.store).toEqual(before);
    expect(h.after).not.toHaveBeenCalled();
  });

  it('rechecks expiry at consumption after successful initial validation', async () => {
    h.expireAtConsume = true;
    expect((await submitToken()).status).toBe(409);
    expect(h.store.token.consumedAt).toBeNull();
    expect(h.profile).not.toHaveBeenCalled();
  });

  it('accepts at most one concurrent submission of the same token', async () => {
    const responses = await Promise.all([submitToken(), submitToken()]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409 || response.status === 410)).toHaveLength(1);
    expect(h.screening).toHaveBeenCalledOnce();
    expect(h.after).toHaveBeenCalledTimes(3);
  });

  it('rejects an expired token before starting the transaction', async () => {
    h.store.token.expiresAt = new Date(0);
    expect((await submitToken()).status).toBe(410);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('preserves subject-bound legacy links without an org while storing the subject actual organization', async () => {
    h.store.token.orgId = null;
    expect((await submitToken()).status).toBe(200);
    expect(h.store.screening.organizationId).toBe('org-1');
  });

  it('rolls back a no-account lead claim if durable audit storage fails', async () => {
    h.store.token.subjectUserId = null; h.failLeadAudit = true;
    expect((await submitToken()).status).toBe(500);
    expect(h.store.token.consumedAt).toBeNull();
    expect(h.store.lead).toBeNull();
    expect(h.after).not.toHaveBeenCalled();
  });

  it('records a no-account lead and consumes the token without creating a member or profile', async () => {
    h.store.token.subjectUserId = null;
    expect((await submitToken()).status).toBe(200);
    expect(h.store.lead).toMatchObject({ actorUserId: null, action: 'public_eligibility_lead_submitted', targetId: 'link-1' });
    expect(h.store.token.consumedAt).toBeInstanceOf(Date);
    expect(h.profile).not.toHaveBeenCalled();
    expect(h.screening).not.toHaveBeenCalled();
  });

  it('does not consume a token when real transactions are unavailable', async () => {
    h.realTransactions = false;
    expect((await submitToken()).status).toBe(503);
    expect(h.consume).not.toHaveBeenCalled();
  });

  it('keeps the old standalone consume contract for existing callers', async () => {
    h.consume.mockResolvedValueOnce({ count: 1 });
    expect(await consumeTokenizedLink('legacy-link')).toBe(true);
    expect(h.consume).toHaveBeenCalledWith({ where: { id: 'legacy-link', consumedAt: null }, data: { consumedAt: expect.any(Date) } });
  });
});

describe('distinct pre-screening workflow', () => {
  const body = { employmentStatus: 'Employed', primaryGoal: 'New career', weeklyHours: '5-10 hrs', barrier: 'Transportation', hearAbout: 'Friend', workforceAssistance: true, phone: '5551234567', address: '123 Example St' };
  it('persists its own response/profile fields and assessment gate without writing apply screening or WIOA JSON', async () => {
    expect((await preScreeningPost(request(body, 'POST'))).status).toBe(200);
    expect(h.store.preScreening).toMatchObject({ userId: 'member-1', organizationId: 'org-1', workforceAssistance: true });
    expect(h.store.member.interviewEligible).toBe(true);
    expect(h.store.preDraft).toBeNull();
    expect(h.store.profile).toMatchObject({ profilePhone: body.phone, profileAddress: body.address });
    expect(h.store.member.wioaQualificationJson).toEqual(oldSnapshot);
    expect(h.screening).not.toHaveBeenCalled();
    expect((await preScreeningPost(request(body, 'POST'))).status).toBe(400);
    expect(h.after).toHaveBeenCalledOnce();
  });

  it('rejects an incomplete assessment without effects and retains a draft after transaction failure', async () => {
    h.store.member.assessmentCompleted = false;
    expect((await preScreeningPost(request(body, 'POST'))).status).toBe(400);
    h.store.member.assessmentCompleted = true; h.failPreScreening = true;
    expect((await preScreeningPost(request(body, 'POST'))).status).toBe(500);
    expect(h.store.preDraft).toEqual({ saved: true });
    expect(h.store.preScreening).toBeNull();
    expect(h.after).not.toHaveBeenCalled();
  });
});
