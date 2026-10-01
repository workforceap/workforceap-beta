import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * Column semantics of the /admin/members CSV (admin number audit 2026-09-20):
 * S13 (the export applied its own Health rule), S14 (the "Status" column was
 * the pipeline stage), S17 (Program read the raw `enrolledProgram`), S3 (the
 * members roster downloaded a "students-export" file) and S18 (the "Active"
 * filter threw).
 */
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  memberEventGroupBy: vi.fn(),
  courseProgressGroupBy: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: async () => false }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-a' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_orgId: string, load: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return load(prisma);
  },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: mocks.findMany },
  memberEvent: { groupBy: mocks.memberEventGroupBy },
  courseProgress: { groupBy: mocks.courseProgressGroupBy },
} }));

import { GET as exportMembers } from '@/app/api/admin/members/export/route';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const MEMBER_ID = '00000000-0000-0000-0000-00000000bbbb';

type RecordValue = Record<string, unknown>;

function member(overrides: RecordValue = {}): RecordValue {
  return {
    id: MEMBER_ID,
    fullName: 'Pat Jones',
    email: 'pat@example.test',
    phone: null,
    enrolledProgram: null,
    enrolledAt: new Date('2026-01-05'),
    memberStatus: 'active',
    staleTrainingDetectedAt: null,
    assessmentScorePct: null,
    assessmentCompleted: false,
    updatedAt: new Date('2026-09-01'),
    createdAt: new Date('2026-01-01'),
    lastLoginAt: null,
    pipelineBoardStage: 'in_training',
    profile: {},
    courseEnrollments: [],
    partnerReferrals: [],
    placementRecord: null,
    ...overrides,
  };
}

async function runExport(query = ''): Promise<{ status: number; header: string[]; rows: string[][]; disposition: string }> {
  const response = await exportMembers(
    new Request(`https://workforceap.org/api/admin/members/export${query}`) as never,
  );
  const text = response.status === 200 ? await response.text() : '';
  const lines = text ? text.split('\n') : [];
  return {
    status: response.status,
    header: (lines[0] ?? '').split(','),
    rows: lines.slice(1).filter(Boolean).map((line) => line.split(',')),
    disposition: response.headers.get('Content-Disposition') ?? '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.memberEventGroupBy.mockResolvedValue([]);
  mocks.courseProgressGroupBy.mockResolvedValue([]);
  mocks.findMany.mockResolvedValue([member()]);
});

describe('members CSV columns', () => {
  it('exports the member status the roster chip shows, and keeps the pipeline stage separate (S14)', async () => {
    mocks.findMany.mockResolvedValue([
      member({ memberStatus: 'placed', pipelineBoardStage: 'Active' }),
    ]);

    const { header, rows } = await runExport();
    const statusColumn = header.indexOf('Status');
    const stageColumn = header.indexOf('Pipeline Stage');
    expect(statusColumn).toBeGreaterThan(-1);
    expect(stageColumn).toBeGreaterThan(-1);
    // Before the fix this row exported "Active" for a placed member.
    expect(rows[0][statusColumn]).toBe('placed');
    expect(rows[0][stageColumn]).toBe('Active');
  });

  it('falls back to "active" when memberStatus is unset (S14)', async () => {
    mocks.findMany.mockResolvedValue([member({ memberStatus: null })]);
    const { header, rows } = await runExport();
    expect(rows[0][header.indexOf('Status')]).toBe('active');
  });

  it('resolves Program from the enrollment row when enrolledProgram is null (S17)', async () => {
    mocks.findMany.mockResolvedValue([
      member({
        enrolledProgram: null,
        courseEnrollments: [
          { programSlug: 'software-developer-professional-certificate-ibm', curriculumVersion: 'legacy-v1', isPrimary: true },
        ],
      }),
    ]);

    const { header, rows } = await runExport();
    // Before the fix this cell was blank for every member whose program only
    // exists as a course_enrollments row.
    expect(rows[0][header.indexOf('Program')]).not.toBe('');
    expect(rows[0][header.indexOf('Program')].toLowerCase()).toContain('software');
  });

  it('canonicalizes an alias program slug (S17)', async () => {
    mocks.findMany.mockResolvedValue([
      member({
        enrolledProgram: 'comptia-a-plus',
        courseEnrollments: [{ programSlug: 'comptia-a-plus', curriculumVersion: 'legacy-v1', isPrimary: true }],
      }),
    ]);
    const { header, rows } = await runExport();
    expect(rows[0][header.indexOf('Program')]).not.toBe('');
  });

  it('names the file after the roster it came from (S3)', async () => {
    const { disposition } = await runExport();
    expect(disposition).toContain('members-export-');
    expect(disposition).not.toContain('students-export-');
  });
});

