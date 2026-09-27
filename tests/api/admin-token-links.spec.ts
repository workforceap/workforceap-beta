import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: any) => handler,
}));
vi.mock('@/lib/tokenizedLink', () => ({ createTokenizedLink: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
}));
vi.mock('@/lib/auth/actAsSubject', () => ({ resolveActOnBehalf: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEligibilityLink: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkAdminTokenLinksRateLimit: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), user: { findUnique: vi.fn() } },
}));

// ─── Imports after mocks ───
import { POST } from '@/app/api/admin/token-links/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { createTokenizedLink } from '@/lib/tokenizedLink';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { sendEligibilityLink } from '@/lib/email';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { checkAdminTokenLinksRateLimit } from '@/lib/rate-limit';

const postReq = (body: unknown) =>
  new Request('http://localhost:3000/api/admin/token-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/admin/token-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createTokenizedLink).mockResolvedValue({ token: 'tok-123' } as any);
    vi.mocked(checkAdminTokenLinksRateLimit).mockResolvedValue({ success: true });
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await POST(postReq({}));
    expect(res.status).toBe(403);
  });

  it('mints an unbound link scoped to the actor org', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('/q/tok-123');
    expect(createTokenizedLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'eligibility_questionnaire',
        orgId: 'org-1',
        subjectUserId: null,
      }),
    );
    expect(resolveActOnBehalf).not.toHaveBeenCalled();
  });

  it('gates subject-bound links through resolveActOnBehalf before any lookup', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(resolveActOnBehalf).mockResolvedValue({
      ok: true,
      subjectUserId: 'member-1',
      isOnBehalf: true,
      actorUserId: 'admin-1',
      actorName: 'Admin One',
    });
    vi.mocked(getSubjectOrganizationId).mockResolvedValue('org-1');

    const res = await POST(postReq({ subjectUserId: 'member-1' }));
    expect(res.status).toBe(200);
    expect(resolveActOnBehalf).toHaveBeenCalledWith('admin-1', 'member-1');
    expect(createTokenizedLink).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', subjectUserId: 'member-1' }),
    );
  });

  it('returns 404 for a cross-tenant subjectUserId (no link minted, no PII lookup)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'org-a-admin' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(resolveActOnBehalf).mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Member not found',
    });

    const res = await POST(
      postReq({ subjectUserId: 'org-b-member', email: 'victim@example.com' }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(getSubjectOrganizationId).not.toHaveBeenCalled();
    expect(createTokenizedLink).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(sendEligibilityLink).not.toHaveBeenCalled();
  });

  it('returns 404 when act-on-behalf denies authority (existence-oracle collapse)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(resolveActOnBehalf).mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Not authorized to act on behalf of this member',
    });

    const res = await POST(postReq({ subjectUserId: 'member-x' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(createTokenizedLink).not.toHaveBeenCalled();
  });

  it('fails loudly (500) when org resolution throws instead of minting an unscoped link', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('db down'));

    const res = await POST(postReq({}));
    expect(res.status).toBe(500);
    expect(createTokenizedLink).not.toHaveBeenCalled();
  });

  it('sends the eligibility email with the gated member name when email provided', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(resolveActOnBehalf).mockResolvedValue({
      ok: true,
      subjectUserId: 'member-1',
      isOnBehalf: true,
      actorUserId: 'admin-1',
      actorName: 'Admin One',
    });
    vi.mocked(getSubjectOrganizationId).mockResolvedValue('org-1');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: 'Alice Member' } as any);
    vi.mocked(sendEligibilityLink).mockResolvedValue({ ok: true } as any);

    const res = await POST(
      postReq({ subjectUserId: 'member-1', email: 'alice@example.com' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).emailSent).toBe(true);
    expect(sendEligibilityLink).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com', name: 'Alice Member', orgId: 'org-1', subjectMemberId: 'member-1' }),
    );
  });

  it('still returns the URL when the email send fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
    vi.mocked(sendEligibilityLink).mockResolvedValue({ ok: false, error: 'smtp down' } as any);

    const res = await POST(postReq({ email: 'lead@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.url).toContain('/q/tok-123');
    expect(vi.mocked(sendEligibilityLink).mock.calls[0]?.[0].subjectMemberId).toBeUndefined();
  });

  it('returns 429 when rate-limited', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(checkAdminTokenLinksRateLimit).mockResolvedValue({ success: false });

    const res = await POST(postReq({}));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Try again later.' });
    expect(createTokenizedLink).not.toHaveBeenCalled();
  });

  it('mints a guardian_consent link at /consent/<token> when bound to a member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(resolveActOnBehalf).mockResolvedValue({
      ok: true,
      subjectUserId: 'member-1',
      isOnBehalf: true,
      actorUserId: 'admin-1',
      actorName: 'Admin One',
    });
    vi.mocked(getSubjectOrganizationId).mockResolvedValue('org-1');

    const res = await POST(postReq({ subjectUserId: 'member-1', type: 'guardian_consent' }));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('/consent/tok-123');
    expect(createTokenizedLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'guardian_consent', subjectUserId: 'member-1' }),
    );
    expect(sendEligibilityLink).not.toHaveBeenCalled();
  });

  it('rejects guardian_consent without a bound member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const res = await POST(postReq({ type: 'guardian_consent' }));
    expect(res.status).toBe(400);
    expect(createTokenizedLink).not.toHaveBeenCalled();
  });

  it('rejects an unsupported token link type', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const res = await POST(postReq({ type: 'interview_prep' }));
    expect(res.status).toBe(400);
    expect(createTokenizedLink).not.toHaveBeenCalled();
  });

  it('logs an audit event after minting a link', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const res = await POST(postReq({ email: 'lead@example.com' }));
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'token_link_minted',
        targetType: 'tokenized_link',
        targetId: 'tok-123',
        metadata: {
          type: 'eligibility_questionnaire',
          subjectUserId: null,
          email: 'lead@example.com',
          token: 'tok-123',
        },
      }),
    );
  });
});
