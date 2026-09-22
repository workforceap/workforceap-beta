import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  raw: vi.fn(), org: vi.fn(), counselor: vi.fn(), assignments: vi.fn(),
  users: vi.fn(), rawUnsafe: vi.fn(), threads: vi.fn(), programs: vi.fn(), ai: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: h.raw, $queryRawUnsafe: h.rawUnsafe,
  $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  counselor: { findFirst: h.counselor }, counselorAssignment: { findMany: h.assignments },
  user: { findMany: h.users, groupBy: h.programs }, messageThread: { findMany: h.threads },
  aIToolResult: { findMany: h.ai }, userCertification: { count: async () => 0 },
  jobApplication: { findMany: async () => [], count: async () => 0 },
  application: { findMany: async () => [], count: async () => 0 },
} }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: h.org }));
vi.mock('@/lib/admin/applicantTriageLoad', () => ({ loadApplicantTriageByUserIds: async () => new Map() }));

import { loadPersistedAtRiskMembers, persistedRiskCommandRow, type PersistedAtRiskMember } from '@/lib/member/persistedAtRisk';
import { MEMBER_ONLY_EXCLUDED_EMAILS, MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { getAdminCommandCenter } from '@/lib/admin/commandCenter';
import { getCounselorCommandCenter } from '@/lib/counselor/commandCenter';

const now = new Date('2026-09-19T12:00:00Z');
const row = (overrides: Partial<PersistedAtRiskMember> = {}): PersistedAtRiskMember => ({
  alertId: 'highest-open-case', userId: 'member-1', name: 'Fixture Member', email: 'fixture@example.invalid',
  phone: null, score: 75, status: 'escalated', factors: [], enrolledProgram: null, enrolledAt: null,
  memberSince: '2020-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2020-01-01T00:00:00Z', alertUpdatedAt: '2020-01-02T00:00:00Z', lastActivityAt: null,
  ...overrides,
});
const riskQueries = () => h.raw.mock.calls.map(call => call[0] as Prisma.Sql).filter(q => q.sql.includes('ranked_alerts'));

beforeEach(() => {
  vi.resetAllMocks();
  h.org.mockResolvedValue('org-1'); h.counselor.mockResolvedValue({ id: 'counselor-1' });
  h.assignments.mockResolvedValue([{ memberId: 'member-1' }]);
  h.users.mockResolvedValue([{ id: 'member-1', fullName: 'Fixture Member', email: 'fixture@example.invalid' }]);
  h.rawUnsafe.mockResolvedValue([]); h.threads.mockResolvedValue([]); h.programs.mockResolvedValue([]); h.ai.mockResolvedValue([]);
  h.raw.mockImplementation(async (query: Prisma.Sql) => query.sql.includes('ranked_alerts')
    ? [{ total: 43, rows: [row()] }]
    : query.sql.includes('oldest') ? [{ oldest: null }] : [{ total: 0, rows: [] }]);
});

describe('persisted risk selection contract', () => {
  it('selects active saved cases, distinct before paging, with stable severity/update/id ordering', async () => {
    const result = await loadPersistedAtRiskMembers({ organizationId: 'org-1' }, { limit: 25, offset: 25 });
    expect(result).toEqual({ total: 43, rows: [row()] });
    const query = riskQueries()[0];
    expect(query.values).toEqual([...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS, 'open', 'acknowledged', 'escalated', 0, 'org-1', 25, 25]);
    // Member-role accounts only: the KPI must agree with the /admin attention tile (number audit S2).
    expect(query.sql).toContain(memberOnlySqlJoin().sql.replace(/\s+/g, ' ').trim());
    expect(query.sql).toMatch(/PARTITION BY a.user_id ORDER BY a.score DESC, a.updated_at DESC, a.id ASC/);
    expect(query.sql).toMatch(/WHERE member_rank = 1/);
    expect(query.sql).toMatch(/SELECT \* FROM members ORDER BY score DESC, updated_at DESC, id ASC LIMIT \? OFFSET \?/);
    expect(query.sql).toContain('COUNT(*)::int FROM members');
    expect(query.sql).toContain('u.deleted_at IS NULL');
    expect(query.sql).toContain('MAX(e.created_at)');
    expect(query.sql).not.toContain('COALESCE(last_event');
    expect(query.sql).not.toContain('stale_training');
    expect(query.sql).not.toContain('coursera_enrollment_approved');
    // A saved old case remains visible: no synthetic expiry.
    expect(query.sql).not.toMatch(/created_at\s*[<>]/);
    // At risk = not active lately AND in a program (Mike, 2026-09-20): a saved
    // alert on a member with no program is not a member at risk.
    expect(query.sql).toContain('u.enrolled_program IS NOT NULL');
  });

  it('uses a current active assignment and same-organization actor for counselors', async () => {
    await loadPersistedAtRiskMembers({ organizationId: 'org-1', counselorUserId: 'counselor-user' }, { limit: 5 });
    const query = riskQueries()[0];
    expect(query.values).toContain('counselor-user'); expect(query.values).toContain('org-1');
    for (const condition of ['ca.active = true', 'c.active = true', 'actor.deleted_at IS NULL', 'actor.organization_id = u.organization_id', 'ca.member_id = u.id']) expect(query.sql).toContain(condition);
  });

  it('fails closed for missing organization or counselor identity', async () => {
    await expect(loadPersistedAtRiskMembers({ organizationId: '' }, { limit: 5 })).rejects.toThrow('organization');
    await expect(loadPersistedAtRiskMembers({ organizationId: 'org-1', counselorUserId: '' }, { limit: 5 })).rejects.toThrow('counselor');
    expect(h.raw).not.toHaveBeenCalled();
  });

  it('retains explicit platform scope without accidental tenant widening', async () => {
    await loadPersistedAtRiskMembers({ platform: true }, { limit: 100 });
    expect(riskQueries()[0].sql).not.toContain('organization_id');
  });

  it('only includes resolved cases when explicitly requesting history', async () => {
    await loadPersistedAtRiskMembers({ organizationId: 'org-1' }, { limit: 20, threshold: 50, status: 'resolved' });
    expect(riskQueries()[0].values).toEqual([...MEMBER_ONLY_EXCLUDED_EMAILS, ...MEMBER_ONLY_EXCLUDED_EMAIL_PATTERNS, 'resolved', 50, 'org-1', 20, 0]);
  });

  it('retains the full member total for an empty page and propagates read failures', async () => {
    h.raw.mockResolvedValueOnce([{ total: 43, rows: [] }]);
    expect(await loadPersistedAtRiskMembers({ organizationId: 'org-1' }, { limit: 20, offset: 60 })).toEqual({ total: 43, rows: [] });
    h.raw.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(loadPersistedAtRiskMembers({ organizationId: 'org-1' }, { limit: 20 })).rejects.toThrow('database unavailable');
  });
});

describe('saved cases are shared by command centers', () => {
  it('returns the same saved member even without a legacy program pointer or a real activity event', async () => {
    const admin = await getAdminCommandCenter('admin', { now });
    const counselor = await getCounselorCommandCenter('counselor-user');
    expect(admin.atRisk).toEqual(counselor.atRisk);
    expect(admin.atRisk[0]).toMatchObject({ memberId: 'member-1', daysInactive: null, riskScore: 75, alertStatus: 'escalated' });
    expect(admin.totals.atRiskCount).toBe(43); expect(counselor.totals.atRiskCount).toBe(43);
    expect(riskQueries()).toHaveLength(2);
    expect(h.assignments.mock.calls[0][0].where.member).toEqual({ organizationId: 'org-1', deletedAt: null });
  });

  it('does not hide saved alerts when the admin fallback enrollment list is empty', async () => {
    h.users.mockResolvedValue([]);
    const result = await getCounselorCommandCenter('admin', { isAdmin: true });
    expect(result.atRisk[0].memberId).toBe('member-1'); expect(result.totals.atRiskCount).toBe(43);
    expect(riskQueries()[0].sql).not.toContain('counselor_assignments');
  });

  it('does not load saved cases for an inactive or absent counselor', async () => {
    h.counselor.mockResolvedValue(null);
    expect((await getCounselorCommandCenter('counselor-user')).totals.atRiskCount).toBe(0);
    expect(h.raw).not.toHaveBeenCalled();
  });

  it('keeps real activity recency separate from severity, including recent and future timestamps', () => {
    expect(persistedRiskCommandRow(row(), now).daysInactive).toBeNull();
    expect(persistedRiskCommandRow(row({ lastActivityAt: '2026-09-18T12:00:00Z' }), now)).toMatchObject({ daysInactive: 1, riskScore: 75 });
    expect(persistedRiskCommandRow(row({ lastActivityAt: '2026-09-20T12:00:00Z' }), now)).toMatchObject({ daysInactive: 0, riskScore: 75 });
  });
});
