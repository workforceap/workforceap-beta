// @vitest-environment node
/** Explicit disposable localhost URL only; never reads configured application URLs. */
import migrationSql from '../../prisma/migrations/20261015120000_assessment_two_attempts/migration.sql?raw';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => {
  const url = process.env.ASSESSMENT_FIXTURE_DATABASE_URL;
  if (url && !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Assessment fixture must use localhost');
  return { url, schema: `assessment_fixture_${process.pid}_${Date.now()}` };
});
vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const scoped = new URL(config.url || 'postgresql://unused:unused@127.0.0.1:1/unused'); scoped.searchParams.set('schema', config.schema);
  return { prisma: new PrismaClient({ datasources: { db: { url: scoped.toString() } } }) };
});
vi.mock('@/lib/tenant/organization', () => ({ getSubjectOrganizationId: vi.fn(async () => 'org-1') }));
import { prisma } from '@/lib/db/prisma';
import { allowAssessmentRetake } from '@/lib/assessment/retake';
import { recordAssessmentSubmission } from '@/lib/assessment/recordSubmission';

const schema = config.schema;
const suite = config.url ? describe : describe.skip;
const grant = (memberId: string) => allowAssessmentRetake({ memberId, staffUserId: 'staff-1', staffRole: 'admin' });
const pendingAt = new Date('2026-10-15T10:00:00Z');
const submission = (memberId: string, count: number, pending: Date | null = null) => recordAssessmentSubmission({
  memberId, organizationId: 'org-1', expected: { assessmentAttemptCount: count, assessmentCompleted: count > 0, assessmentRetakeRequestedAt: pending },
  raw: 80, pct: 80, programInterest: 'test', answers: { 1: 'A', 2: 'B' },
});
async function row(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, select: { assessmentAttemptCount: true, assessmentRetakeRequestedAt: true, assessmentCompleted: true, assessmentScorePct: true, assessmentHistory: true } });
}
async function seed(id: string, count = 1, completed = true, pending: Date | null = null, org = 'org-1') {
  await prisma.$executeRaw`INSERT INTO users (id, organization_id, assessment_attempt_count, assessment_completed, assessment_score_pct, assessment_answers, program_interest, assessment_completed_at, assessment_retake_requested_at)
    VALUES (${id}, ${org}, ${count}, ${completed}, 27, '{"1":"A","2":"B"}'::jsonb, 'old program', '2026-10-09T14:30:49Z', ${pending})`;
}

