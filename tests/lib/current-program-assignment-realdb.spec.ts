// @vitest-environment node
/** Execute the shared production SQL against isolated transaction-local PostgreSQL fixtures. */
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';
import { canonicalProgramSlugSql, confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { enrollmentHistoryWhere, historicalProgramEnrollmentsSql, placementEnrollmentAttributionSql, resolvePlacementEnrollment } from '@/lib/reporting/enrollmentHistory';
import { memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
import { getValidatedProgramCompletionSpec, hasValidatedProgramCompletion } from '@/lib/reporting/programCompletion';
const calls = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: calls.query,
  user: { count: async () => 0, groupBy: async () => [], findMany: async () => [] },
  counselorAssignment: { findMany: async () => [] },
  application: { groupBy: async () => [] }, userCertification: { count: async () => 0 },
  placementRecord: { count: async () => 0, aggregate: async () => ({ _sum: { salaryOffered: 0 } }), groupBy: async () => [], findMany: async () => [] },
  courseEnrollment: { groupBy: async () => [] }, profile: { groupBy: async () => [] },
} }));
import { getAnalyticsOverview } from '@/lib/admin/analytics';
import { getBoardOutcomes, getBoardSnapshot } from '@/lib/admin/boardOutcomes';


const LEGACY = new Date('2026-01-01T12:00:00Z');
const SAVED = new Date('2026-10-15T12:00:00Z');
const PROGRAM = 'comptia-a-professional-certificate';
const enrollment = (programSlug = PROGRAM, isPrimary = true, enrolledAt = SAVED) => ({ programSlug, curriculumVersion: '2026-approved-v2', isPrimary, enrolledAt });
const cases = [
  { id: 'primary-only', enrolledProgram: null, courseEnrollments: [enrollment()] },
  { id: 'primary-wins', enrolledProgram: 'other', courseEnrollments: [enrollment(), enrollment('other', false)] },
  { id: 'alias-match', enrolledProgram: 'comptia-a-plus', courseEnrollments: [enrollment(PROGRAM, false)] },
  { id: 'case-match', enrolledProgram: ' COMPTIA-A-PLUS ', courseEnrollments: [enrollment(PROGRAM, false)] },
  { id: 'unknown-match', enrolledProgram: ' Unknown-Program ', courseEnrollments: [enrollment('unknown-program', false)] },
  { id: 'primary-tie', enrolledProgram: null, courseEnrollments: [enrollment('a-program'), enrollment('z-program')] },
  { id: 'empty-legacy', enrolledProgram: '', courseEnrollments: [] },
  { id: 'empty-primary', enrolledProgram: PROGRAM, courseEnrollments: [enrollment('')] },
  { id: 'legacy-only', enrolledProgram: 'comptia-a-plus', courseEnrollments: [] },
  { id: 'stale-pointer', enrolledProgram: PROGRAM, courseEnrollments: [enrollment('other', false)] },
  { id: 'cleared-history', enrolledProgram: null, courseEnrollments: [enrollment(PROGRAM, false)] },
  { id: 'ambiguous-secondary', enrolledProgram: null, courseEnrollments: [enrollment(PROGRAM, false), enrollment('other', false)] },
  { id: 'no-assignment', enrolledProgram: null, courseEnrollments: [] },
].map((row) => ({ ...row, enrolledAt: LEGACY }));
let client: PrismaClient;

