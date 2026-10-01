import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  courseProgress: { groupBy: vi.fn() },
  courseraCourseProgress: { groupBy: vi.fn() },
  auditLog: { groupBy: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));

import { loadCourseraEnrollmentPipeline } from './courseraEnrollmentPipeline';
import { countHiddenTestAccountUnmatchedLearners, countUnmatchedLearners, loadUnmatchedLearners } from '@/lib/coursera/progressQueries';

const XAPI_TABLE_PROBE = /to_regclass\('public\.coursera_xapi_events'\)/;
const isXapiTableProbe = (call: unknown[]) => XAPI_TABLE_PROBE.test((call[0] as TemplateStringsArray).join(''));

/** Raw queries other than the once-per-process `coursera_xapi_events` probe, in call order. */
function rawQueryCalls(): Array<[TemplateStringsArray, ...unknown[]]> {
  return (db.$queryRaw.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>).filter((call) => !isXapiTableProbe(call));
}

/** Probe answers `xapiTablePresent`; other raw queries are served from `results` in order, then []. */
function mockRawQueries(xapiTablePresent: boolean, results: unknown[][] = []): void {
  const queue = [...results];
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    XAPI_TABLE_PROBE.test(strings.join('')) ? [{ present: xapiTablePresent }] : queue.shift() ?? []);
}

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findMany.mockResolvedValue([]);
  db.courseProgress.groupBy.mockResolvedValue([]);
  db.courseraCourseProgress.groupBy.mockResolvedValue([]);
  db.auditLog.groupBy.mockResolvedValue([]);
  mockRawQueries(true);
});

