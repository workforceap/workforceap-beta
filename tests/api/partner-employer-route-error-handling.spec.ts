// @vitest-environment node
/**
 * Partner- and employer-facing API routes must answer an upstream failure
 * (Prisma, the email provider) with a generic JSON `{ error }`, never with the
 * upstream's own text. Each case below leaked before its fix:
 *
 *  - POST /api/employer/jobs, /api/employer/jobs/import, /api/employer/jobs/import-bulk
 *         answered 500 `{ error, detail: <Prisma error text>, code }`, so the
 *         employer's browser received the raw query / connection message.
 *  - POST /api/partner/invitations
 *         answered 500 `{ error: emailResult.error }`, the email provider's
 *         message (API key / network text), when the invite could not be sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const transaction = vi.fn();
  const sendPartnerReferralInviteEmail = vi.fn();
  const captureApiError = vi.fn();
  return { transaction, sendPartnerReferralInviteEmail, captureApiError };
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

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: h.transaction,
  },
}));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(async () => ({ id: 'user-1', email: 'employer@example.com' })),
}));
vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(async () => ({
    employerId: 'emp-1',
    employer: { id: 'emp-1', status: 'approved', companyName: 'Acme' },
  })),
  getPartnerForUser: vi.fn(async () => ({
    partnerId: 'partner-1',
    partner: { id: 'partner-1', name: 'Partner Org', slug: 'partner-org', organizationId: 'org-1' },
  })),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({
  sendJobSubmittedEmail: vi.fn(async () => undefined),
  sendPartnerReferralInviteEmail: h.sendPartnerReferralInviteEmail,
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limit', () => ({
  checkAdminInviteRateLimit: vi.fn(async () => ({ success: true })),
  checkEmployerJobImportRateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: h.captureApiError }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => fn({})),
}));
vi.mock('@/lib/jobs/listingCache', () => ({ invalidateJobListings: vi.fn(async () => undefined) }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));
vi.mock('@/lib/http/safeOutboundFetch', () => ({
  assertPublicHttpUrl: vi.fn((url: string) => new URL(url)),
  UnsafeUrlError: class UnsafeUrlError extends Error {},
}));
vi.mock('@/lib/ai/parseJob', () => ({
  buildFallbackParsedJobFromScrape: vi.fn(),
  normalizeImportedParsedJob: vi.fn(),
  parseJobFromText: vi.fn(),
  sanitizeScrapedJobText: vi.fn((text: string) => text),
}));
vi.mock('@/lib/ai/atsProviders', () => ({
  detectProvider: vi.fn(() => null),
  fetchSubJobPageText: vi.fn(),
  getImportWaitForMs: vi.fn(() => 0),
  isKnownStructuredApiProvider: vi.fn(() => false),
  isLikelyJobDetailUrl: vi.fn(() => true),
  smartImportJobs: vi.fn(),
}));
vi.mock('@/lib/ai/groq', () => ({ isAIConfigured: vi.fn(() => true) }));
vi.mock('@/lib/employer/bulkJobInsert', () => ({ insertEmployerJobsBatch: vi.fn(async () => []) }));
vi.mock('@/lib/employer/jobImportBulk', () => ({ collectDraftInputsFromPageText: vi.fn(async () => []) }));

import { POST as createJob } from '@/app/api/employer/jobs/route';
import { POST as importJob } from '@/app/api/employer/jobs/import/route';
import { POST as importJobsBulk } from '@/app/api/employer/jobs/import-bulk/route';
import { POST as inviteMember } from '@/app/api/partner/invitations/route';

/** What Prisma reports when the pooled connection drops mid-query. */
const PRISMA_TEXT =
  'Invalid `prisma.job.create()` invocation: Can\'t reach database server at `db.internal:5432`';

const jsonPost = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.transaction.mockReset();
  h.sendPartnerReferralInviteEmail.mockReset();
  h.captureApiError.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function expectGenericServerError(res: Response, sentence: string) {
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body.error).toBe(sentence);
  expect(body).not.toHaveProperty('detail');
  expect(JSON.stringify(body)).not.toContain('prisma');
  expect(JSON.stringify(body)).not.toContain('db.internal');
}

describe('employer job routes keep Prisma error text server-side', () => {
  it('POST /api/employer/jobs', async () => {
    h.transaction.mockRejectedValue(new Error(PRISMA_TEXT));
    const res = await createJob(
      jsonPost('http://localhost/api/employer/jobs', {
        title: 'Support Specialist',
        description: 'Help customers resolve technical issues.',
        status: 'draft',
      }) as never,
    );
    await expectGenericServerError(res, 'Failed to create job draft.');
    expect(h.captureApiError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: 'employer/jobs POST' }));
  });

  it('POST /api/employer/jobs/import', async () => {
    h.transaction.mockRejectedValue(new Error(PRISMA_TEXT));
    const res = await importJob(
      jsonPost('http://localhost/api/employer/jobs/import', { url: 'https://example.com/jobs/1' }) as never,
    );
    await expectGenericServerError(res, 'Failed to import job.');
    expect(consoleError).toHaveBeenCalledWith('Employer job import failed', expect.objectContaining({ message: PRISMA_TEXT }));
  });

  it('POST /api/employer/jobs/import-bulk', async () => {
    h.transaction.mockRejectedValue(new Error(PRISMA_TEXT));
    const res = await importJobsBulk(
      jsonPost('http://localhost/api/employer/jobs/import-bulk', { jobUrls: ['https://example.com/jobs/1'] }) as never,
    );
    await expectGenericServerError(res, 'Failed to create draft jobs.');
    expect(consoleError).toHaveBeenCalledWith('Employer bulk import failed', expect.objectContaining({ message: PRISMA_TEXT }));
  });
});

describe('POST /api/partner/invitations keeps the email provider text server-side', () => {
  const PROVIDER_TEXT = 'API key is invalid (re_123…): request to https://api.resend.com/emails failed';

  it('answers a failed send with one plain sentence', async () => {
    h.transaction
      .mockResolvedValueOnce({ id: 'partner-1', name: 'Partner Org', slug: 'partner-org', referralCode: 'PARTNER1' })
      .mockResolvedValueOnce({ fullName: 'Pat Partner', email: 'pat@example.com' });
    h.sendPartnerReferralInviteEmail.mockResolvedValue({ ok: false, error: PROVIDER_TEXT });

    const res = await inviteMember(
      jsonPost('http://localhost/api/partner/invitations', { email: 'new.member@example.com' }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Invite email failed to send. Please try again in a few minutes.');
    expect(JSON.stringify(body)).not.toContain('API key');
    expect(JSON.stringify(body)).not.toContain('resend.com');
    expect(consoleError).toHaveBeenCalledWith('[partner/invitations] invite email failed:', PROVIDER_TEXT);
  });
});