async function fixture(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    await tx.$executeRaw`CREATE TEMP TABLE users (id text PRIMARY KEY, organization_id text, email text, enrolled_program text, enrolled_at timestamp, deleted_at timestamp, member_status text DEFAULT 'active', assessment_completed boolean DEFAULT false) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE course_enrollments (user_id text, program_slug text, curriculum_version text, is_primary boolean, enrolled_at timestamp) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE profiles (user_id text, role text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE roles (id text, name text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE user_roles (user_id text, role_id text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE placement_records (id text, user_id text, placed_at timestamp, program_slug text, salary_offered integer) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE member_program_progress (user_id text, program_slug text, courses_completed integer, average_percent integer) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE member_events (user_id text, created_at timestamp, event_name text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE user_certifications (user_id text, status text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE applications (user_id text, created_at timestamp, status text) ON COMMIT DROP`;
    calls.query.mockImplementation((first: TemplateStringsArray, ...values: unknown[]) => tx.$queryRaw(first, ...values));
    for (const row of cases) {
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,enrolled_program,enrolled_at,deleted_at) VALUES (${row.id}, 'org-a', ${`${row.id}@learners.invalid`}, ${row.enrolledProgram}, ${row.enrolledAt}, NULL)`;
      await tx.$executeRaw`INSERT INTO profiles VALUES (${row.id}, 'member')`;
      for (const ce of row.courseEnrollments) await tx.$executeRaw`INSERT INTO course_enrollments VALUES (${row.id}, ${ce.programSlug}, ${ce.curriculumVersion}, ${ce.isPrimary}, ${ce.enrolledAt})`;
    }
    await run(tx);
  }, { timeout: 15000 });
}

describe.skipIf(process.env.TEST_REAL_DB?.trim() !== '1')('confirmed assignment PostgreSQL parity', () => {
  beforeAll(() => {
    const raw = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? '';
    if (!raw || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(raw).hostname)) throw new Error('Assignment SQL fixtures require an explicit disposable local PostgreSQL.');
    client = new PrismaClient({ datasources: { db: { url: raw } } });
  });
  afterAll(async () => client?.$disconnect());

  it('matches the unchanged resolver for primary, alias, legacy-only and unresolved history, including effective dates', async () => fixture(async (tx) => {
    const actual = await tx.$queryRaw<Array<{ user_id: string; program_slug: string; curriculum_version: string; enrolled_at: Date }>>`SELECT * FROM (${confirmedCurrentProgramAssignmentsSql()}) assignments`;
    const byUser = new Map(actual.map((row) => [row.user_id, row]));
    for (const row of cases) {
      const expected = resolveConfirmedProgramAssignment(row);
      const result = byUser.get(row.id);
      if (!expected.programSlug) expect(result, row.id).toBeUndefined();
      else expect(result, row.id).toEqual({ user_id: row.id, program_slug: expected.programSlug, curriculum_version: expected.curriculumVersion, enrolled_at: expected.enrolledAt });
    }
    expect(actual).toHaveLength(7);
    await tx.$executeRaw`INSERT INTO users (id,enrolled_program,enrolled_at) VALUES ('date-fallback', 'comptia-a-plus', ${LEGACY})`;
    await tx.$executeRaw`INSERT INTO course_enrollments VALUES ('date-fallback', ${PROGRAM}, 'legacy-v1', false, NULL)`;
    const [fallback] = await tx.$queryRaw<Array<{ enrolled_at: Date }>>`SELECT * FROM (${confirmedCurrentProgramAssignmentsSql()}) assignments WHERE user_id = 'date-fallback'`;
    expect(fallback.enrolled_at).toEqual(LEGACY);
  }));

  it('keeps tenant, deleted, staff and fixture exclusions outside the assignment relation', async () => fixture(async (tx) => {
    for (const [id, organization, email, role, deleted] of [
      ['other-tenant', 'org-b', 'other@learners.invalid', 'member', false],
      ['staff', 'org-a', 'staff@learners.invalid', 'admin', false],
      ['fixture', 'org-a', 'referral-member-synthetic@workforceap.org', 'member', false],
      ['deleted', 'org-a', 'deleted@learners.invalid', 'member', true],
    ] as const) {
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,enrolled_program,enrolled_at,deleted_at) VALUES (${id}, ${organization}, ${email}, NULL, NULL, ${deleted ? SAVED : null})`;
      await tx.$executeRaw`INSERT INTO profiles VALUES (${id}, ${role})`;
      await tx.$executeRaw`INSERT INTO course_enrollments VALUES (${id}, ${PROGRAM}, 'legacy-v1', true, ${SAVED})`;
    }
    const rows = await tx.$queryRaw<Array<{ id: string; program: string }>>`
      WITH current_assignments AS (${confirmedCurrentProgramAssignmentsSql()})
      SELECT u.id, ${canonicalProgramSlugSql(Prisma.sql`ca.program_slug`)} AS program
      FROM users u ${memberOnlySqlJoin()} JOIN current_assignments ca ON ca.user_id = u.id
      WHERE u.organization_id = 'org-a' AND u.deleted_at IS NULL ORDER BY u.id
    `;
    expect(rows.map((row) => row.id)).toEqual(['alias-match', 'case-match', 'legacy-only', 'primary-only', 'primary-tie', 'primary-wins', 'unknown-match']);
    expect(rows.filter((row) => row.program === PROGRAM)).toHaveLength(5);
  }));

  it('retains cleared and secondary enrollment history with its own dates without promoting a current assignment', async () => fixture(async (tx) => {
    const history = await tx.$queryRaw<Array<{ user_id: string; enrolled_at: Date }>>`SELECT * FROM (${historicalProgramEnrollmentsSql()}) history WHERE history.enrolled_at >= ${SAVED}`;
    expect(history.some((row) => row.user_id === 'cleared-history')).toBe(true);
    expect(history.some((row) => row.user_id === 'stale-pointer')).toBe(true);
    expect(history.some((row) => row.user_id === 'legacy-only')).toBe(false);
    const where = enrollmentHistoryWhere({ gte: SAVED });
    expect(cases.filter((row) => matchesWhere(row, where)).map((row) => row.id).sort()).toEqual([...new Set(history.map((row) => row.user_id))].sort());
  }));


  it('executes the production analytics and historical Board completion queries with pinned versions and tenant scope', async () => fixture(async (tx) => {
    const ux = 'ux-design-professional-certificate-google';
    for (const [id, organization, primary] of [['complete', 'org-a', true], ['complete-history', 'org-a', false], ['other-org-complete', 'org-b', true]] as const) {
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email) VALUES (${id}, ${organization}, ${`${id}@learners.invalid`})`;
      await tx.$executeRaw`INSERT INTO profiles VALUES (${id}, 'member')`;
      await tx.$executeRaw`INSERT INTO course_enrollments VALUES (${id}, ${ux}, '2026-approved-v2', ${primary}, ${SAVED})`;
      await tx.$executeRaw`INSERT INTO member_program_progress VALUES (${id}, ${ux}, 8, 100)`;
    }
    const current = await getAnalyticsOverview('org-a');
    expect(current.memberStatus.enrolled).toBe(8);
    expect(current.memberStatus.active).toBe(8);
    expect(current.placementRate.completedTraining).toBe(1);
    expect(current.programProgress.find((row) => row.programSlug === ux)).toMatchObject({ avgPercent: 100, activeMembers: 1 });
    const board = await getBoardOutcomes('all-time', 'org-a');
    // Both completed historical assignments count for historical Board service, even after current selection is cleared.
    expect(board.totals.membersCertified).toBe(2);
    expect(board.programs.find((row) => row.programSlug === ux)?.certified).toBe(2);
    await tx.$executeRaw`UPDATE users SET assessment_completed = true WHERE id IN ('complete', 'cleared-history')`;
    const snapshot = await getBoardSnapshot('all-time', 'org-a');
    expect(snapshot.kpis.qualifiedLeads).toBe(1);
    expect(snapshot.cohorts.find((row) => row.month === '2026-10')?.certified).toBe(2);
  }));

  it('matches JavaScript completion validation for case and ECMAScript whitespace without accepting unknown keys, versions or partial completion', async () => fixture(async (tx) => {
    const total = getValidatedProgramCompletionSpec(PROGRAM, 'legacy-v1')!.totalCourses;
    const completed = [
      { id: 'spaces', saved: ' COMPTIA-A-PLUS ', progress: ' COMPTIA-A-PROFESSIONAL-CERTIFICATE ', version: 'legacy-v1', count: total, expected: true },
      { id: 'tabs-newlines', saved: '\t\nCOMPTIA-A-PLUS\r', progress: '\v COMPTIA-A-PROFESSIONAL-CERTIFICATE\t\n', version: 'legacy-v1', count: total, expected: true },
      { id: 'unicode-whitespace', saved: '\ufeff\u00a0COMPTIA-A-PLUS\u2007\u2029', progress: '\u3000COMPTIA-A-PROFESSIONAL-CERTIFICATE\u205f', version: 'legacy-v1', count: total, expected: true },
      { id: 'unknown-key', saved: ' COMPTIA-A-PLUS-extra ', progress: PROGRAM, version: 'legacy-v1', count: total, expected: false },
      { id: 'unknown-version', saved: ' COMPTIA-A-PLUS ', progress: PROGRAM, version: 'unknown-version', count: total, expected: false },
      { id: 'partial', saved: '\tCOMPTIA-A-PLUS\n', progress: PROGRAM, version: 'legacy-v1', count: total - 1, expected: false },
    ];
    for (const row of completed) {
      // Nonprimary alias matching must succeed before completion is considered.
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,enrolled_program) VALUES (${row.id}, 'org-a', ${`${row.id}@learners.invalid`}, ${PROGRAM})`;
      await tx.$executeRaw`INSERT INTO profiles VALUES (${row.id}, 'member')`;
      await tx.$executeRaw`INSERT INTO course_enrollments VALUES (${row.id}, ${row.saved}, ${row.version}, ${row.id === 'unknown-key'}, ${SAVED})`;
      await tx.$executeRaw`INSERT INTO member_program_progress VALUES (${row.id}, ${row.progress}, ${row.count}, 100)`;
      expect(hasValidatedProgramCompletion(row.saved, row.version, [{ programSlug: row.progress, coursesCompleted: row.count }]), row.id).toBe(row.expected);
    }
    const analytics = await getAnalyticsOverview('org-a');
    expect(analytics.placementRate.completedTraining).toBe(3);
    const board = await getBoardOutcomes('all-time', 'org-a');
    expect(board.totals.membersCertified).toBe(3);
    expect(board.programs.find((row) => row.programSlug === PROGRAM)?.certified).toBe(3);
    const snapshot = await getBoardSnapshot('all-time', 'org-a');
    expect(snapshot.cohorts.find((row) => row.month === '2026-10')?.certified).toBe(3);
    const [selected] = await tx.$queryRaw<Array<{ program_slug: string }>>`SELECT * FROM (${confirmedCurrentProgramAssignmentsSql()}) assignments WHERE user_id = 'tabs-newlines'`;
    expect(selected.program_slug).toBe(completed[1].saved);
  }));

  it('attributes a placement to the enrollment at placement time, even after a different program becomes primary', async () => fixture(async (tx) => {
    await tx.$executeRaw`INSERT INTO course_enrollments VALUES ('primary-only', 'earlier-program', 'legacy-v1', false, ${LEGACY})`;
    const placedAt = new Date('2026-06-01T12:00:00Z');
    await tx.$executeRaw`INSERT INTO placement_records (id,user_id,placed_at,program_slug) VALUES ('placement', 'primary-only', ${placedAt}, NULL)`;
    const [row] = await tx.$queryRaw<Array<{ placement_id: string; program_slug: string; enrolled_at: Date }>>`SELECT * FROM (${placementEnrollmentAttributionSql()}) attributed`;
    expect(row).toEqual({ placement_id: 'placement', program_slug: 'earlier-program', enrolled_at: LEGACY });
    expect(resolvePlacementEnrollment([enrollment(), enrollment('earlier-program', false, LEGACY)], placedAt, null, null)).toEqual({ programSlug: 'earlier-program', enrolledAt: LEGACY });
    await tx.$executeRaw`UPDATE placement_records SET program_slug = ${PROGRAM}`;
    const [recorded] = await tx.$queryRaw<Array<{ program_slug: string; enrolled_at: Date }>>`SELECT * FROM (${placementEnrollmentAttributionSql()}) attributed`;
    expect(recorded.program_slug).toBe(PROGRAM);
    expect(recorded.enrolled_at).toEqual(SAVED);
  }));
});
