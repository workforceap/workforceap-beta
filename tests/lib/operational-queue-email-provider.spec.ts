// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), log: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { emailSendLog: { upsert: mocks.log } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));

import { sendOnboardingStallsDigestEmail, sendEmployerPendingApplicantsEmail, sendAdminStaleApplicantsDigestEmail } from '@/lib/email';
import { resetProviderSuppressionCache } from '@/lib/email/suppressions';

const metadata = { entityType: 'operational_queue_digest', entityId: 'queue/2026-10-11/state', idempotencyKey: 'queue/2026-10-11/state/payload' };
const onboarding = () => sendOnboardingStallsDigestEmail({
  to: ['staff@example.org'], interviewCount: 0, wioaCount: 0, noProgramCount: 1,
  interviewMembers: [], wioaMembers: [], noProgramMembers: [],
  interviewQueueLink: 'https://www.workforceap.org/admin/members/interview-ready',
  wioaQueueLink: 'https://www.workforceap.org/admin/wioa-screening',
  membersQueueLink: 'https://www.workforceap.org/admin/members',
  memberAdminBaseUrl: 'https://www.workforceap.org/admin/members',
  userId: 'staff', ...metadata,
});
const employer = () => sendEmployerPendingApplicantsEmail({
  to: 'owner@example.org', candidateCount: 1, jobsAffected: 1, oldestWaitingDays: 6, userId: 'owner', ...metadata,
});
const admin = () => sendAdminStaleApplicantsDigestEmail({ employers: [{ companyName: 'Synthetic Company', candidateCount: 10 }], ...metadata });

beforeEach(() => {
  vi.clearAllMocks(); resetProviderSuppressionCache();
  vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-only');
  vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-only');
  vi.stubEnv('EMAIL_FROM', 'hello@workforceap.org');
  vi.stubEnv('EMAIL_TO_ADMIN', 'staff@example.org');
  vi.stubEnv('EMAIL_FIXTURE_DOMAINS', ''); vi.stubEnv('EMAIL_FIXTURE_ADDRESSES', '');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'list', has_more: false, data: [] }), { status: 200 })));
  mocks.send.mockResolvedValue({ data: { id: 'synthetic-receipt' }, error: null });
  mocks.log.mockResolvedValue({});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('operational digest provider acceptance and history metadata', () => {
  it.each([
    ['onboarding', onboarding, 'onboarding_stalls_digest', 'staff'],
    ['employer', employer, 'employer_pending_applicants', 'owner'],
    ['staff backlog', admin, 'admin_stale_applicants_digest', null],
  ] as const)('threads %s digest identity through provider acceptance to the send ledger', async (_label, send, templateKey, userId) => {
    expect(await send()).toEqual({ ok: true });
    expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: metadata.idempotencyKey });
    expect(mocks.log.mock.calls.at(-1)![0].create).toMatchObject({
      ...metadata, userId, templateKey, status: 'sent', providerMessageId: 'synthetic-receipt',
    });
  });

  it('records a resolved provider rejection as failed history so the queue can retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Synthetic rejection', statusCode: 422 } });
    expect(await employer()).toMatchObject({ ok: false });
    expect(mocks.log.mock.calls.at(-1)![0].create).toMatchObject({ ...metadata, status: 'failed', providerMessageId: null });
    expect(mocks.log.mock.calls.some(([args]) => args.create.status === 'sent')).toBe(false);
  });

  it('keeps a missing acceptance receipt out of successful queue history and returns a retryable failed outcome', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.send.mockResolvedValue({ data: null, error: null });
    expect(await employer()).toMatchObject({ ok: false, error: expect.stringContaining('acceptance receipt') });
    expect(mocks.log.mock.calls.at(-1)![0].create).toMatchObject({
      ...metadata, userId: 'owner', status: 'failed', providerMessageId: null, failureClass: 'unknown',
    });
    expect(mocks.log.mock.calls.some(([args]) => args.create.status === 'sent')).toBe(false);
    expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: metadata.idempotencyKey });
  });
});