describe('members CSV population (audit S3; Mike: "remove staff in count")', () => {
  it('exports members only by default, matching the screen', async () => {
    await runExport();
    const where = mocks.findMany.mock.calls[0][0].where;
    // One definition of "a member" (WAP-182 item 3): the shared helper,
    // which asks `user_roles` first and falls back to `profiles.role`.
    expect(where).toMatchObject(MEMBER_ONLY_WHERE);
  });

  it('follows the roster\'s "Include staff accounts" box when it is ticked', async () => {
    await runExport('?staff=1');
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject(MEMBER_OR_DOGFOOD_WHERE);
    expect(where).not.toMatchObject(MEMBER_ONLY_WHERE);
  });
});

describe('members CSV row selection', () => {
  it('applies the screen\'s Health rule, so the "Low activity" filter is not empty (S13)', async () => {
    // Last activity 9 days ago: yellow on screen. The old hand-rolled rule in
    // the route called any member with a recent event "green", so this row
    // was dropped from the CSV and `?health=yellow` returned 0 rows.
    mocks.findMany.mockResolvedValue([member({ enrolledAt: daysAgo(120) })]);
    mocks.memberEventGroupBy.mockImplementation(async (args: RecordValue) =>
      '_max' in args
        ? [{ userId: MEMBER_ID, _max: { createdAt: daysAgo(9) } }]
        : [{ userId: MEMBER_ID, _count: { _all: 3 } }],
    );

    const yellow = await runExport('?health=yellow');
    expect(yellow.rows).toHaveLength(1);

    const green = await runExport('?health=green');
    expect(green.rows).toHaveLength(0);
  });

  it('reads logins and course work as activity too (Mike, 2026-09-20)', async () => {
    // Coursera / course work writes no member_events row, so a learner who
    // only studies was exported as Inactive.
    mocks.findMany.mockResolvedValue([member({ enrolledAt: daysAgo(200), lastLoginAt: daysAgo(2) })]);
    mocks.courseProgressGroupBy.mockResolvedValue([
      { userId: MEMBER_ID, _max: { lastActivityAt: daysAgo(2) } },
    ]);

    const red = await runExport('?health=red');
    expect(red.rows).toHaveLength(0);
    const green = await runExport('?health=green');
    expect(green.rows).toHaveLength(1);
  });

  it('excludes nudge emails from the activity aggregates (S1)', async () => {
    await runExport();
    const wheres = mocks.memberEventGroupBy.mock.calls.map((call) => call[0].where);
    expect(wheres).toHaveLength(2);
    for (const where of wheres) {
      expect(where.eventName.notIn).toContain('inactive_nudge_sent');
      expect(where.eventName.notIn).toContain('weekly_recap_generated');
    }
  });

  it('the "Active (recent activity)" filter builds a valid user query (S18)', async () => {
    const { status } = await runExport('?status=active');
    expect(status).toBe(200);
    const where = mocks.findMany.mock.calls[0][0].where;
    const branch = (where.AND as Array<RecordValue>).find((entry) => 'OR' in entry) as
      | { OR: Array<RecordValue> }
      | undefined;
    const courseProgress = branch?.OR.find((entry) => 'courseProgress' in entry) as
      | { courseProgress: { some: RecordValue } }
      | undefined;
    // `updatedAt` does not exist on CourseProgress: it threw
    // PrismaClientValidationError and the CSV returned 500.
    expect(Object.keys(courseProgress!.courseProgress.some)).toContain('lastUpdatedAt');
    expect(Object.keys(courseProgress!.courseProgress.some)).not.toContain('updatedAt');
  });
});
