// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), access: vi.fn(), limiter: vi.fn(), send: vi.fn(), view: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/enrollmentAgreements/access', () => ({ requireAgreementActor: mocks.actor, requireAgreementMemberAccess: mocks.access }));
vi.mock('@/lib/rate-limit', () => ({ checkEnrollmentTemplateSendRateLimit: mocks.limiter }));
vi.mock('@/lib/enrollmentAgreements/templateSend', () => ({ sendApprovedTemplate: mocks.send, getTemplateSendView: mocks.view }));

import { GET, POST } from '@/app/api/enrollment-agreements/template/send/route';
import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';

const body = {
  memberId: '11111111-1111-4111-8111-111111111111',
  operationId: '22222222-2222-4222-8222-222222222222',
  templateVersion: '2026-09-30', recipientEmail: 'student@example.org', expectedLatestOperationId: null,
};
const request = (overrides: RequestInit & { body?: string } = {}) => new Request('https://portal.test/api/enrollment-agreements/template/send', {
  method: 'POST', headers: { origin: 'https://portal.test', 'content-type': 'application/json' }, body: JSON.stringify(body), ...overrides,
});
const getRequest = (memberId?: string) => new Request(
  `https://portal.test/api/enrollment-agreements/template/send${memberId ? `?memberId=${memberId}` : ''}`,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: 'admin-1', organizationId: 'org-1', role: 'admin' });
  mocks.access.mockResolvedValue({ canSendTemplate: true });
  mocks.limiter.mockResolvedValue({ success: true });
  mocks.send.mockResolvedValue({ acceptedAt: '2026-10-12T12:00:00.000Z', alreadyAccepted: false });
  mocks.view.mockResolvedValue({ available: true, latest: null });
});

describe('enrollment template send route', () => {
  it('keeps the collection flag gate ahead of rate limiting and provider work', async () => {
    mocks.actor.mockRejectedValue(new EnrollmentAgreementError(503, 'ENROLLMENT_AGREEMENTS_UNAVAILABLE', 'Unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not claim or send when the outbound limit is reached', async () => {
    mocks.limiter.mockResolvedValue({ success: false });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('authorizes the target before consuming its rate-limit bucket', async () => {
    mocks.access.mockRejectedValue(new EnrollmentAgreementError(403, 'FORBIDDEN', 'Forbidden'));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.limiter).not.toHaveBeenCalled();
  });

  it('passes the confirmed address, never a caller-selected attachment', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith({ id: 'admin-1', organizationId: 'org-1', role: 'admin' },
      body.memberId, body.operationId, body.recipientEmail, null);
  });

  it('rejects extra fields, the wrong template version, and invalid JSON before claiming a send', async () => {
    const extra = await POST(request({ body: JSON.stringify({ ...body, attachment: 'attacker.pdf' }) }));
    const version = await POST(request({ body: JSON.stringify({ ...body, templateVersion: '2025-01-01' }) }));
    const invalid = await POST(request({ body: '{' }));
    expect(extra.status).toBe(400);
    expect(version.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects a cross-site POST before target authorization or provider work', async () => {
    const response = await POST(request({ headers: { origin: 'https://evil.test', 'content-type': 'application/json' } }));
    expect(response.status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reads send status without consuming the outbound rate-limit bucket', async () => {
    expect((await GET(getRequest())).status).toBe(400);
    expect(mocks.view).not.toHaveBeenCalled();
    expect((await GET(getRequest(body.memberId))).status).toBe(200);
    expect(mocks.view).toHaveBeenCalledWith({ id: 'admin-1', organizationId: 'org-1', role: 'admin' }, body.memberId);
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
