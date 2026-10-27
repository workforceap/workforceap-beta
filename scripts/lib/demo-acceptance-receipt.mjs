import { canonical, verifyJournalEvents } from './demo-acceptance-journal.mjs';
import { pendingOperations } from './demo-acceptance-lifecycle.mjs';
import { acceptanceReasons, readbackReasons, cleanupReasons, ROLE_ACTIONS, FIVE_ROLES } from './five-role-acceptance.mjs';

export const MUTATING_SCENARIOS = Object.freeze(['member-goal', 'counselor-note', 'admin-note', 'employer-profile', 'partner-profile', 'member-location', 'member-notifications', 'member-message-read']);
export const MEMBER_SCENARIOS = Object.freeze(['member-location', 'member-notifications', 'member-message-read', 'member-preassessment-incomplete', 'member-preassessment-completed']);

/** Final verdict binds artifacts to the freshly exported authoritative journal. */
export function verifyDurableAcceptance({ acceptance, readback, cleanup, journal }, expectedIdentity) {
  const reasons = [];
  let state;
  try {
    state = verifyJournalEvents(journal.events, expectedIdentity.runId);
    if (canonical(state.identity) !== canonical(expectedIdentity)) reasons.push('Journal identity differs from trusted workflow context.');
    if (journal.digest !== state.digest) reasons.push('Journal export digest mismatch.');
    if (pendingOperations(state).length) reasons.push('An unresolved write remains quarantined.');
  } catch { reasons.push('Authoritative journal export is missing, invalid or unbound.'); }
  for (const [name, receipt] of Object.entries({ acceptance, readback, cleanup })) {
    if (!receipt) { reasons.push(`${name} receipt is missing.`); continue; }
    if (receipt.runId !== expectedIdentity.runId || canonical(receipt.identity) !== canonical(expectedIdentity)) reasons.push(`${name} identity mismatch.`);
    if (!state?.events.some(event => event.digest === receipt.journalDigest)) reasons.push(`${name} journal anchor is missing.`);
  }
  if (acceptance) reasons.push(...acceptanceReasons(acceptance));
  if (readback) reasons.push(...readbackReasons(readback, acceptance));
  if (cleanup) reasons.push(...cleanupReasons(cleanup, acceptance));
  if (cleanup?.cleanupOnly === true) reasons.push('Cleanup-only recovery cannot establish acceptance.');
  if (cleanup?.auditRowsRetained !== true) reasons.push('Audit retention was not confirmed.');
  for (const role of FIVE_ROLES) {
    const action = acceptance?.roles?.[role]?.action;
    if (action?.method !== ROLE_ACTIONS[role].method || action?.path !== ROLE_ACTIONS[role].path) reasons.push(`${role} action differs from the trusted endpoint contract.`);
    if (cleanup?.users?.[role]?.userId !== acceptance?.roles?.[role]?.userId || cleanup?.users?.[role]?.email !== acceptance?.roles?.[role]?.email) reasons.push(`${role} cleanup identity mismatch.`);
  }
  if (state) {
    const positions = [acceptance, readback, cleanup].map(receipt => state.events.findIndex(event => event.digest === receipt?.journalDigest));
    if (!(positions[0] >= 0 && positions[0] < positions[1] && positions[1] < positions[2])) reasons.push('Acceptance, readback and cleanup journal anchors are out of order.');
  }
  for (const scenario of MEMBER_SCENARIOS) {
    const evidence = acceptance?.memberScenarios?.[scenario];
    if (evidence?.passed !== true) reasons.push(`${scenario} did not pass.`);
    if (scenario.includes('preassessment') && evidence?.fixtureSetupOnly !== true) reasons.push('Assessment fixture setup must be distinguished from product assessment scoring.');
    if (!scenario.includes('preassessment') && (evidence?.appReadbackMatched !== true || evidence?.databaseMatched !== true)) reasons.push(`${scenario} lacks app and database readback.`);
  }
  for (const scenario of MUTATING_SCENARIOS) {
    const events = state?.events.filter(event => event.data?.operationId === `app:${scenario}`) ?? [];
    if (events.filter(event => event.kind === 'intent').length !== 1 || events.filter(event => event.kind === 'confirmed').length !== 1) reasons.push(`${scenario} lacks a single durable attempt and confirmation.`);
    if (!events.some(event => event.kind === 'confirmed' && event.data.observed?.appReadbackMatched === true && event.data.observed?.databaseMatched === true)) reasons.push(`${scenario} lacks durable acceptance.`);
  }
  const last = state?.events.at(-1);
  if (last?.kind !== 'cleanup-complete' || last.data.cleanupOnly === true) reasons.push('The durable journal does not finish with original-run cleanup.');
  if (!state?.events.some(event => event.kind === 'db-committed' && event.data.operationId === 'cleanup-db')) reasons.push('Atomic database cleanup was not recorded.');
  if (!state?.events.some(event => event.kind === 'db-committed' && event.data.operationId === 'preassessment-fixture' && event.data.fixtureSetupOnly === true)) reasons.push('Completed assessment fixture lacks durable compare-and-set evidence.');
  return { ok: reasons.length === 0, reasons };
}
