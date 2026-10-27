/** Disposable localhost PostgreSQL proof, not hosted DEMO acceptance. */
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createJournal, createPrismaJournalStore, digest } from './lib/demo-acceptance-journal.mjs';
import { readOwnedGraph, assertGraphUnchanged, assertGraphTransition, assertJournaledLoginEvents } from './lib/demo-acceptance-owned-rows';
import { createLifecycle, assertCleanupQuiescent } from './lib/demo-acceptance-lifecycle.mjs';
import { type Role, type FixtureState } from './five-role-demo-fixture';
import { createAcceptanceRows } from './lib/demo-acceptance-cli';
import { FIVE_ROLES, emailFor, partnerSlugFor, seededValueFor, writtenValueFor } from './lib/five-role-acceptance.mjs';
import { PHASE_CONTENT_PATHS, PHASE_SCOPES, createPhaseBlueprint, phaseBlueprintHash, assertPhaseApproval } from './lib/demo-acceptance-phase-plan.mjs';
import { phaseDescriptor, transitionPhaseRows, assertPhaseRows, deletePhaseRows, verifyPhaseAbsence, phaseCheckpointsFromJournal } from './lib/demo-acceptance-phase-rows';

async function main() {
  if (process.env.TEST_REAL_DB !== '1') { console.log('SKIP: owned-row proof needs explicitly enabled local PostgreSQL.'); return; }
  const url = new URL(process.env.POSTGRES_PRISMA_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['postgres:', 'postgresql:'].includes(url.protocol) || url.search) throw new Error('Only an unambiguous local disposable PostgreSQL URL is allowed.');
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  const runId = `${randomInt(100_000_000, 999_999_999)}-1`;
  const organizationId = randomUUID();
  const target = { organizationId, organizationSlug: `portal-qa-local-${runId}`, databaseUrl: url.toString() };
  const users = Object.fromEntries((FIVE_ROLES as Role[]).map(role => [role, { userId: randomUUID(), email: emailFor(runId, role) }])) as Record<Role, { userId: string; email: string }>;
  const state: FixtureState = { runId, organizationId, users };
  const identity = { repository: 'workforceap/workforceap-beta', workflowRunId: runId.slice(0, -2), workflowAttempt: 1, runId,
    projectRef: 'esbdrgaonplpvzmtrdhw', organizationId, controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: digest({ localTest: runId }) };
  const phaseNow = Date.now();
  const blueprint = createPhaseBlueprint({ ...identity, fixtureAsOf: new Date(phaseNow).toISOString(), contentProof: PHASE_CONTENT_PATHS.map(path => ({ path, baselineBlob: 'd'.repeat(40), candidateBlob: 'd'.repeat(40) })) });
  // Simulation confined to this disposable localhost contract. It is never exported as hosted approval.
  const simulatedApproval = { schemaVersion: 1, contract: 'portal-phase-approval-v1', approved: true, blueprintHash: phaseBlueprintHash(blueprint), repository: identity.repository, projectRef: identity.projectRef,
    runId, organizationId, controlSha: identity.controlSha, baselineSha: identity.baselineSha, reviewer: { login: 'mabrown040', id: 225406758 }, scopes: [...PHASE_SCOPES],
    approvedAt: new Date(phaseNow).toISOString(), expiresAt: new Date(phaseNow + 3 * 60 * 60_000).toISOString(), reference: `https://github.com/workforceap/workforceap-beta/actions/runs/${identity.workflowRunId}` };
  const store = createPrismaJournalStore(db);
  const journal = createJournal(store);
  const createdRoles: string[] = [];
  let notificationId: string | undefined;
  const foreignUserId = randomUUID();
  try {
    await db.organization.create({ data: { id: organizationId, name: 'Local contract', slug: target.organizationSlug } });
    for (const role of FIVE_ROLES) if (!(await db.role.findUnique({ where: { name: role } }))) createdRoles.push((await db.role.create({ data: { name: role } })).id);
    const claim = await journal.claim(identity, 'local-owner');
    const input = { organizationId, users, partner: { slug: partnerSlugFor(runId), name: seededValueFor(runId, 'partner'), referralCode: `QA-${runId}` }, employerCompanyName: seededValueFor(runId, 'employer') };
    const atomic = async (tx: Prisma.TransactionClient) => {
      const result = await createAcceptanceRows(tx, target, input, runId, blueprint);
      const ownedGraph = result.evidence.ownedGraph;
      assert.equal(ownedGraph.UserRole.length, 5, 'compound primary keys retain all roles');
      assert.equal(ownedGraph.MemberEvent.length, 6, 'incomplete preassessment gate is seeded exactly');
      assert.equal(ownedGraph.MessageThread.length, 1, 'message-read fixture is run-owned');
      return result;
    };
    const sabotage = createJournal({ transaction: callback => store.transaction((tx: Parameters<typeof callback>[0]) => callback({ ...tx, find: async () => null })) });
    await assert.rejects(sabotage.atomic(runId, 'local-owner', claim.revision, 'db-committed', { preimage: null }, atomic), /readback failure/);
    assert.equal(await db.user.count({ where: { id: { in: Object.values(users).map(user => user.userId) } } }), 0, 'journal readback failure rolls back every user');
    assert.equal(await db.partner.count({ where: { slug: partnerSlugFor(runId) } }), 0, 'journal failure rolls back the partner');
    const committed = await journal.atomic(runId, 'local-owner', claim.revision, 'db-committed', { preimage: null }, atomic);
    Object.assign(state, committed.result);
    const original = await readOwnedGraph(db, state);
    await db.user.create({ data: { id: foreignUserId, organizationId, email: `foreign-${runId}@example.com`, fullName: 'Local boundary probe', wioaReviewedByUserId: users.admin.userId } });
    await assert.rejects(readOwnedGraph(db, state), /Foreign User root/);
    await db.user.delete({ where: { id: foreignUserId } });
    await assert.rejects(journal.atomic(runId, 'stale-owner', committed.state.revision, 'db-committed', {}, atomic), /stale/);
    notificationId = (await db.notification.create({ data: { userId: users.member.userId, type: 'contract', title: 'Unexpected related record', body: 'Synthetic local test' } })).id;
    await assert.rejects(readOwnedGraph(db, state), /Unexpected related Notification/);
    await db.notification.delete({ where: { id: notificationId } }); notificationId = undefined;
    await db.profile.update({ where: { userId: users.member.userId }, data: { city: 'Concurrent edit' } });
    assert.throws(() => assertGraphUnchanged(original, { ...original, Profile: [] }), /drifted/);
    const concurrent = await readOwnedGraph(db, state);
    assert.throws(() => assertGraphUnchanged(original, concurrent), /drifted/);
    const revision = (await journal.read(runId)).revision;
    await assert.rejects(journal.atomic(runId, 'local-owner', revision, 'db-committed', { preimage: original }, async (tx: Prisma.TransactionClient) => {
      assertGraphUnchanged(original, await readOwnedGraph(tx, state));
      await tx.profile.update({ where: { userId: users.member.userId }, data: { city: null } });
      return { result: true, evidence: {} };
    }), /drifted/);
    assert.equal((await db.profile.findUniqueOrThrow({ where: { userId: users.member.userId } })).city, 'Concurrent edit', 'stale restore never overwrites concurrent edits');
    assert.equal((await journal.read(runId)).revision, revision);
    // An independently acknowledged test reset affects only this local test fixture.
    await db.profile.update({ where: { userId: users.member.userId }, data: { city: null } });
    assertGraphUnchanged(original, await readOwnedGraph(db, state));
    const changed = structuredClone(original);
    changed.User.find(row => row.id === users.member.userId)!.courseraEnrollmentApproved = true;
    assert.throws(() => assertGraphTransition(original, changed, 'member-notifications', state), /Unexpected/);
    const lifecycle = createLifecycle(journal, identity, 'local-owner');
    await assert.rejects(lifecycle.write('app:member-goal', { graphDigest: digest(original) }, {}, async (received: (response: { status: number }) => Promise<void>) => {
      await db.goal.create({ data: { userId: users.member.userId, title: writtenValueFor(runId, 'member'), goalType: 'wap6_qa' } });
      await received({ status: 201 });
      throw new Error('Injected UI failure after the real database write');
    }, () => false, { readKnownFailure: async () => ({ ownedGraph: await readOwnedGraph(db, state), acceptancePassed: false }) }), /cleanup remains available/);
    assertCleanupQuiescent(await journal.read(runId));
    // Production login emits this event for every role, asynchronously. Exercise late arrival during a goal window.
    for (const role of FIVE_ROLES as Role[]) await db.$executeRaw`INSERT INTO member_events (id, user_id, event_name, source_page, metadata, created_at) VALUES (${randomUUID()}, ${users[role].userId}, 'member_logged_in', '/login', '{}'::jsonb, NOW())`;
    let cleanupGraph = await readOwnedGraph(db, state);
    const loginBudgets = Object.fromEntries(Object.values(users).map(user => [user.userId, 1]));
    assertJournaledLoginEvents(cleanupGraph, state, original.MemberEvent.map(row => row.id), loginBudgets);
    assert.throws(() => assertJournaledLoginEvents(cleanupGraph, state, original.MemberEvent.map(row => row.id), {}), /durable attempt/);
    assertGraphTransition(original, cleanupGraph, 'member-goal', state);
    state.phase = phaseDescriptor(blueprint, 'unassigned', cleanupGraph);
    await journal.atomic(runId, 'local-owner', (await journal.read(runId)).revision, 'db-committed', { operationId: 'phase:unassigned', preimage: cleanupGraph }, async () => ({ result: state, evidence: { fixtureState: state, phase: state.phase, ownedGraph: cleanupGraph, approval: assertPhaseApproval(simulatedApproval, blueprint, 'unassigned', { now: phaseNow }) } }));
    const assignedRevision = (await journal.read(runId)).revision;
    await assert.rejects(journal.atomic(runId, 'local-owner', assignedRevision, 'db-committed', { operationId: 'phase:assigned-owner', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'assigned-owner', { ...simulatedApproval, scopes: [] }, phaseNow)), /required synthetic/);
    await assert.rejects(sabotage.atomic(runId, 'local-owner', assignedRevision, 'db-committed', { operationId: 'phase:assigned-owner', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'assigned-owner', simulatedApproval, phaseNow)), /readback failure/);
    assert.equal(await db.courseEnrollment.count({ where: { userId: users.member.userId } }), 0, 'lost journal readback rolls back canonical enrollment');
    assert.equal(await db.aIToolResult.count({ where: { userId: users.member.userId } }), 0);
    assert.equal(await db.mentor.count({ where: { userId: users.member.userId } }), 0);
    const assigned = await journal.atomic(runId, 'local-owner', assignedRevision, 'db-committed', { operationId: 'phase:assigned-owner', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'assigned-owner', simulatedApproval, phaseNow));
    Object.assign(state, assigned.result); cleanupGraph = await readOwnedGraph(db, state);
    assertPhaseRows(blueprint, state, cleanupGraph);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users.member.userId } })).enrolledProgram, null, 'legacy program pointer remains untouched');
    assert.equal(await db.courseProgress.count({ where: { userId: users.member.userId } }), 0);
    const foreignResult = await db.aIToolResult.create({ data: { userId: users.member.userId, toolType: 'career_counselor', inputSummary: 'Foreign local probe', output: 'Must not be swept', parentToolResultId: blueprint.ids.counselorResult } });
    try { await assert.rejects(readOwnedGraph(db, state), /Foreign AIToolResult phase record/); }
    finally { await db.aIToolResult.delete({ where: { id: foreignResult.id } }); }
    const approvedRevision = (await journal.read(runId)).revision;
    await assert.rejects(journal.atomic(runId, 'local-owner', approvedRevision, 'db-committed', { operationId: 'phase:approved-profile', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'approved-profile', { ...simulatedApproval, scopes: PHASE_SCOPES.slice(0, 3) }, phaseNow)), /required synthetic/);
    await assert.rejects(sabotage.atomic(runId, 'local-owner', approvedRevision, 'db-committed', { operationId: 'phase:approved-profile', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'approved-profile', simulatedApproval, phaseNow)), /readback failure/);
    assert.equal((await db.mentor.findUniqueOrThrow({ where: { id: blueprint.ids.mentor } })).isActive, false, 'exposure rolls back with journal failure');
    assert.equal(await db.job.count({ where: { id: blueprint.ids.job } }), 0);
    const approved = await journal.atomic(runId, 'local-owner', approvedRevision, 'db-committed', { operationId: 'phase:approved-profile', preimage: cleanupGraph }, (tx: Prisma.TransactionClient) =>
      transitionPhaseRows(tx, state, cleanupGraph, blueprint, 'approved-profile', simulatedApproval, phaseNow));
    Object.assign(state, approved.result); cleanupGraph = await readOwnedGraph(db, state); assertPhaseRows(blueprint, state, cleanupGraph);
    await assert.rejects(verifyPhaseAbsence(db, state), /record remains/);
    const checkpoints = (await journal.read(runId)).events;
    assert.deepEqual(phaseCheckpointsFromJournal(checkpoints, blueprint, simulatedApproval).issues, []);
    const tampered = structuredClone(checkpoints);
    tampered.find((event: { data?: { operationId?: string } }) => event.data?.operationId === 'phase:assigned-owner').data.phase.stateDigest = '0'.repeat(64);
    assert.deepEqual(phaseCheckpointsFromJournal(tampered, blueprint, simulatedApproval).issues, ['phase:assigned-owner:checkpoint_invalid']);
    assert.ok(phaseCheckpointsFromJournal(checkpoints.slice(0, -1), blueprint, simulatedApproval).issues.includes('phase:approved-profile:checkpoint_missing_or_duplicate'));
    await journal.atomic(runId, 'local-owner', (await journal.read(runId)).revision, 'db-committed', { operationId: 'cleanup-db', preimage: cleanupGraph }, async (tx: Prisma.TransactionClient) => {
      assertGraphUnchanged(cleanupGraph, await readOwnedGraph(tx, state));
      await deletePhaseRows(tx, state, cleanupGraph);
      await tx.user.deleteMany({ where: { id: { in: Object.values(users).map(user => user.userId) }, organizationId } });
      await tx.partner.delete({ where: { id: state.partnerId! } });
      const ownedGraph = await readOwnedGraph(tx, state);
      assert.ok(Object.values(ownedGraph).every(rows => rows.length === 0));
      const phaseAbsence = await verifyPhaseAbsence(tx, state);
      assert.deepEqual(phaseAbsence, { ids: blueprint.ids, absent: true });
      return { result: true, evidence: { ownedGraph, phaseAbsence } };
    });
    assert.ok((await journal.read(runId)).events.length >= 3, 'journal remains after owned rows are removed');
    console.log(JSON.stringify({ ok: true, target: 'isolated-local-postgresql', simulatedApprovalOnly: true, runId, checks: ['atomic-fixture-and-journal', 'rollback-after-lost-readback', 'compound-primary-key-inventory', 'foreign-root-refusal', 'unexpected-related-row-refusal', 'stale-owner-refusal', 'compare-and-set-drift-refusal', 'sensitive-field-refusal', 'received-write-then-ui-failure-cleanup', 'all-role-late-login-events', 'unattempted-login-refusal', 'phase-approval-scope-refusal', 'canonical-enrollment-without-legacy-pointer', 'assigned-phase-atomic-rollback', 'foreign-phase-child-refusal', 'exposure-phase-atomic-rollback', 'all-three-phase-readback', 'atomic-phase-cleanup-and-absence', 'journal-retention'] }));
  } finally {
    await db.job.deleteMany({ where: { id: blueprint.ids.job, employerId: state.employerId } });
    await db.mentor.deleteMany({ where: { id: blueprint.ids.mentor, userId: users.member.userId } });
    await db.aIToolResult.deleteMany({ where: { id: blueprint.ids.counselorResult, userId: users.member.userId } });
    await db.courseEnrollment.deleteMany({ where: { id: blueprint.ids.enrollment, userId: users.member.userId } });
    await db.user.deleteMany({ where: { id: foreignUserId, organizationId } });
    if (notificationId) await db.notification.deleteMany({ where: { id: notificationId } });
    await db.user.deleteMany({ where: { id: { in: Object.values(users).map(user => user.userId) }, organizationId } });
    await db.partner.deleteMany({ where: { slug: partnerSlugFor(runId), organizationId } });
    await db.auditLog.deleteMany({ where: { targetType: 'PortalQaRun', targetId: runId } });
    await db.organization.deleteMany({ where: { id: organizationId, slug: target.organizationSlug } });
    await db.role.deleteMany({ where: { id: { in: createdRoles } } });
    await db.$disconnect();
  }
}
main().catch(() => { console.error('Local owned-row contract failed; inspect the task-owned database.'); process.exitCode = 1; });
