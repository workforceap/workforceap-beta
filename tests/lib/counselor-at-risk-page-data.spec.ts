import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(), isSuperAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/member/persistedAtRisk', () => ({ loadPersistedAtRiskMembers: vi.fn() }));

import {
  AT_RISK_PAGE_FAILURE,
  AT_RISK_PAGE_LIMIT,
  AT_RISK_PAGE_THRESHOLD,
  loadCounselorAtRiskPage,
  resolveAtRiskPageScope,
  type AtRiskPageDeps,
} from '@/lib/counselor/atRiskPageData';
import { getRiskLevel } from '@/lib/member/atRiskScoring';
import { normalizeAtRiskFactors, toAtRiskMemberRow, type SavedAtRiskCase } from '@/lib/member/atRiskRow';

/**
 * Counselor audit §3 item 3: /counselor/at-risk painted "Loading at-risk
 * members…" forever because the data came from a client fetch with no timeout
 * and no failure state. The page now loads saved cases on the server with the
 * same scope as the at-risk API route, and either paints rows or a
 * plain-language failure. These specs pin that loader's behaviour.
 */

const savedCase = (overrides: Partial<SavedAtRiskCase> = {}): SavedAtRiskCase => ({
  alertId: 'alert-1',
  userId: 'member-1',
  name: 'Fixture Member',
  email: 'fixture@example.invalid',
  phone: null,
  score: 75,
  status: 'open',
  factors: [{ name: 'NO_LOGIN_14_DAYS', weight: 40, description: 'No login in 14 days' }],
  enrolledProgram: 'cybersecurity',
  enrolledAt: new Date('2026-06-01T00:00:00Z'),
  memberSince: new Date('2026-05-01T00:00:00Z'),
  profile: null,
  alertCreatedAt: new Date('2026-09-01T00:00:00Z'),
  alertUpdatedAt: new Date('2026-09-15T00:00:00Z'),
  lastActivityAt: null,
  ...overrides,
});

function deps(overrides: Partial<AtRiskPageDeps> = {}): AtRiskPageDeps {
  return {
    isSuperAdmin: vi.fn(async () => false),
    isAdmin: vi.fn(async () => false),
    getActorOrganizationId: vi.fn(async () => 'org-1'),
    loadPersistedAtRiskMembers: vi.fn(async () => ({ total: 0, rows: [] })),
    ...overrides,
  };
}

const never = <T,>(): Promise<T> => new Promise<T>(() => {});

describe('resolveAtRiskPageScope', () => {
  it('scopes a counselor to their own active caseload inside their organization (same as the API route)', async () => {
    await expect(resolveAtRiskPageScope('counselor-1', deps())).resolves.toEqual({
      organizationId: 'org-1',
      counselorUserId: 'counselor-1',
    });
  });

  it('scopes an admin to the whole organization and a super admin to the platform', async () => {
    await expect(resolveAtRiskPageScope('admin-1', deps({ isAdmin: vi.fn(async () => true) }))).resolves.toEqual({
      organizationId: 'org-1',
    });
    const superDeps = deps({ isSuperAdmin: vi.fn(async () => true) });
    await expect(resolveAtRiskPageScope('root', superDeps)).resolves.toEqual({ platform: true });
    expect(superDeps.getActorOrganizationId).not.toHaveBeenCalled();
  });
});

describe('loadCounselorAtRiskPage', () => {
  it('returns an empty ok result when the caseload has no saved cases', async () => {
    const d = deps();
    await expect(loadCounselorAtRiskPage('counselor-1', d)).resolves.toEqual({ status: 'ok', members: [], total: 0 });
    expect(d.loadPersistedAtRiskMembers).toHaveBeenCalledWith(
      { organizationId: 'org-1', counselorUserId: 'counselor-1' },
      { limit: AT_RISK_PAGE_LIMIT, threshold: AT_RISK_PAGE_THRESHOLD },
    );
    expect(AT_RISK_PAGE_THRESHOLD).toBe(0);
    expect(AT_RISK_PAGE_LIMIT).toBe(100);
  });

  it('shapes saved cases into dashboard rows with the shared risk level and ISO timestamps', async () => {
    const d = deps({
      loadPersistedAtRiskMembers: vi.fn(async () => ({
        total: 3,
        rows: [savedCase(), savedCase({ alertId: 'alert-2', userId: 'member-2', score: 42, status: 'acknowledged', factors: 'corrupt' })],
      })),
    });
    const result = await loadCounselorAtRiskPage('counselor-1', d);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.total).toBe(3);
    expect(result.members.map((m) => [m.alertId, m.riskLevel, m.status])).toEqual([
      ['alert-1', 'CRITICAL', 'open'],
      ['alert-2', 'MEDIUM', 'acknowledged'],
    ]);
    expect(result.members[0]).toMatchObject({
      enrolledAt: '2026-06-01T00:00:00.000Z',
      memberSince: '2026-05-01T00:00:00.000Z',
      alertUpdatedAt: '2026-09-15T00:00:00.000Z',
      lastActivityAt: null,
      factors: [{ name: 'NO_LOGIN_14_DAYS', weight: 40, description: 'No login in 14 days' }],
    });
    expect(result.members[1].factors).toEqual([]);
  });

  it('fails soft with plain language when the database read throws, and reports the error', async () => {
    const errors: unknown[] = [];
    const boom = new Error('relation "at_risk_alerts" does not exist');
    const d = deps({ loadPersistedAtRiskMembers: vi.fn(async () => { throw boom; }) });
    await expect(loadCounselorAtRiskPage('counselor-1', d, { onError: (e) => errors.push(e) })).resolves.toEqual({
      status: 'failed',
      message: AT_RISK_PAGE_FAILURE.unavailable,
    });
    expect(errors).toEqual([boom]);
    expect(AT_RISK_PAGE_FAILURE.unavailable).not.toMatch(/relation|does not exist/);
  });

  it('fails soft with a timeout message when the read outlives its budget instead of hanging the page', async () => {
    const started = Date.now();
    const d = deps({ loadPersistedAtRiskMembers: () => never() });
    await expect(loadCounselorAtRiskPage('counselor-1', d, { timeoutMs: 20, onError: () => {} })).resolves.toEqual({
      status: 'failed',
      message: AT_RISK_PAGE_FAILURE.timeout,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('treats a failed role lookup as a failed load, never as an unscoped platform read', async () => {
    const d = deps({ getActorOrganizationId: vi.fn(async () => { throw new Error('no user row'); }) });
    const result = await loadCounselorAtRiskPage('counselor-1', d, { onError: () => {} });
    expect(result.status).toBe('failed');
    expect(d.loadPersistedAtRiskMembers).not.toHaveBeenCalled();
  });
});

describe('at-risk row shaping', () => {
  it('uses the same severity bands as the scoring module at every boundary', () => {
    for (const score of [0, 29, 30, 49, 50, 69, 70, 100]) {
      expect(toAtRiskMemberRow(savedCase({ score })).riskLevel).toBe(getRiskLevel(score));
    }
  });

  it('keeps only well-formed factors and reads unknown statuses as open', () => {
    expect(normalizeAtRiskFactors([{ name: 'A', description: 'a' }, { name: 1 }, null, 'x', { name: 'B', weight: 5, description: 'b' }]))
      .toEqual([{ name: 'A', description: 'a', weight: 0 }, { name: 'B', description: 'b', weight: 5 }]);
    expect(normalizeAtRiskFactors({ name: 'not-an-array' })).toEqual([]);
    expect(toAtRiskMemberRow(savedCase({ status: 'weird' })).status).toBe('open');
  });
});
