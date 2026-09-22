/**
 * Member merge, against a real PostgreSQL.
 *
 * Every case here failed on `origin/master` before the fix, and three of them
 * failed in a way no mock could show, because the fault was PostgreSQL's
 * transaction semantics rather than the code's control flow: a duplicate key
 * aborts the whole transaction, so swallowing the error in JS and carrying on
 * produced a `25P02` on an unrelated statement several tables later.
 *
 * Runs only in the database-contract lane (`npm run test:db-contract`, or
 * `TEST_REAL_DB=1`); `scripts/test-unit.mjs` skips it otherwise.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { buildMergePreview, executeMemberMerge } from './memberMerge';

const prisma = new PrismaClient();

type Fixture = {
  organizationId: string;
  primaryId: string;
  secondaryId: string;
};

async function organizationId(): Promise<string> {
  const existing = await prisma.organization.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.organization.create({
    data: { name: `merge-proof-${randomUUID()}`, slug: `merge-proof-${randomUUID()}` },
    select: { id: true },
  });
  return created.id;
}

async function makeFixture(): Promise<Fixture> {
  const orgId = await organizationId();
  const primaryId = randomUUID();
  const secondaryId = randomUUID();
  await prisma.user.createMany({
    data: [
      { id: primaryId, email: `merge-primary-${primaryId}@example.invalid`, fullName: 'Merge Primary', organizationId: orgId },
      { id: secondaryId, email: `merge-secondary-${secondaryId}@example.invalid`, fullName: 'Merge Secondary', organizationId: orgId },
    ],
  });
  return { organizationId: orgId, primaryId, secondaryId };
}

async function cleanup(fixture: Fixture) {
  const ids = [fixture.primaryId, fixture.secondaryId];
  await prisma.memberSubgroup.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.invitation.deleteMany({ where: { invitedById: { in: ids } } });
  await prisma.subgroup.deleteMany({ where: { createdBy: { in: ids } } });
  await prisma.pointsTransaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.memberPoints.deleteMany({ where: { userId: { in: ids } } });
  await prisma.workflowDiagnostic.deleteMany({ where: { actorUserId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

function merge(fixture: Fixture) {
  return prisma.$transaction((tx) =>
    executeMemberMerge(tx, fixture.primaryId, fixture.secondaryId, fixture.primaryId),
  );
}

test('a shared one-off award no longer aborts the merge', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  // Both members completed the assessment. `awardPoints` leaves entityId at
  // its default '', so the two rows share (event, entity_id) and the repoint
  // used to raise P2002 — which aborted the transaction and killed the merge
  // with an error naming course_progress.
  await prisma.pointsTransaction.createMany({
    data: [
      { userId: fixture.primaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'course_completed', entityId: 'intro', points: 75 },
    ],
  });
  await prisma.memberPoints.createMany({
    data: [
      { userId: fixture.primaryId, totalPoints: 100, level: 'starter' },
      { userId: fixture.secondaryId, totalPoints: 175, level: 'starter' },
    ],
  });

  const result = await merge(fixture);

  // The merged member ends up with ONE assessment award, not two and not an error.
  const primaryRows = await prisma.pointsTransaction.findMany({
    where: { userId: fixture.primaryId },
    select: { event: true, entityId: true, points: true },
    orderBy: { event: 'asc' },
  });
  assert.ok(primaryRows.length > 0, 'the primary must hold rows after the merge');
  assert.equal(primaryRows.filter((row) => row.event === 'assessment_completed').length, 1);
  assert.equal(primaryRows.filter((row) => row.event === 'course_completed').length, 1);

  // The duplicate stays on the merged-away account. Nothing is deleted.
  const strandedCount = await prisma.pointsTransaction.count({ where: { userId: fixture.secondaryId } });
  assert.equal(strandedCount, 1);

  const report = result.repointed.find((entry) => entry.startsWith('pointsTransaction.userId'));
  assert.ok(report, 'the merge report must name the points repoint');
  assert.match(report, /1 kept on the merged account/);
});

test('the points counter is recomputed from the ledger, not left behind', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  // No colliding key: every one of the secondary's rows moves.
  await prisma.pointsTransaction.createMany({
    data: [
      { userId: fixture.primaryId, event: 'resume_uploaded', entityId: 'first-upload', points: 50 },
      { userId: fixture.secondaryId, event: 'course_completed', entityId: 'intro', points: 75 },
      { userId: fixture.secondaryId, event: 'job_application', entityId: 'app-1', points: 25 },
    ],
  });
  await prisma.memberPoints.createMany({
    data: [
      { userId: fixture.primaryId, totalPoints: 50, level: 'starter' },
      { userId: fixture.secondaryId, totalPoints: 100, level: 'starter' },
    ],
  });

  await merge(fixture);

  const ledger = await prisma.pointsTransaction.aggregate({
    where: { userId: fixture.primaryId },
    _sum: { points: true },
  });
  const counter = await prisma.memberPoints.findUnique({
    where: { userId: fixture.primaryId },
    select: { totalPoints: true, level: true },
  });
  assert.equal(ledger._sum.points, 150);
  assert.ok(counter, 'the primary must still have a points row');
  // Before the fix this stayed at 50 while the ledger said 150 — the tile and
  // the trend line beneath it disagreeing, permanently.
  assert.equal(counter.totalPoints, 150);
  assert.equal(counter.level, 'starter');
});

test('the recomputed counter counts only the rows that actually moved', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  await prisma.pointsTransaction.createMany({
    data: [
      { userId: fixture.primaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'certification_earned', entityId: 'comptia', points: 200 },
    ],
  });
  await prisma.memberPoints.create({
    data: { userId: fixture.primaryId, totalPoints: 100, level: 'starter' },
  });

  await merge(fixture);

  const counter = await prisma.memberPoints.findUnique({
    where: { userId: fixture.primaryId },
    select: { totalPoints: true, level: true },
  });
  // 100 kept + 200 moved. The stranded duplicate is NOT counted twice.
  assert.equal(counter?.totalPoints, 300);
  assert.equal(counter?.level, 'builder');
});

test('invitations and subgroup memberships actually move', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  const subgroupId = randomUUID();
  await prisma.subgroup.create({
    data: {
      id: subgroupId,
      name: `merge-proof-${subgroupId}`,
      type: 'manager',
      leaderId: fixture.primaryId,
      createdBy: fixture.primaryId,
    },
  });
  await prisma.memberSubgroup.create({
    data: { memberId: fixture.secondaryId, subgroupId, assignmentType: 'manual_admin' },
  });
  await prisma.invitation.create({
    data: {
      email: 'invitee@example.invalid',
      role: 'member',
      invitedById: fixture.secondaryId,
      token: `merge-proof-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  await merge(fixture);

  // Before the fix the executor asked for `invitation.inviterId` and
  // `memberSubgroup.userId`, neither of which is a column, so both of these
  // stayed on the dead account and the failure was reported as a
  // "constraint conflict".
  assert.equal(await prisma.invitation.count({ where: { invitedById: fixture.primaryId } }), 1);
  assert.equal(await prisma.invitation.count({ where: { invitedById: fixture.secondaryId } }), 0);
  assert.equal(await prisma.memberSubgroup.count({ where: { memberId: fixture.primaryId } }), 1);
  assert.equal(await prisma.memberSubgroup.count({ where: { memberId: fixture.secondaryId } }), 0);
});

test('the preview reports the collision instead of promising a clean merge', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  await prisma.pointsTransaction.createMany({
    data: [
      { userId: fixture.primaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'course_completed', entityId: 'intro', points: 75 },
    ],
  });

  const preview = await prisma.$transaction((tx) =>
    buildMergePreview(tx, fixture.primaryId, fixture.secondaryId),
  );

  const points = preview.relationsToRepoint.find((row) => row.model === 'pointsTransaction' && row.field === 'userId');
  assert.ok(points, 'the preview must mention the points rows');
  assert.equal(points.count, 2);
  assert.equal(points.moving, 1);
  assert.equal(points.keptOnSecondary, 1);
  // And it must not invent a conflict: this merge is allowed to proceed.
  assert.equal(preview.conflicts.length, 0);
});

test.after(() => prisma.$disconnect());
