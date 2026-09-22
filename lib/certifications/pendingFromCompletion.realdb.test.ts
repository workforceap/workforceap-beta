/**
 * Real-database proof for the completion -> pending certificate helper
 * (lib/certifications/pendingFromCompletion.ts; product review 2026-09-22
 * item 4). The mocked suite (tests/lib/pending-certification-from-completion.spec.ts)
 * proves the helper's decisions; this one proves PostgreSQL agrees: the
 * `user_certifications (user_id, cert_name)` unique key holds under
 * concurrent reports, a repeat is a true no-op on the stored row, and a row
 * staff approved or a member typed in keeps every column.
 *
 * Runs only in the database-contract lane (`TEST_REAL_DB=1`, see
 * scripts/run-db-contract-tests.mjs); the default node:test lane skips it
 * because it has no PostgreSQL.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
  ensurePendingCertificationForCompletion,
} from './pendingFromCompletion';
import { prisma } from '../db/prisma';

const LOCAL_DB_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function assertDisposableDatabase(): void {
  const raw = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? '';
  if (!raw.trim()) {
    throw new Error('pendingFromCompletion.realdb: no database URL; this suite runs only in the database-contract lane.');
  }
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error('pendingFromCompletion.realdb: could not parse the database URL; refusing to run.');
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(
      `pendingFromCompletion.realdb: refusing to seed and delete rows on ${host}. `
        + 'This suite is for a disposable local PostgreSQL only.',
    );
  }
}

const runId = randomUUID().slice(0, 8);
const PROGRAM = 'it-support-professional-certificate-ibm';
const COURSE = 'introduction-to-technical-support';
const CATALOG_NAME = 'Introduction to Technical Support';

const seeded = { orgId: '', userId: '' };

before(async () => {
  assertDisposableDatabase();
  const org = await prisma.organization.create({
    data: { slug: `pending-cert-contract-${runId}`, name: `Pending cert contract ${runId}` },
    select: { id: true },
  });
  seeded.orgId = org.id;
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `pending-cert-${runId}@example.test`,
      fullName: `Pending cert contract ${runId}`,
    },
    select: { id: true },
  });
  seeded.userId = user.id;
});

after(async () => {
  if (seeded.userId) {
    await prisma.auditLog.deleteMany({ where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, metadata: { path: ['userId'], equals: seeded.userId } } });
    await prisma.userCertification.deleteMany({ where: { userId: seeded.userId } });
    await prisma.user.delete({ where: { id: seeded.userId } });
  }
  if (seeded.orgId) await prisma.organization.delete({ where: { id: seeded.orgId } });
  await prisma.$disconnect();
});

test('one pending row per (member, course) even when five reports race on the unique key', async () => {
  const completedAt = new Date('2026-09-20T15:00:00.000Z');
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      ensurePendingCertificationForCompletion({
        userId: seeded.userId,
        programSlug: PROGRAM,
        courseSlug: COURSE,
        courseraCourseId: 'rNyuLa-pEeytqw64hz8ZCw',
        completedAt,
        source: i % 2 === 0 ? 'coursera-progress-merge' : 'coursera-webhook',
      })),
  );

  assert.equal(results.filter((r) => r.created).length, 1, 'exactly one writer creates the row');
  assert.ok(results.every((r) => r.certName === CATALOG_NAME));
  const ids = new Set(results.map((r) => r.id));
  assert.equal(ids.size, 1, 'every caller sees the same row');

  const rows = await prisma.userCertification.findMany({ where: { userId: seeded.userId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].certName, CATALOG_NAME);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].earnedAt.toISOString(), completedAt.toISOString());
  assert.ok(rows[0].submittedAt, 'enters the admin review queue like a self-report');
  assert.equal(rows[0].reviewedAt, null);

  const audits = await prisma.auditLog.findMany({
    where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, targetId: rows[0].id },
  });
  assert.equal(audits.length, 1, 'one provenance row for the one insert');
  assert.equal(audits[0].actorUserId, null);
  assert.match(String((audits[0].metadata as { source?: string }).source), /^coursera-/);
});

test('a repeat report changes nothing on the stored row', async () => {
  const before = await prisma.userCertification.findUniqueOrThrow({
    where: { userId_certName: { userId: seeded.userId, certName: CATALOG_NAME } },
  });

  const result = await ensurePendingCertificationForCompletion({
    userId: seeded.userId,
    programSlug: PROGRAM,
    courseSlug: COURSE,
    completedAt: new Date('2026-09-21T09:00:00.000Z'),
    source: 'backfill-script',
  });

  assert.equal(result.created, false);
  const after_ = await prisma.userCertification.findUniqueOrThrow({ where: { id: before.id } });
  assert.deepEqual(after_, before);
});

test('never downgrades a certificate staff approved', async () => {
  const reviewedAt = new Date('2026-09-21T10:00:00.000Z');
  const approved = await prisma.userCertification.update({
    where: { userId_certName: { userId: seeded.userId, certName: CATALOG_NAME } },
    data: { status: 'approved', reviewedAt },
  });

  const result = await ensurePendingCertificationForCompletion({
    userId: seeded.userId,
    programSlug: PROGRAM,
    courseSlug: COURSE,
    source: 'coursera-enterprise-sync',
  });

  assert.equal(result.created, false);
  assert.equal(result.status, 'approved');
  const row = await prisma.userCertification.findUniqueOrThrow({ where: { id: approved.id } });
  assert.equal(row.status, 'approved');
  assert.equal(row.reviewedAt?.toISOString(), reviewedAt.toISOString());
  assert.deepEqual(row, approved);
});

test('respects a certificate the member added under the same name for another course', async () => {
  // Second catalog course of the same program; the member typed it in first.
  const memberRow = await prisma.userCertification.create({
    data: {
      userId: seeded.userId,
      certName: 'Introduction to Hardware and Operating Systems',
      earnedAt: new Date('2026-07-04T00:00:00.000Z'),
      status: 'pending',
      submittedAt: new Date('2026-07-05T00:00:00.000Z'),
      proofUrl: `members/${seeded.userId}/proof-${runId}.pdf`,
    },
  });

  const result = await ensurePendingCertificationForCompletion({
    userId: seeded.userId,
    programSlug: PROGRAM,
    courseSlug: 'introduction-to-hardware-and-operating-systems',
    completedAt: new Date('2026-09-22T00:00:00.000Z'),
    source: 'coursera-progress-merge',
  });

  assert.equal(result.created, false);
  assert.equal(result.id, memberRow.id);
  const row = await prisma.userCertification.findUniqueOrThrow({ where: { id: memberRow.id } });
  assert.deepEqual(row, memberRow, 'earnedAt, submittedAt and proofUrl all kept');
  const audits = await prisma.auditLog.count({
    where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, targetId: memberRow.id },
  });
  assert.equal(audits, 0);
});
