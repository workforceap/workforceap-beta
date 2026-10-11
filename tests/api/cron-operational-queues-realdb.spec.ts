// @vitest-environment node
/** Exact production Prisma predicates against transaction-local temporary tables. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient, type Prisma } from '@prisma/client';

vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: vi.fn() }, jobPostingApplication: { findMany: vi.fn() },
  notification: { findMany: vi.fn() }, emailSendLog: { findMany: vi.fn() },
} }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({
  sendOnboardingStallsDigestEmail: vi.fn(async () => ({ ok: true })),
  sendEmployerPendingApplicantsEmail: vi.fn(async () => ({ ok: true })),
  sendAdminStaleApplicantsDigestEmail: vi.fn(async () => ({ ok: true })),
  getAdminAlertRecipients: () => ['ops@example.org'],
}));
vi.mock('@/lib/email/send', () => ({ isFixtureEmailRecipient: (email: string) => email.endsWith('@example.com') }));
vi.mock('@/lib/cron/onboardingStallNudges', () => ({ sendMemberStallNudges: vi.fn(async () => ({ enabled: false })) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handler: unknown) => handler }));
vi.mock('@/lib/email/pacing', () => ({ createBulkEmailCronPacer: () => ({ run: <T>(operation: () => Promise<T>) => operation(), summary: () => ({}) }) }));

import { prisma } from '@/lib/db/prisma';
import { GET as onboarding } from '@/app/api/cron/onboarding-stalls/route';
import { GET as employerDigest } from '@/app/api/cron/employer-pending-applicants/route';
import { sendOnboardingStallsDigestEmail, sendEmployerPendingApplicantsEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications/create';
import { loadQueueDigestHistory, queueDigest } from '@/lib/cron/queueDigest';

let client: PrismaClient<Prisma.PrismaClientOptions, 'query'> | undefined;
const queries: string[] = [];
const NOW = new Date('2026-10-11T12:00:00Z');
const OLD = new Date('2026-03-01T12:00:00Z');
const request = () => new Request('http://localhost/api/cron/fixture');

async function fixture(operation: (tx: Prisma.TransactionClient) => Promise<void>) {
  await client!.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    await tx.$executeRaw`CREATE TEMP TABLE fixture_marker (id integer) ON COMMIT DROP`;
    const enumNames = ['member_status', 'job_status_enum', 'job_posting_application_status'] as const;
    for (const name of enumNames) {
      const labels = await tx.$queryRaw<Array<{ enumlabel: string }>>`SELECT e.enumlabel
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' AND t.typname=${name} ORDER BY e.enumsortorder`;
      expect(labels.length).toBeGreaterThan(0);
      await tx.$executeRawUnsafe(`CREATE TYPE pg_temp.${name} AS ENUM (${labels.map(({ enumlabel }) => `'${enumlabel.replaceAll("'", "''")}'`).join(',')})`);
    }
    // Only connection-local temporary types/tables; no app schema/role changes.
    for (const ddl of [
      `CREATE TEMP TABLE users (id text PRIMARY KEY, organization_id text, email text, full_name text,
        deleted_at timestamp, member_status pg_temp.member_status, created_at timestamp, updated_at timestamp,
        enrolled_program text, interview_eligible boolean DEFAULT false, interview_requested_at timestamp,
        interview_completed_at timestamp, wioa_review_status text, wioa_qualification_json jsonb) ON COMMIT DROP`,
      `CREATE TEMP TABLE profiles (id text PRIMARY KEY, user_id text, role text) ON COMMIT DROP`,
      `CREATE TEMP TABLE roles (id text PRIMARY KEY, name text) ON COMMIT DROP`,
      `CREATE TEMP TABLE user_roles (id text PRIMARY KEY, user_id text, role_id text) ON COMMIT DROP`,
      `CREATE TEMP TABLE course_enrollments (id text PRIMARY KEY, user_id text, organization_id text,
        is_primary boolean NOT NULL DEFAULT false) ON COMMIT DROP`,
      `CREATE TEMP TABLE counselor_assignments (id text PRIMARY KEY, member_id text, active boolean) ON COMMIT DROP`,
      `CREATE TEMP TABLE employers (id text PRIMARY KEY, organization_id text, user_id text, company_name text,
        contact_email text, status text) ON COMMIT DROP`,
      `CREATE TEMP TABLE jobs (id text PRIMARY KEY, organization_id text, employer_id text, status pg_temp.job_status_enum) ON COMMIT DROP`,
      `CREATE TEMP TABLE job_posting_applications (id text PRIMARY KEY, job_id text, student_id text,
        status pg_temp.job_posting_application_status, applied_at timestamptz, status_updated_at timestamptz,
        last_employer_message_at timestamptz) ON COMMIT DROP`,
      `CREATE TEMP TABLE notifications (id text PRIMARY KEY, user_id text, type text, data jsonb) ON COMMIT DROP`,
      `CREATE TEMP TABLE email_send_logs (id text PRIMARY KEY, dedupe_key text, entity_type text, entity_id text, status text, provider_message_id text) ON COMMIT DROP`,
    ]) await tx.$executeRawUnsafe(ddl);
    // Prisma qualifies model queries with the URL schema, so route its real
    // generated SQL to pg_temp explicitly rather than relying on search_path.
    // Enum labels come from the current disposable application baseline; all
    // model tables/types still belong to this connection's temporary schema.
    await tx.$executeRaw`INSERT INTO users (id) VALUES ('temp_schema_probe')`;
    expect(await tx.user.findMany({ where: { id: 'temp_schema_probe' }, select: { id: true } })).toEqual([{ id: 'temp_schema_probe' }]);
    await tx.$executeRaw`DELETE FROM users WHERE id='temp_schema_probe'`;
    await tx.$executeRaw`INSERT INTO roles VALUES ('role_member', 'member'), ('role_admin', 'admin')`;
    vi.mocked(prisma.user.findMany).mockImplementation(((args: Prisma.UserFindManyArgs) => tx.user.findMany(args)) as never);
    vi.mocked(prisma.jobPostingApplication.findMany).mockImplementation(((args: Prisma.JobPostingApplicationFindManyArgs) => tx.jobPostingApplication.findMany(args)) as never);
    vi.mocked(prisma.notification.findMany).mockImplementation(((args: Prisma.NotificationFindManyArgs) => tx.notification.findMany(args)) as never);
    vi.mocked(prisma.emailSendLog.findMany).mockImplementation(((args: Prisma.EmailSendLogFindManyArgs) => tx.emailSendLog.findMany(args)) as never);
    await operation(tx);
    const modelQueries = queries.filter((query) => query.startsWith('SELECT ') && query.includes('"pg_temp".'));
    expect(modelQueries.length).toBeGreaterThan(0);
    expect(modelQueries.some((query) => query.includes('"pg_temp"."users"'))).toBe(true);
    expect(modelQueries.join('\n')).not.toMatch(/"public"\."(?:users|profiles|roles|user_roles|course_enrollments|counselor_assignments|employers|jobs|job_posting_applications|notifications|email_send_logs)"/);
    for (const name of enumNames) {
      await tx.$executeRawUnsafe(`DROP TYPE pg_temp.${name} CASCADE`);
    }
  }, { timeout: 30_000 });
}

async function account(tx: Prisma.TransactionClient, id: string, options: {
  email?: string; profileRole?: string | null; memberRole?: boolean; memberStatus?: 'active' | 'inactive' | 'placed'; deleted?: boolean;
} = {}) {
  await tx.$executeRaw`INSERT INTO users (id,organization_id,email,full_name,member_status,created_at,updated_at,deleted_at)
    VALUES (${id}, 'org_a', ${options.email ?? `${id}@example.org`}, 'Test Person with a real-account address',
      ${options.memberStatus ?? 'active'}::pg_temp.member_status, ${OLD}, ${NOW}, ${options.deleted ? NOW : null})`;
  if (options.profileRole !== null) await tx.$executeRaw`INSERT INTO profiles VALUES (${id}, ${id}, ${options.profileRole ?? 'member'})`;
  if (options.memberRole !== false) await tx.$executeRaw`INSERT INTO user_roles VALUES (${id}, ${id}, 'role_member')`;
}

async function staff(tx: Prisma.TransactionClient) {
  await account(tx, 'ops', { profileRole: 'admin', memberRole: false });
  await tx.$executeRaw`INSERT INTO user_roles VALUES ('ops', 'ops', 'role_admin')`;
}

describe.skipIf(process.env.TEST_REAL_DB?.trim() !== '1')('operational queues actual PostgreSQL predicates', () => {
  beforeAll(() => {
    const url = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? '';
    if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Operational queue fixtures require local disposable PostgreSQL.');
    const fixtureUrl = new URL(url);
    fixtureUrl.searchParams.set('schema', 'pg_temp');
    client = new PrismaClient({ datasources: { db: { url: fixtureUrl.toString() } }, log: [{ emit: 'event', level: 'query' }] });
    // Query text is retained for assertions; never log provider credentials,
    // connection URLs or bind values from the disposable fixture.
    client.$on('query', (event) => { queries.push(event.query); });
    vi.stubEnv('EMAIL_FIXTURE_DOMAINS', 'fixtures.example.org');
    vi.stubEnv('EMAIL_FIXTURE_ADDRESSES', 'configured-qa@example.org');
    vi.stubEnv('EMAIL_FROM', 'hello@workforceap.org');
  });
  beforeEach(() => { vi.clearAllMocks(); queries.length = 0; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterAll(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await client?.$disconnect(); });

  it('excludes canonical enrollment, active counselors, staff, deleted/inactive/placed and explicit fixtures before counting', async () => {
    await fixture(async (tx) => {
      await staff(tx); await account(tx, 'real'); await account(tx, 'enrolled'); await account(tx, 'assigned');
      await account(tx, 'inactive', { memberStatus: 'inactive' }); await account(tx, 'placed', { memberStatus: 'placed' });
      await account(tx, 'deleted', { deleted: true }); await account(tx, 'role_unknown', { memberRole: false, profileRole: null });
      await account(tx, 'qa_reserved', { email: 'member@sub.example.com' });
      await account(tx, 'qa_upper', { email: 'Test-Smoke-Fixture@workforceap.org' });
      await account(tx, 'qa_domain', { email: 'member@fixtures.example.org' });
      await account(tx, 'qa_explicit', { email: 'CONFIGURED-QA@example.org' });
      await tx.$executeRaw`INSERT INTO course_enrollments VALUES ('non_primary_enrollment', 'enrolled', 'org_a', false)`;
      await tx.$executeRaw`INSERT INTO counselor_assignments VALUES ('assignment', 'assigned', true), ('inactive_assignment', 'real', false)`;
      const result = await (await onboarding(request())).json();
      expect(result.noProgramStalled).toBe(1);
      expect(vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[0][0].noProgramMembers.map((member) => member.id)).toEqual(['real']);
    });
  });

  it('does not let more than the scan cap of old QA rows starve a real member', async () => {
    await fixture(async (tx) => {
      await staff(tx); await account(tx, 'real');
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,full_name,member_status,created_at,updated_at)
        SELECT 'qa_'||n, 'org_a', 'test-smoke-'||n||'@workforceap.org', 'Fixture', 'active', ${OLD} - interval '1 day', ${NOW}
        FROM generate_series(1,501) n`;
      await tx.$executeRaw`INSERT INTO profiles SELECT id,id,'member' FROM users WHERE id LIKE 'qa_%'`;
      const result = await (await onboarding(request())).json();
      expect(result).toMatchObject({ noProgramStalled: 1, queueTruncated: { noProgram: false } });
    });
  });

  it('retains a screening waiting on staff after a recent profile edit and removes completed interviews/resolved screenings', async () => {
    await fixture(async (tx) => {
      await staff(tx); await account(tx, 'waiting'); await account(tx, 'resolved');
      const snapshot = JSON.stringify({ version: 2, submittedAt: '2026-09-01T12:00:00Z', signal: 'review', reasons: [], answers: {
        ageBracket: '25_54', countyOrZip: '78701', primaryBarrier: 'none', dislocatedWorker: false, lowIncomeSelfReport: true,
        trainingInterest: true, completedIntakeSelfReport: false,
      } });
      await tx.$executeRaw`UPDATE users SET wioa_review_status='pending', wioa_qualification_json=${snapshot}::jsonb WHERE id='waiting'`;
      await tx.$executeRaw`UPDATE users SET wioa_review_status='eligible', interview_eligible=true,
        interview_requested_at=${OLD}, interview_completed_at=${NOW} WHERE id='resolved'`;
      const result = await (await onboarding(request())).json();
      expect(result).toMatchObject({ wioaStalled: 1, wioaOldestPendingDays: 40, interviewStalled: 0 });
    });
  });

  it('marks WIOA age/count completeness unknown when fresh rows hide an older submission beyond the sample', async () => {
    await fixture(async (tx) => {
      await staff(tx);
      const fresh = JSON.stringify({ version: 2, submittedAt: NOW.toISOString(), signal: 'review', reasons: [], answers: {
        ageBracket: '25_54', countyOrZip: '78701', primaryBarrier: 'none', dislocatedWorker: false, lowIncomeSelfReport: true,
        trainingInterest: true, completedIntakeSelfReport: false,
      } });
      const stale = JSON.stringify({ ...JSON.parse(fresh), submittedAt: '2026-01-01T12:00:00Z' });
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,full_name,member_status,created_at,updated_at,wioa_review_status,wioa_qualification_json)
        SELECT 'fresh_'||n, 'org_a', 'member-'||n||'@example.org', 'Synthetic Member', 'active', ${OLD}, ${NOW}, 'pending', ${fresh}::jsonb
        FROM generate_series(1,501) n`;
      await account(tx, 'z_hidden_old');
      await tx.$executeRaw`UPDATE users SET wioa_review_status='pending',wioa_qualification_json=${stale}::jsonb WHERE id='z_hidden_old'`;
      await tx.$executeRaw`INSERT INTO profiles SELECT id,id,'member' FROM users WHERE id LIKE 'fresh_%'`;
      const result = await (await onboarding(request())).json();
      expect(result).toMatchObject({ queueTruncated: { wioa: true }, wioaStalled: 0,
        wioaOldestPendingDays: null, wioaOldestScannedPendingDays: 0, wioaQueueOverdue: null });
      const params = vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[0][0];
      expect(params).toMatchObject({ truncated: true, wioaOldestPendingDays: null });
      expect(vi.mocked(createNotification).mock.calls[0][0].body).not.toContain('Oldest pending WIOA');
    });
  });

  it('filters unpublished jobs, resolved statuses, recent employer actions, nonmembers and inactive employers before aggregation', async () => {
    await fixture(async (tx) => {
      await account(tx, 'owner', { profileRole: 'employer' }); await account(tx, 'real'); await account(tx, 'staff_applicant', { profileRole: 'admin' });
      await tx.$executeRaw`INSERT INTO employers VALUES ('active', 'org_a', 'owner', 'Real Employer', 'owner@example.org', 'active'),
        ('inactive', 'org_a', 'owner', 'Inactive Employer', 'owner@example.org', 'inactive')`;
      await tx.$executeRaw`INSERT INTO jobs VALUES ('live', 'org_a', 'active', 'live'), ('draft', 'org_a', 'active', 'draft'),
        ('closed', 'org_a', 'active', 'closed'), ('inactive', 'org_a', 'inactive', 'live')`;
      await tx.$executeRaw`INSERT INTO job_posting_applications VALUES
        ('real_waiting', 'live', 'real', 'pending', ${OLD}, null, null),
        ('closed_waiting', 'closed', 'real', 'reviewing', ${OLD}, null, null),
        ('unpublished', 'draft', 'real', 'pending', ${OLD}, null, null),
        ('staff', 'live', 'staff_applicant', 'pending', ${OLD}, null, null),
        ('inactive', 'inactive', 'real', 'pending', ${OLD}, null, null),
        ('resolved', 'live', 'real', 'hired', ${OLD}, null, null),
        ('recent_status', 'live', 'real', 'reviewing', ${OLD}, ${NOW}, null),
        ('recent_message', 'live', 'real', 'pending', ${OLD}, null, ${NOW})`;
      const result = await (await employerDigest(request())).json();
      expect(result).toMatchObject({ staleApplications: 2, employersNotified: 1 });
      expect(vi.mocked(sendEmployerPendingApplicantsEmail).mock.calls[0][0]).toMatchObject({ candidateCount: 1, jobsAffected: 2 });
    });
  });

  it('does not claim full-queue oldest response age from a capped application-date scan', async () => {
    await fixture(async (tx) => {
      await account(tx, 'owner', { profileRole: 'employer' });
      await tx.$executeRaw`INSERT INTO users (id,organization_id,email,full_name,member_status,created_at,updated_at)
        SELECT 'member_'||n, 'org_a', 'member-'||n||'@example.org', 'Synthetic Member', 'active', ${OLD}, ${NOW}
        FROM generate_series(1,501) n`;
      await tx.$executeRaw`INSERT INTO profiles SELECT id,id,'member' FROM users WHERE id LIKE 'member_%'`;
      await tx.$executeRaw`INSERT INTO employers VALUES ('active', 'org_a', 'owner', 'Real Employer', 'owner@example.org', 'active')`;
      await tx.$executeRaw`INSERT INTO jobs VALUES ('live', 'org_a', 'active', 'live')`;
      await tx.$executeRaw`INSERT INTO job_posting_applications
        SELECT 'a_'||n, 'live', 'member_'||n, 'pending', ${OLD}, ${new Date('2026-10-05T12:00:00Z')}, null
        FROM generate_series(1,500) n`;
      await tx.$executeRaw`INSERT INTO job_posting_applications VALUES
        ('hidden_oldest', 'live', 'member_501', 'pending', ${new Date('2026-09-01T12:00:00Z')}, null, null)`;
      const result = await (await employerDigest(request())).json();
      expect(result).toMatchObject({ queueTruncated: true, staleApplications: 500,
        oldestEmployerResponseDays: null, oldestScannedEmployerResponseDays: 6 });
      expect(vi.mocked(createNotification).mock.calls[0][0].body).toContain('The longest observed wait in this scan is 6 days');
      expect(vi.mocked(sendEmployerPendingApplicantsEmail).mock.calls[0][0]).toMatchObject({ truncated: true, oldestWaitingDays: 6 });
    });
  });

  it('proves JSON notification keys and accepted-only email suppression, without treating failed/skipped/queued as accepted', async () => {
    await fixture(async (tx) => {
      const digest = queueDigest({ workflow: 'fixture_queue', scope: 'org_a', recipients: ['member@example.org'], state: ['member'], payload: {}, userId: 'member' }, NOW);
      await tx.$executeRaw`INSERT INTO notifications VALUES ('notification', 'member', 'task_assigned', ${JSON.stringify({ queueDigestKey: digest.key })}::jsonb)`;
      for (const status of ['failed', 'skipped', 'queued']) {
        await tx.$executeRaw`INSERT INTO email_send_logs VALUES (${status}, ${status}, ${digest.entityType}, ${digest.entityId}, ${status}, null)`;
      }
      for (const receipt of [null, '', ' ']) await tx.$executeRaw`INSERT INTO email_send_logs VALUES
        (${`ambiguous_${receipt}`}, ${`ambiguous_${receipt}`}, ${digest.entityType}, ${digest.entityId}, 'sent', ${receipt})`;
      expect(await loadQueueDigestHistory([digest])).toEqual({ notified: new Set(['member']), emailed: new Set() });
      await tx.$executeRaw`INSERT INTO email_send_logs VALUES ('accepted', 'accepted', ${digest.entityType}, ${digest.entityId}, 'sent', 'synthetic-acceptance')`;
      expect(await loadQueueDigestHistory([digest])).toEqual({ notified: new Set(['member']), emailed: new Set([digest.key]) });
      expect(createNotification).not.toHaveBeenCalled();
    });
  });
});
