/**
 * WAP-172 — a no-account lead's questionnaire answers go to the purgeable
 * public_wioa_screenings store, and the audit log keeps ids and counts only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  token: null as any,
  auditCalls: [] as any[],
  created: [] as any[],
  adminEmail: vi.fn(async (_params: Record<string, unknown>) => ({ ok: true })),
  confirmationEmail: vi.fn(async (_params: Record<string, unknown>) => ({ ok: true })),
  defaultOrg: vi.fn(async () => 'org-default'),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/rate-limit', () => ({ checkPublicQuestionnaireSubmitRateLimit: async () => ({ success: true }) }));
// Run `after()` callbacks inline so the notification arguments are observable.
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (cb: () => unknown) => { void cb(); },
}));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/audit', () => ({ auditLog: async (input: unknown) => { h.auditCalls.push(input); } }));
vi.mock('@/lib/email', () => ({
  sendEligibilityScreeningAdminEmail: (params: Record<string, unknown>) => h.adminEmail(params),
  sendEligibilityScreeningConfirmationEmail: (params: Record<string, unknown>) => h.confirmationEmail(params),
}));
vi.mock('@/lib/counselor/ambassadorAutoAssign', () => ({ autoAssignAmbassadorFromReferral: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: () => h.defaultOrg() }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    tokenizedLink: { updateMany: async () => ({ count: 1 }) },
    publicWioaScreening: {
      create: async (args: any) => { h.created.push(args); return { id: 'lead-row-1' }; },
    },
  };
  return {
    prisma: {
      $transaction: (cb: (t: unknown) => unknown) => cb(tx),
      tokenizedLink: { findUnique: async ({ where }: any) => (where.token === h.token?.token ? structuredClone(h.token) : null) },
    },
  };
});

import { POST } from '@/app/api/q/[token]/submit/route';

const token = 'local-fixture-lead-token-1234567890';
const body = {
  firstName: 'Lead', lastName: 'Person', email: 'lead@example.test', phone: '512-555-0100',
  ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis',
  primaryBarriers: ['transportation', 'none'],
  q1: 'yes', q2: 'yes', q3: 'no', receivingUnemployment: 'yes', exhaustedUnemployment: 'no',
  layoffCompany: 'Acme Logistics', snapWic: 'yes', publicAssistancePrograms: ['snap'], publicAssistanceHelpRequested: 'yes',
  hearAbout: 'Partner or community ambassador', partnerAmbassadorReferral: 'Ambassador Jane',
};
const submit = (payload: unknown = body) =>
  POST(
    new Request('http://localhost/api/q/t/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }) as NextRequest,
    { params: Promise.resolve({ token }) },
  );

/** Values that identify the lead or repeat an answer — none may reach the audit row. */
const SENSITIVE_VALUES = ['lead@example.test', 'Lead', 'Person', '512-555-0100', 'Austin', 'Travis', '78701', 'transportation', 'Acme Logistics', 'Ambassador Jane', 'snap'];

beforeEach(() => {
  h.auditCalls.length = 0;
  h.created.length = 0;
  h.adminEmail.mockClear();
  h.confirmationEmail.mockClear();
  h.defaultOrg.mockClear();
  h.token = { id: 'link-1', token, type: 'eligibility_questionnaire', orgId: 'org-1', subjectUserId: null, email: null, consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) };
});

describe('no-account lead storage (WAP-172)', () => {
  it('stores the answers in public_wioa_screenings under the link organisation', async () => {
    expect((await submit()).status).toBe(200);
    expect(h.created).toHaveLength(1);
    const { data, select } = h.created[0];
    expect(select).toEqual({ id: true });
    expect(data).toMatchObject({ organizationId: 'org-1', fullName: 'Lead Person', email: 'lead@example.test', phone: '512-555-0100', emailSent: false });
    expect(data.snapshot).toMatchObject({
      version: 'public_eligibility_lead_v1', source: 'tokenized_questionnaire', linkId: 'link-1',
      ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', primaryBarriers: ['transportation'],
      answers: { q1: 'yes', q2: 'yes', q3: 'no', layoffCompany: 'Acme Logistics', snapWic: 'yes', publicAssistancePrograms: ['snap'], partnerAmbassadorReferral: 'Ambassador Jane' },
    });
    expect(typeof data.snapshot.submittedAt).toBe('string');
    expect(h.defaultOrg).not.toHaveBeenCalled();
  });

  it('writes the audit event with ids and counts only — no contact details, no answers', async () => {
    expect((await submit()).status).toBe(200);
    expect(h.auditCalls).toHaveLength(1);
    const audit = h.auditCalls[0];
    expect(audit).toMatchObject({ actorUserId: null, action: 'public_eligibility_lead_submitted', targetType: 'tokenized_link', targetId: 'link-1' });
    expect(audit.metadata).toEqual({
      orgId: 'org-1', leadRecordId: 'lead-row-1', store: 'public_wioa_screenings', retentionDays: expect.any(Number),
      answerCount: 11, primaryBarrierCount: 1, hasEmail: true, hasPhone: true,
    });
    const serialized = JSON.stringify(audit.metadata);
    for (const value of SENSITIVE_VALUES) expect(serialized).not.toContain(value);
  });

  it('falls back to the default organisation for a legacy link without one', async () => {
    h.token.orgId = null;
    expect((await submit()).status).toBe(200);
    expect(h.defaultOrg).toHaveBeenCalledOnce();
    expect(h.created[0].data.organizationId).toBe('org-default');
    expect(h.auditCalls[0].metadata).toMatchObject({ orgId: null, leadRecordId: 'lead-row-1' });
  });

  it('hands the admin alert the lead record id instead of a member id', async () => {
    expect((await submit()).status).toBe(200);
    expect(h.adminEmail).toHaveBeenCalledOnce();
    expect(h.adminEmail.mock.calls[0][0]).toMatchObject({ memberId: null, source: 'token', leadRecordId: 'lead-row-1', memberEmail: 'lead@example.test' });
    expect(h.confirmationEmail).toHaveBeenCalledOnce();
  });

  it('uses the link email and a fallback name when the form carries neither', async () => {
    h.token.email = 'from-link@example.test';
    expect((await submit({ q1: 'yes', q2: 'no' })).status).toBe(200);
    expect(h.created[0].data).toMatchObject({ fullName: 'from-link@example.test', email: 'from-link@example.test', phone: null });
    expect(h.auditCalls[0].metadata).toMatchObject({ answerCount: 2, primaryBarrierCount: 0, hasEmail: true, hasPhone: false });
  });
});
