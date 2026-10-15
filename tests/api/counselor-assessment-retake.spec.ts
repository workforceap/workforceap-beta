import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}), auditRequestMeta: () => ({}) }));
vi.mock('@/lib/assessment/retake', () => ({ allowAssessmentRetake: vi.fn() }));

import { POST } from '@/app/api/counselor/assessment-retake/route';
import { getUser } from '@/lib/auth/server';
import { allowAssessmentRetake } from '@/lib/assessment/retake';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

const req = (body: unknown) => new Request('https://x.test/api/counselor/assessment-retake', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'staff-1' } as never);
  vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
  vi.mocked(allowAssessmentRetake).mockResolvedValue({ ok: true, previousScorePct: 27, alreadyPending: false });
});

describe('POST /api/counselor/assessment-retake', () => {
  it('authorizes the requested member and explains the portal prompt', async () => {
    const res = await POST(req({ memberId: 'member-1', reason: 'clicked through' }));
    expect(res.status).toBe(200);
    expect(allowAssessmentRetake).toHaveBeenCalledWith({ memberId: 'member-1', staffUserId: 'staff-1', staffRole: 'counselor', reason: 'clicked through' });
    expect((await res.json()).message).toContain('prompt in their portal');
  });
  it('returns the two-attempt limit clearly', async () => {
    vi.mocked(allowAssessmentRetake).mockResolvedValue({ ok: false, reason: 'limit_reached' });
    const res = await POST(req({ memberId: 'member-1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('both preassessment attempts');
  });
  it('refuses staff without access before attempting authorization', async () => {
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    expect((await POST(req({ memberId: 'member-1' }))).status).toBe(403);
    expect(allowAssessmentRetake).not.toHaveBeenCalled();
  });
  it('refuses staff self-reset', async () => {
    expect((await POST(req({ memberId: 'staff-1' }))).status).toBe(403);
    expect(allowAssessmentRetake).not.toHaveBeenCalled();
  });
  it('requires sign-in and a member id', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    expect((await POST(req({ memberId: 'member-1' }))).status).toBe(401);
    expect((await POST(req({}))).status).toBe(400);
  });
});
