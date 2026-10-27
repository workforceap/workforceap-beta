const test = require('node:test');
const assert = require('node:assert/strict');
const { createJournal, createMemoryJournalStore } = require('./lib/demo-acceptance-journal.mjs');
const { verifyDurableAcceptance, MUTATING_SCENARIOS, MEMBER_SCENARIOS } = require('./lib/demo-acceptance-receipt.mjs');
const { FIVE_ROLES, emailFor, ACCEPTANCE_KIND, READBACK_KIND, CLEANUP_KIND, ROLE_ACTIONS } = require('./lib/five-role-acceptance.mjs');

async function evidence() {
  const runId = '4242-1';
  const identity = { runId, workflowRunId: '4242', workflowAttempt: 1, repository: 'workforceap/workforceap-beta', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: 'd'.repeat(64) };
  const journal = createJournal(createMemoryJournalStore());
  let state = await journal.claim(identity, 'owner');
  const append = async (kind, data) => { state = await journal.append(runId, 'owner', state.revision, kind, data); };
  const uid = index => `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`;
  const roles = Object.fromEntries(FIVE_ROLES.map((role, index) => [role, { userId: uid(index + 1), email: emailFor(runId, role), recordId: uid(index + 20), identityVerified: true, action: { ...ROLE_ACTIONS[role], status: 200, ok: true }, appReadback: { status: 200, matched: true } }]));
  for (const scenario of MUTATING_SCENARIOS) {
    await append('intent', { operationId: `app:${scenario}` });
    await append('confirmed', { operationId: `app:${scenario}`, observed: { appReadbackMatched: true, databaseMatched: true } });
  }
  await append('db-committed', { operationId: 'preassessment-fixture', fixtureSetupOnly: true });
  const acceptance = { kind: ACCEPTANCE_KIND, runId, identity, journalDigest: state.digest, pass: true, outcome: 'success', attempts: 1, roles,
    memberScenarios: Object.fromEntries(MEMBER_SCENARIOS.map(scenario => [scenario, { passed: true, fixtureSetupOnly: true, appReadbackMatched: true, databaseMatched: true }])) };
  await append('readback', { complete: true });
  const readback = { kind: READBACK_KIND, runId, identity, journalDigest: state.digest, success: true,
    roles: Object.fromEntries(FIVE_ROLES.map(role => [role, { userId: roles[role].userId, recordId: roles[role].recordId, found: true, ownerMatched: true, valueMatched: true }])) };
  await append('db-committed', { operationId: 'cleanup-db' });
  await append('cleanup-complete', { cleanupOnly: false });
  const cleanup = { kind: CLEANUP_KIND, runId, identity, journalDigest: state.digest, success: true, fixturesCreated: true, auditRowsRetained: true, cleanupOnly: false,
    users: Object.fromEntries(FIVE_ROLES.map(role => [role, { userId: roles[role].userId, email: roles[role].email, authAbsenceVerified: true, databaseAbsenceVerified: true }])),
    records: Object.fromEntries(FIVE_ROLES.map(role => [role, { recordId: roles[role].recordId, absenceVerified: true }])),
    partner: { partnerId: roles.partner.recordId, absenceVerified: true }, notes: { absenceVerified: true } };
  return { expected: identity, bundle: { acceptance, readback, cleanup, journal: { identity, events: state.events, digest: state.digest } } };
}
test('all immutable receipts and required durable scenarios can pass together', async () => {
  const { expected, bundle } = await evidence();
  assert.deepEqual(verifyDurableAcceptance(bundle, expected), { ok: true, reasons: [] });
});
test('missing lanes, stale SHA, unknown journal, cleanup-only and incomplete member checks never pass', async () => {
  for (const mutate of [
    bundle => { bundle.readback = null; },
    bundle => { bundle.acceptance.identity = { ...bundle.acceptance.identity, deployedSha: 'e'.repeat(40) }; },
    bundle => { bundle.acceptance.journalDigest = 'e'.repeat(64); },
    bundle => { bundle.cleanup.cleanupOnly = true; },
    bundle => { bundle.cleanup.success = false; },
    bundle => { delete bundle.acceptance.memberScenarios['member-message-read']; },
    bundle => { bundle.journal.events[2].data.observed.databaseMatched = false; },
  ]) {
    const { expected, bundle } = await evidence(); mutate(bundle);
    assert.equal(verifyDurableAcceptance(bundle, expected).ok, false);
  }
});
