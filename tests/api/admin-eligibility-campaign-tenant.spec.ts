// @vitest-environment node
/**
 * POST /api/admin/members/send-eligibility-campaign emails up to 100
 * in-org members. Recipients must stay inside withTenantScope(actor org)
 * and the CHS-excluding MEMBER_ONLY campaign where.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEligibilityCampaignWhere,
  eligibilityCampaignSelect,
  ELIGIBILITY_SOFT_DEADLINE_LABEL,
} from '@/lib/admin/eligibilityDatasheet';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { excludeChsPartnerReferralsWhere } from '@/lib/partners/chsPartner';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  checkBulkEmailRateLimit: vi.fn(),
  findMany: vi.fn(),
  scopedOrg: vi.fn(),
  sendEligibilityLink: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findMany: h.findMany } });
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkBulkEmailRateLimit: h.checkBulkEmailRateLimit,
}));

vi.mock('@/lib/email', () => ({
  sendEligibilityLink: h.sendEligibilityLink,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST } = await import('@/app/api/admin/members/send-eligibility-campaign/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';

function post(body: unknown = {}) {
  return POST(
    new Request('http://localhost/api/admin/members/send-eligibility-campaign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
  );
}

describe('POST /api/admin/members/send-eligibility-campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.checkBulkEmailRateLimit.mockResolvedValue({ success: true });
    h.findMany.mockResolvedValue([]);
    h.sendEligibilityLink.mockResolvedValue({ ok: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before rate-limit when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await post({ dryRun: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.checkBulkEmailRateLimit).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before rate-limit when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await post({ dryRun: true });
    expect(res.status).toBe(403);
    expect(h.checkBulkEmailRateLimit).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 429 without listing when the bulk-email limiter trips', async () => {
    h.checkBulkEmailRateLimit.mockResolvedValue({ success: false });
    const res = await post({ dryRun: true });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.sendEligibilityLink).not.toHaveBeenCalled();
  });

  it('returns 400 without listing when limit is above the send cap', async () => {
    const res = await post({ dryRun: true, limit: 101 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid input');
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('dry-runs inside the actor org with the CHS-excluding member where', async () => {
    h.findMany.mockResolvedValue([
      {
        id: MEMBER_ID,
        email: 'member@org.test',
        fullName: 'Ada',
        organizationId: ORG_ID,
      },
    ]);
    const res = await post({ dryRun: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dryRun: true,
      softDeadline: ELIGIBILITY_SOFT_DEADLINE_LABEL,
      lockout: false,
      recipientCount: 1,
      recipients: [{ id: MEMBER_ID, email: 'member@org.test', fullName: 'Ada' }],
    });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith({
      where: buildEligibilityCampaignWhere({ missingScreeningOnly: true }),
      take: 100,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: eligibilityCampaignSelect,
    });
    const where = h.findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND).toEqual(
      expect.arrayContaining([
        MEMBER_ONLY_WHERE,
        excludeChsPartnerReferralsWhere(),
        { deletedAt: null },
        { applyEligibilityScreenings: { none: {} } },
      ]),
    );
    expect(h.sendEligibilityLink).not.toHaveBeenCalled();
  });

  it('sends with each recipient organizationId and skips blank emails', async () => {
    h.findMany.mockResolvedValue([
      {
        id: MEMBER_ID,
        email: 'member@org.test',
        fullName: 'Ada',
        organizationId: ORG_ID,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        email: '',
        fullName: 'No Mail',
        organizationId: ORG_ID,
      },
    ]);
    const res = await post({ missingScreeningOnly: false, limit: 25 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      dryRun: false,
      lockout: false,
      sent: 1,
      attempted: 2,
    });
    expect(h.findMany.mock.calls[0][0].where).toEqual(
      buildEligibilityCampaignWhere({ missingScreeningOnly: false }),
    );
    expect(h.findMany.mock.calls[0][0].where.AND).not.toEqual(
      expect.arrayContaining([{ applyEligibilityScreenings: { none: {} } }]),
    );
    expect(h.findMany.mock.calls[0][0].take).toBe(25);
    expect(h.sendEligibilityLink).toHaveBeenCalledTimes(1);
    expect(h.sendEligibilityLink).toHaveBeenCalledWith({
      to: 'member@org.test',
      name: 'Ada',
      url: expect.stringContaining('/dashboard/eligibility'),
      orgId: ORG_ID,
      softDeadlineReminder: true,
    });
  });

  it('returns 500 when the tenant list throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await post({ dryRun: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.sendEligibilityLink).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