describe('operational enrollment cohort', () => {
  it('keeps a durable assignment with no legacy pointer and does not let an enrollment receipt manufacture activity', async () => {
    db.user.findMany.mockResolvedValueOnce([{
      id: 'member-1', fullName: 'Fixture Member', email: 'fixture@example.invalid', enrolledProgram: null,
      courseEnrollments: [{ programSlug: 'fixture-program', curriculumVersion: 'legacy-v1', isPrimary: true }],
      coursesCompleted: [], courseraEnrollmentApproved: true,
      courseraEnrollmentApprovedAt: null, courseraEnrollmentApprovedById: null, memberProgramProgress: [],
    }]);
    db.auditLog.groupBy.mockResolvedValue([{ targetId: 'member-1', _count: { _all: 1 } }]);
    const result = await loadCourseraEnrollmentPipeline('org-A');
    expect(result.rows[0]).toMatchObject({ programSlug: 'fixture-program', signal: 'approved_not_started', hasEnrollmentReceipt: true, lastActivityAt: null });
    const query = db.user.findMany.mock.calls[0][0];
    expect(query.where.OR).toContainEqual({ courseEnrollments: { some: { organizationId: 'org-A' } } });
    expect(query.select.courseEnrollments.where).toEqual({ organizationId: 'org-A' });
    expect(query.where.organizationId).toBe('org-A');
    expect(db.courseProgress.groupBy.mock.calls[0][0].where.OR).not.toContainEqual({ lastUpdatedAt: expect.anything() });
  });

  it('shows unapproved account activity even without an assignment; unknown event dates stay unknown', async () => {
    db.user.findMany.mockResolvedValueOnce([{
      id: 'member-2', fullName: 'Fixture Member', email: 'fixture@example.invalid', enrolledProgram: null,
      courseEnrollments: [], coursesCompleted: [], courseraEnrollmentApproved: false,
      courseraEnrollmentApprovedAt: null, courseraEnrollmentApprovedById: null, memberProgramProgress: [],
    }]);
    mockRawQueries(true, [[{ userId: 'member-2' }], [{ userId: 'member-2', count: BigInt(2) }]]);
    const result = await loadCourseraEnrollmentPipeline('org-A');
    expect(result.rows[0]).toMatchObject({ programSlug: '', programTitle: 'No active program assignment', signal: 'activity_unknown' });
    expect(result.summary.notApproved).toBe(1);
    expect(result.summary.stalled).toBe(0);
    expect(db.user.findMany.mock.calls[0][0].where.OR).toContainEqual({ id: { in: ['member-2'] } });
    const candidatesQuery = rawQueryCalls()[0];
    expect(candidatesQuery[0].join('')).toMatch(/WHERE u\.organization_id = .* AND u\.deleted_at IS NULL/);
    expect(candidatesQuery[0].join('')).toMatch(/cxe\.matched_user_id = u\.id AND cxe\.organization_id =/);
    expect(candidatesQuery[0].join('')).toMatch(/ORDER BY u\.full_name ASC, u\.id ASC\s+LIMIT 2001/);
    expect(candidatesQuery.slice(1)).toEqual(['org-A', 'org-A']);
    expect(rawQueryCalls()[0][0].join('')).not.toMatch(/MAX\(.*(?:created_at|received_at)/);
  });

  it('a completion imported today does not make old or undated learning recently active', async () => {
    db.user.findMany.mockResolvedValueOnce([{
      id: 'member-3', fullName: 'Fixture Member', email: 'fixture@example.invalid', enrolledProgram: null,
      courseEnrollments: [], coursesCompleted: [], courseraEnrollmentApproved: false,
      courseraEnrollmentApprovedAt: null, courseraEnrollmentApprovedById: null, memberProgramProgress: [],
    }]);
    db.courseProgress.groupBy.mockResolvedValue([{
      userId: 'member-3', _count: { _all: 1 }, _max: { lastActivityAt: null, completedAt: new Date() },
    }]);
    db.courseraCourseProgress.groupBy.mockResolvedValue([{
      userId: 'member-3', _count: { _all: 1 },
      _max: { lastActivityTime: new Date('2000-01-01T00:00:00Z'), completionTime: new Date() },
    }]);
    const result = await loadCourseraEnrollmentPipeline('org-A');
    expect(result.rows[0]).toMatchObject({ signal: 'stalled', lastActivityAt: '2000-01-01T00:00:00.000Z' });
    expect(result.summary.activeLast30Days).toBe(0);
    expect(db.courseProgress.groupBy.mock.calls[0][0]._max).toEqual({ lastActivityAt: true });
    expect(db.courseraCourseProgress.groupBy.mock.calls[0][0]._max).toEqual({ lastActivityTime: true });
  });

  it('degrades instead of failing when coursera_xapi_events is absent (db push databases): no xAPI reads, cohort still loads', async () => {
    vi.resetModules();
    const { loadCourseraEnrollmentPipeline: freshLoad } = await import('./courseraEnrollmentPipeline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockRawQueries(false, [[{ userId: 'member-9' }]]);
      db.user.findMany.mockResolvedValueOnce([{
        id: 'member-4', fullName: 'Fixture Member', email: 'fixture@example.invalid', enrolledProgram: null,
        courseEnrollments: [], coursesCompleted: [], courseraEnrollmentApproved: true,
        courseraEnrollmentApprovedAt: null, courseraEnrollmentApprovedById: null, memberProgramProgress: [],
      }]);
      const result = await freshLoad('org-A');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ memberId: 'member-4', signal: 'approved_not_started' });
      expect(rawQueryCalls()).toEqual([]);
      expect(db.user.findMany.mock.calls[0][0].where.OR).toContainEqual({ id: { in: [] } });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('strict diagnostic read errors', () => {
  it('preserves default fallbacks but lets diagnostics distinguish a failed read from measured zero', async () => {
    const failure = new Error('fixture database unavailable');
    db.$queryRaw.mockRejectedValue(failure);
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(loadUnmatchedLearners('org-A')).resolves.toEqual([]);
      await expect(countUnmatchedLearners('org-A')).resolves.toBe(0);
      await expect(countHiddenTestAccountUnmatchedLearners('org-A')).resolves.toBe(0);
      await expect(loadUnmatchedLearners('org-A', 100, { strict: true })).rejects.toThrow(failure);
      await expect(countUnmatchedLearners('org-A', { strict: true })).rejects.toThrow(failure);
      await expect(countHiddenTestAccountUnmatchedLearners('org-A', { strict: true })).rejects.toThrow(failure);
    } finally {
      logging.mockRestore();
    }
  });
});
