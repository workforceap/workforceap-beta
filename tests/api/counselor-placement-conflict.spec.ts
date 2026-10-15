import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  sql: vi.fn(), event: vi.fn(), points: vi.fn(), audit: vi.fn(), auditEvent: vi.fn(),
}));
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'staff-1' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => false, isCounselor: async () => true, isSuperAdmin: async () => false }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: async () => true }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/audit', () => ({ auditLog: state.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: state.auditEvent }));
vi.mock('@/lib/member/points', () => ({ awardPoints: state.points }));
vi.mock('@/lib/db/prisma', () => {
  const db = { user: { findFirst: async () => ({ enrolledProgram: 'it-support', courseEnrollments: [] }) },
    $queryRaw: state.sql, $executeRaw: state.event };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { POST } from '@/app/api/counselor/placements/route';

function request() {
  return new Request('https://example.test/api/counselor/placements', { method: 'POST', body: JSON.stringify({
    userId: 'member-1', employerName: 'New employer', jobTitle: 'New role', startDateVerified: true,
  }) });
}
beforeEach(() => {
  vi.clearAllMocks(); state.existing = null;
  state.event.mockResolvedValue(1); state.points.mockResolvedValue({});
  state.audit.mockResolvedValue(undefined); state.auditEvent.mockResolvedValue(undefined);
  state.sql.mockImplementation(async (strings: TemplateStringsArray) => {
    // Simulate the database's unique-user conflict, including concurrent callers.
    expect(strings.join('?')).toContain('ON CONFLICT (user_id) DO NOTHING');
    if (state.existing) return [];
    state.existing = { id: 'placement-1', user_id: 'member-1', employer_name: 'New employer', start_date_verified: false };
    return [state.existing];
  });
});

describe('counselor placement create conflict', () => {
  it.each([false, true])('preserves an existing verified=%s record without success side effects', async (verified) => {
    const prior = { id: 'existing', user_id: 'member-1', employer_name: 'Original employer', job_title: 'Original role',
      start_date_verified: verified, notes: 'Original history', placed_by: verified ? 'other-staff' : null };
    const before = structuredClone(prior);
    state.existing = prior;
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'PLACEMENT_ALREADY_EXISTS', error: expect.stringContaining('Review the existing record') });
    expect(state.existing).toEqual(before);
    for (const effect of [state.event, state.points, state.audit, state.auditEvent]) expect(effect).not.toHaveBeenCalled();
  });

  it('allows one concurrent create and refuses the duplicate without duplicate events or points', async () => {
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const success = responses.find((response) => response.status === 200)!;
    expect((await success.json()).placement.start_date_verified).toBe(false);
    for (const effect of [state.event, state.points, state.audit, state.auditEvent]) expect(effect).toHaveBeenCalledOnce();
  });
});