suite('two completed assessment chances — real PostgreSQL', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE users (
      id text PRIMARY KEY, organization_id text NOT NULL DEFAULT 'org-1', deleted_at timestamp,
      assessment_completed boolean NOT NULL DEFAULT false, assessment_completed_at timestamp,
      assessment_score integer, assessment_score_pct integer, assessment_answers jsonb,
      program_interest text, updated_at timestamp NOT NULL DEFAULT now()
    )`);
    await prisma.$executeRawUnsafe('CREATE TABLE workflow_diagnostics (id text PRIMARY KEY, workflow text, entity_id text, metadata jsonb, method text, created_at timestamp DEFAULT now())');
    await prisma.$executeRawUnsafe(`INSERT INTO users(id, assessment_completed, assessment_completed_at) VALUES
      ('legacy-staff',false,NULL), ('legacy-self',false,NULL), ('legacy-two',false,NULL),
      ('duplicate-current',true,'2026-10-09T00:00:00Z'), ('legacy-undated',false,NULL), ('first',false,NULL)`);
    await prisma.$executeRawUnsafe("UPDATE users SET assessment_score_pct = 27 WHERE id = 'duplicate-current'");
    for (const [id, member, method, date] of [
      ['s1','legacy-staff','admin_allowed_retake','2026-10-09T00:00:00.000Z'],
      ['s2','legacy-staff','admin_allowed_retake','2026-10-09T00:00:00.000Z'],
      ['m1','legacy-self','member_reset_request','2026-10-09T00:00:00.000Z'],
      ['t1','legacy-two','member_reset_request','2026-10-09T00:00:00.000Z'],
      ['t2','legacy-two','member_reset_request','2026-10-10T00:00:00.000Z'],
      ['d1','duplicate-current','admin_allowed_retake','2026-10-09T00:00:00.000Z'],
      ['u1','legacy-undated','member_reset_request',null], ['u2','legacy-undated','member_reset_request',null],
    ]) {
      const metadata = JSON.stringify({ ...(method === 'member_reset_request' ? { userId: member } : { memberId: member }), previousScorePct: 27, previousAnswers: null, completedAt: date, reason: 'legacy evidence' });
      await prisma.$executeRaw`INSERT INTO workflow_diagnostics(id, workflow, entity_id, metadata, method) VALUES (${id}, 'member_assessment_history', ${method === 'member_reset_request' ? null : member}, ${metadata}::jsonb, ${method})`;
    }
    const migration = migrationSql.replace(/--[^\n]*/g, '');
    // The migration has one dollar-quoted function; preserve its statement body.
    const start = migration.indexOf('CREATE FUNCTION');
    const end = migration.indexOf('$$;', start) + 3;
    for (const sql of migration.slice(0, start).split(';')) if (sql.trim()) await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(migration.slice(start, end));
    for (const sql of migration.slice(end).split(';')) if (sql.trim()) await prisma.$executeRawUnsafe(sql);
  }, 30000);
  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await prisma.$disconnect();
  });

  it('imports legacy staff authorization but requires staff after a self-reset', async () => {
    expect(await row('legacy-staff')).toMatchObject({ assessmentAttemptCount: 1, assessmentRetakeRequestedAt: expect.any(Date) });
    expect(await row('legacy-self')).toMatchObject({ assessmentAttemptCount: 1, assessmentRetakeRequestedAt: null });
    expect(await submission('legacy-self', 1)).toBe(false);
    expect((await grant('legacy-self')).ok).toBe(true);
    const granted = await row('legacy-self');
    expect(await submission('legacy-self', 1, granted.assessmentRetakeRequestedAt)).toBe(true);
    expect(await row('legacy-self')).toMatchObject({ assessmentAttemptCount: 2, assessmentCompleted: true });
  });
  it('deduplicates dated archives/current completion and preserves undated evidence', async () => {
    expect((await row('duplicate-current')).assessmentAttemptCount).toBe(1);
    expect((await grant('duplicate-current')).ok).toBe(true);
    expect((await row('duplicate-current')).assessmentHistory).toHaveLength(1);
    expect((await row('legacy-undated')).assessmentAttemptCount).toBe(2);
    expect((await row('legacy-two')).assessmentAttemptCount).toBe(2);
    expect((await row('first')).assessmentAttemptCount).toBe(0);
    expect((await row('legacy-staff')).assessmentHistory).toHaveLength(1);
    expect(JSON.stringify((await row('legacy-staff')).assessmentHistory)).toContain('legacy evidence');
  });
  it('keeps authorization timestamps equal across database and JSON precision rounding', async () => {
    await seed('timestamp-precision');
    await prisma.$executeRaw`UPDATE users SET assessment_completed_at = NULL WHERE id = 'timestamp-precision'`;
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transaction = vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (db: typeof prisma) => Promise<unknown>) => originalTransaction(async tx => {
      const pinnedTx = new Proxy(tx, { get(target, key) {
        if (key !== '$queryRaw') return Reflect.get(target, key);
        return (strings: TemplateStringsArray, ...values: unknown[]) => {
          // Preserve the real writer's precision while pinning only its clock.
          // .073969 rounds to .074 in TIMESTAMP(3), whereas JS truncates .073.
          const parts = strings.map(part => part.replace(/\bCURRENT_TIMESTAMP(\(\d+\))?/g,
            (_match, precision: string = '') => `TIMESTAMPTZ${precision} '2026-10-15T10:00:00.073969+00'`));
          const pinnedStrings = Object.assign(parts, { raw: [...parts] }) as unknown as TemplateStringsArray;
          return tx.$queryRaw(pinnedStrings, ...values);
        };
      } });
      return callback(pinnedTx as typeof prisma);
    })) as never);
    try {
      expect((await grant('timestamp-precision')).ok).toBe(true);
    } finally { transaction.mockRestore(); }
    const saved = await row('timestamp-precision');
    expect(saved.assessmentRetakeRequestedAt?.toISOString()).toBe('2026-10-15T10:00:00.074Z');
    const history = saved.assessmentHistory as Array<{ requestedAt: string; completedAt: null }>;
    expect(history[0].completedAt).toBeNull();
    expect(Date.parse(history[0].requestedAt)).toBe(saved.assessmentRetakeRequestedAt!.getTime());
  });
  it('grants once under concurrent clicks, archives once, and retains official results', async () => {
    await seed('concurrent-grant');
    const results = await Promise.all([grant('concurrent-grant'), grant('concurrent-grant')]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(results.filter(result => result.ok && !result.alreadyPending)).toHaveLength(1);
    expect(await row('concurrent-grant')).toMatchObject({ assessmentAttemptCount: 1, assessmentCompleted: true, assessmentScorePct: 27, assessmentHistory: [expect.objectContaining({ scorePct: 27, answers: { 1: 'A', 2: 'B' } })] });
  });
  it('saves exactly one initial submission and rejects stale requests after authorization', async () => {
    await seed('initial-race', 0, false);
    expect((await Promise.all([submission('initial-race', 0), submission('initial-race', 0)])).sort()).toEqual([false, true]);
    expect((await grant('initial-race')).ok).toBe(true);
    expect(await submission('initial-race', 0)).toBe(false);
    expect((await row('initial-race')).assessmentAttemptCount).toBe(1);
  });
  it('saves exactly one final result, then cannot grant a third chance', async () => {
    await seed('final-race', 1, true, pendingAt);
    expect((await Promise.all([submission('final-race', 1, pendingAt), submission('final-race', 1, pendingAt)])).sort()).toEqual([false, true]);
    expect(await grant('final-race')).toEqual({ ok: false, reason: 'limit_reached' });
    expect(await submission('final-race', 1, pendingAt)).toBe(false);
    expect((await row('final-race')).assessmentAttemptCount).toBe(2);
  });
  it('caps legacy cleared assessments and refuses stale pending flags above the cap', async () => {
    expect(await grant('legacy-two')).toEqual({ ok: false, reason: 'limit_reached' });
    await seed('exhausted-pending', 2, false, pendingAt);
    expect(await submission('exhausted-pending', 2, pendingAt)).toBe(false);
    expect(await grant('exhausted-pending')).toEqual({ ok: false, reason: 'limit_reached' });
  });
  it('stays atomic when preview flattens interactive transaction callbacks', async () => {
    await seed('flattened');
    const transaction = vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (db: typeof prisma) => Promise<unknown>) => callback(prisma)) as never);
    try {
      expect((await grant('flattened')).ok).toBe(true);
      const authorized = await row('flattened');
      expect((await Promise.all([submission('flattened', 1, authorized.assessmentRetakeRequestedAt), submission('flattened', 1, authorized.assessmentRetakeRequestedAt)])).sort()).toEqual([false, true]);
      expect(await grant('flattened')).toEqual({ ok: false, reason: 'limit_reached' });
    } finally { transaction.mockRestore(); }
  });
  it('denies browser-owned attempt state even with broad table grants and permissive RLS', async () => {
    await seed('browser-guard');
    await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA ${schema} TO authenticated`);
    await prisma.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE ON users TO authenticated');
    await prisma.$executeRawUnsafe('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
    await prisma.$executeRawUnsafe('CREATE POLICY fixture_browser_policy ON users TO authenticated USING (true) WITH CHECK (true)');
    for (const mutation of [
      "UPDATE users SET assessment_attempt_count = 0 WHERE id = 'browser-guard'",
      "UPDATE users SET assessment_retake_requested_at = now() WHERE id = 'browser-guard'",
      "UPDATE users SET assessment_history = '[{}]'::jsonb WHERE id = 'browser-guard'",
      "INSERT INTO users (id, assessment_attempt_count) VALUES ('forged', 1)",
    ]) {
      await expect(prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
        return tx.$executeRawUnsafe(mutation);
      })).rejects.toMatchObject({ meta: expect.objectContaining({ code: '42501' }) });
    }
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
      await tx.$executeRawUnsafe("UPDATE users SET program_interest = 'allowed profile edit' WHERE id = 'browser-guard'");
      await tx.$executeRawUnsafe("INSERT INTO users (id) VALUES ('default-browser-insert')");
    });
    expect((await row('browser-guard')).assessmentAttemptCount).toBe(1);
    expect((await grant('browser-guard')).ok).toBe(true);
  });
  it('keeps tenant and deletion predicates on both writes', async () => {
    await seed('foreign', 1, true, pendingAt, 'org-2');
    expect(await grant('foreign')).toEqual({ ok: false, reason: 'not_found' });
    expect(await submission('foreign', 1, pendingAt)).toBe(false);
    await seed('deleted', 1, true, pendingAt);
    await prisma.$executeRaw`UPDATE users SET deleted_at = now() WHERE id = 'deleted'`;
    expect(await grant('deleted')).toEqual({ ok: false, reason: 'not_found' });
    expect(await submission('deleted', 1, pendingAt)).toBe(false);
  });
});
