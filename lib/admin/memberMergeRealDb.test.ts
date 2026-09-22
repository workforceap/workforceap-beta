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
  await prisma.trainingAccessRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.learningProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.readinessChecklist.deleteMany({ where: { userId: { in: ids } } });
  await prisma.placedOutcome.deleteMany({ where: { userId: { in: ids } } });
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

test('state the member was granted is lifted onto the primary, never revoked', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  // The reviewer's scenario: the duplicate account is the one that actually
  // got somewhere. Before the resolution rules, every one of these was
  // silently discarded because the primary happened to hold a weaker row.
  await prisma.trainingAccessRequest.createMany({
    data: [
      { userId: fixture.primaryId, providerKey: 'coursera', status: 'PENDING' },
      {
        userId: fixture.secondaryId,
        providerKey: 'coursera',
        status: 'ACTIVE',
        approvedAt: new Date('2026-03-01T00:00:00Z'),
        activatedAt: new Date('2026-03-02T00:00:00Z'),
      },
    ],
  });
  await prisma.learningProgress.createMany({
    data: [
      { userId: fixture.primaryId, pathwayId: 'path-1', completed: false, progress: 0 },
      { userId: fixture.secondaryId, pathwayId: 'path-1', completed: false, progress: 90 },
    ],
  });
  await prisma.readinessChecklist.createMany({
    data: [
      { userId: fixture.primaryId, section: 1, itemKey: 'resume', completed: false },
      { userId: fixture.secondaryId, section: 1, itemKey: 'resume', completed: true, completedAt: new Date() },
    ],
  });

  await merge(fixture);

  const training = await prisma.trainingAccessRequest.findFirst({
    where: { userId: fixture.primaryId, providerKey: 'coursera' },
    select: { status: true, approvedAt: true, activatedAt: true },
  });
  assert.equal(training?.status, 'ACTIVE', 'an ACTIVE grant must not be revoked by a PENDING one');
  assert.ok(training?.approvedAt, 'the approval timestamp comes with it');
  assert.ok(training?.activatedAt);

  const learning = await prisma.learningProgress.findFirst({
    where: { userId: fixture.primaryId, pathwayId: 'path-1' },
    select: { progress: true },
  });
  assert.equal(learning?.progress, 90, '90% progress must not be replaced by 0%');

  const readiness = await prisma.readinessChecklist.findFirst({
    where: { userId: fixture.primaryId, itemKey: 'resume' },
    select: { completed: true },
  });
  assert.equal(readiness?.completed, true, 'a completed item must not become incomplete');

  // Nothing was deleted: the duplicate rows remain on the archived account.
  assert.equal(await prisma.learningProgress.count({ where: { userId: fixture.secondaryId } }), 1);
});

test('a weaker duplicate never drags the primary backwards', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  await prisma.learningProgress.createMany({
    data: [
      { userId: fixture.primaryId, pathwayId: 'path-1', completed: true, progress: 100 },
      { userId: fixture.secondaryId, pathwayId: 'path-1', completed: false, progress: 10 },
    ],
  });

  await merge(fixture);

  const learning = await prisma.learningProgress.findFirst({
    where: { userId: fixture.primaryId, pathwayId: 'path-1' },
    select: { progress: true, completed: true },
  });
  assert.equal(learning?.progress, 100);
  assert.equal(learning?.completed, true);
});

test('a merge that would strand a placement is refused, not guessed', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  // A 2024 internship on the primary and a 2026 engineering role on the
  // duplicate. No rule can honestly pick; a human has to.
  await prisma.placedOutcome.createMany({
    data: [
      {
        userId: fixture.primaryId,
        employerName: 'Old Co',
        jobTitle: 'Intern',
        startingSalary: 20000,
        placedAt: new Date('2024-06-01T00:00:00Z'),
      },
      {
        userId: fixture.secondaryId,
        employerName: 'New Co',
        jobTitle: 'Engineer',
        startingSalary: 95000,
        placedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ],
  });

  await assert.rejects(merge(fixture), /Merge blocked by/);

  // And the admin is told which record needs the decision, before confirming.
  const preview = await prisma.$transaction((tx) =>
    buildMergePreview(tx, fixture.primaryId, fixture.secondaryId),
  );
  const conflict = preview.conflicts.find((entry) => entry.field.startsWith('placedOutcome'));
  assert.ok(conflict, 'the preview must raise the placement as a conflict');
  assert.match(conflict.message, /only one can survive/);
  // It must name the two competing records and say what to do, or the admin
  // is left at a dead end with no way to complete the merge.
  assert.match(conflict.message, /Old Co, Intern/, 'names the record being kept');
  assert.match(conflict.message, /New Co, Engineer/, 'names the record on the duplicate');
  assert.match(conflict.message, /delete or correct the one you are not keeping/);
  assert.match(conflict.message, /merge will go through once only one of them exists/);
  assert.match(conflict.primaryValue as string, /Old Co/);
  assert.match(conflict.secondaryValue as string, /New Co/);

  // Nothing moved, including the points that would have credited a placement
  // whose record is on the other account.
  assert.equal(await prisma.placedOutcome.count({ where: { userId: fixture.secondaryId } }), 1);
});

test('the preview discloses what the merge does to the points total and level', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  await prisma.pointsTransaction.createMany({
    data: [
      { userId: fixture.primaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'assessment_completed', entityId: '', points: 100 },
      { userId: fixture.secondaryId, event: 'placement_recorded', entityId: 'p-1', points: 500 },
    ],
  });
  await prisma.memberPoints.create({
    data: { userId: fixture.primaryId, totalPoints: 100, level: 'starter' },
  });

  const preview = await prisma.$transaction((tx) =>
    buildMergePreview(tx, fixture.primaryId, fixture.secondaryId),
  );

  assert.equal(preview.points.primaryTotal, 100);
  // 100 kept + 500 moved; the colliding assessment award is not double counted.
  assert.equal(preview.points.mergedTotal, 600);
  assert.equal(preview.points.changes, true);
  assert.notEqual(preview.points.primaryLevel, preview.points.mergedLevel);

  await merge(fixture);
  const after = await prisma.memberPoints.findUnique({
    where: { userId: fixture.primaryId },
    select: { totalPoints: true, level: true },
  });
  // What the preview promised is what the merge did.
  assert.equal(after?.totalPoints, preview.points.mergedTotal);
  assert.equal(after?.level, preview.points.mergedLevel);
});

test('two members with no points at all get no memberPoints row invented', async (t) => {
  const fixture = await makeFixture();
  t.after(() => cleanup(fixture));

  const result = await merge(fixture);

  assert.equal(await prisma.memberPoints.count({ where: { userId: fixture.primaryId } }), 0);
  assert.equal(
    result.mergedFields.some((field) => field.startsWith('memberPoints.totalPoints')),
    false,
    'a 0 -> 0 change is not a change',
  );
});

test.after(() => prisma.$disconnect());
