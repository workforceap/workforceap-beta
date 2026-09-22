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
  resolveCertificationNameForCourse,
} from './pendingFromCompletion';
import { prisma } from '../db/prisma';
import { PROGRAMS, getProgramDisplayTitle } from '../content/programs';
import { backfillPendingCertificationsFromCompletions } from '../../scripts/backfill-pending-certifications-from-completions';

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

/** A catalog course whose name repeats across programs, so the backfill case also proves qualification end to end. */
const SHARED_COURSE = 'introduction-to-networking-and-storage';
const SHARED_NAME = 'Introduction to Networking and Storage';

const seeded = { orgId: '', userId: '', staffUserId: '' };

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
  // A member by the one definition (lib/admin/memberOnlyWhere.ts): a bare
  // account with no profile row is not one, and the backfill must skip it.
  await prisma.profile.create({ data: { userId: user.id, role: 'member' } });
  // A staff account (admin profile) with the same completion: the backfill's
  // member predicate must leave it out of the review queue.
  const staff = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `pending-cert-staff-${runId}@example.test`,
      fullName: `Pending cert contract staff ${runId}`,
    },
    select: { id: true },
  });
  seeded.staffUserId = staff.id;
  await prisma.profile.create({ data: { userId: staff.id, role: 'admin' } });
});

after(async () => {
  for (const userId of [seeded.userId, seeded.staffUserId].filter(Boolean)) {
    await prisma.auditLog.deleteMany({ where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, metadata: { path: ['userId'], equals: userId } } });
    await prisma.courseraCourseProgress.deleteMany({ where: { userId } });
    await prisma.profile.deleteMany({ where: { userId } });
    await prisma.userCertification.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
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
  const memberCertName = resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: 'introduction-to-hardware-and-operating-systems' });
  const memberRow = await prisma.userCertification.create({
    data: {
      userId: seeded.userId,
      certName: memberCertName,
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

test('inside a writer transaction, a pre-existing certificate does not abort the completion write', async () => {
  // b4bSync hands its per-row `tx` to upsertMergedCourseProgress, which hands
  // it to the certificate helper. The certificate for COURSE already exists
  // (approved, from the case above). With a plain INSERT the unique violation
  // would poison the transaction (25P02) and roll back the COMPLETED row the
  // sync was writing; ON CONFLICT DO NOTHING must leave it committable.
  const courseId = `in-tx-${runId}`;
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.courseProgress.create({
      data: {
        userId: seeded.userId, programSlug: PROGRAM, courseSlug: COURSE, courseId,
        status: 'COMPLETED', percentComplete: 100, progressPct: 100, completedAt: new Date('2026-09-12T00:00:00.000Z'),
      },
    });
    const certificate = await ensurePendingCertificationForCompletion(
      { userId: seeded.userId, programSlug: PROGRAM, courseSlug: COURSE, courseraCourseId: courseId, source: 'coursera-progress-merge' },
      { db: tx },
    );
    // The transaction is still live after the duplicate: another statement runs.
    const stillLive = await tx.courseProgress.count({ where: { userId: seeded.userId, courseSlug: COURSE } });
    return { certificate, stillLive };
  });

  assert.equal(outcome.certificate.created, false);
  assert.equal(outcome.certificate.status, 'approved');
  assert.equal(outcome.stillLive, 1);
  const committed = await prisma.courseProgress.findMany({ where: { userId: seeded.userId, courseSlug: COURSE } });
  assert.equal(committed.length, 1, "the caller's COMPLETED write committed");
  assert.equal(committed[0].status, 'COMPLETED');
  assert.equal(await prisma.userCertification.count({ where: { userId: seeded.userId, certName: CATALOG_NAME } }), 1, 'still one certificate, still approved');
  assert.equal((await prisma.userCertification.findUniqueOrThrow({ where: { userId_certName: { userId: seeded.userId, certName: CATALOG_NAME } } })).status, 'approved');
});

test('backfill: only members get a certificate, and a shared catalog name comes out qualified', async () => {
  const program = PROGRAMS.find((p) => p.slug === PROGRAM)!;
  const course = program.courses.find((c) => c.slug === SHARED_COURSE)!;
  assert.equal(course.name, SHARED_NAME);
  assert.ok(PROGRAMS.filter((p) => p.courses.some((c) => c.name === SHARED_NAME)).length > 1, 'fixture name is shared across programs');
  const courseraCourseId = course.courseraCourseId ?? `fixture-${runId}`;

  // Identical completion evidence for the member and the staff account.
  for (const [userId, email] of [[seeded.userId, `pending-cert-${runId}@example.test`], [seeded.staffUserId, `pending-cert-staff-${runId}@example.test`]] as const) {
    await prisma.courseProgress.create({
      data: {
        userId, programSlug: PROGRAM, courseSlug: SHARED_COURSE, courseId: courseraCourseId,
        status: 'COMPLETED', percentComplete: 100, progressPct: 100, completedAt: new Date('2026-09-10T00:00:00.000Z'),
      },
    });
    await prisma.courseraCourseProgress.create({
      data: {
        userId, organizationId: seeded.orgId, externalEmail: email, courseraCourseId, courseName: SHARED_NAME,
        programSlug: PROGRAM, overallProgress: 100, learningHours: 10, isCompleted: true,
      },
    });
  }

  const dry = await backfillPendingCertificationsFromCompletions(prisma, { apply: false, organizationId: seeded.orgId, userId: null, allCompleted: false });
  assert.equal(dry.scanned, 2, 'member rows only (this one and the in-transaction case above): the staff row is not even read');
  assert.equal(dry.missing, 1);
  assert.equal(dry.created, 0);
  assert.equal(await prisma.userCertification.count({ where: { userId: { in: [seeded.userId, seeded.staffUserId] }, certName: { startsWith: SHARED_NAME } } }), 0, 'dry run writes nothing');

  const applied = await backfillPendingCertificationsFromCompletions(prisma, { apply: true, organizationId: seeded.orgId, userId: null, allCompleted: false });
  assert.equal(applied.created, 1);
  assert.equal(applied.failed, 0);

  const expectedName = `${SHARED_NAME} — ${getProgramDisplayTitle(program)}`;
  assert.equal(resolveCertificationNameForCourse({ programSlug: PROGRAM, courseSlug: SHARED_COURSE }), expectedName);
  const memberRows = await prisma.userCertification.findMany({ where: { userId: seeded.userId, certName: { startsWith: SHARED_NAME } } });
  assert.equal(memberRows.length, 1);
  assert.equal(memberRows[0].certName, expectedName);
  assert.equal(memberRows[0].status, 'pending');
  assert.equal(memberRows[0].earnedAt.toISOString(), '2026-09-10T00:00:00.000Z');
  assert.equal(await prisma.userCertification.count({ where: { userId: seeded.staffUserId } }), 0, 'staff account gets no certificate');
  assert.equal(await prisma.auditLog.count({ where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, metadata: { path: ['userId'], equals: seeded.staffUserId } } }), 0);

  const again = await backfillPendingCertificationsFromCompletions(prisma, { apply: true, organizationId: seeded.orgId, userId: null, allCompleted: false });
  assert.equal(again.created, 0);
  assert.equal(again.missing, 0, 're-run is a no-op');
});
