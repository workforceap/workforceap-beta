import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PORTAL_REVIEW_FIXTURES } from '../lib/dev/portalReviewFixtures';
import { createPortalBrowserPlan, createPortalPhaseContracts } from './lib/portal-browser-plan.mjs';
import { evaluateAcceptanceLanes, mergeLocalFixtureCompanion, combinePortalPhaseReceipts } from './lib/portal-acceptance-lanes.mjs';
import { identityFromEnvironment, fixtureStateFromJournal, phaseBlueprintFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { verifyJournalEvents, canonical, digest } from './lib/demo-acceptance-journal.mjs';
import { PHASE_NAMES } from './lib/demo-acceptance-phase-plan.mjs';
import { phaseCheckpointsFromJournal } from './lib/demo-acceptance-phase-rows';
import { verifyDurableAcceptance, MUTATING_SCENARIOS, MEMBER_SCENARIOS } from './lib/demo-acceptance-receipt.mjs';
import { verifyLocalExecution } from './lib/demo-acceptance-local.mjs';

const env = process.env;
const read = (path: string | undefined) => { try { return JSON.parse(readFileSync(path!, 'utf8')); } catch { return null; } };
const write = (path: string | undefined, value: unknown) => {
  if (!path) throw new Error('Required evidence export path is missing.');
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
let identity: ReturnType<typeof identityFromEnvironment> | null = null;
try {
  identity = identityFromEnvironment(env);
  const acceptance = read(env.FIVE_ROLE_ACCEPTANCE_OUTPUT);
  const journal = read(env.FIVE_ROLE_QA_JOURNAL_OUTPUT);
  const result = verifyDurableAcceptance({ acceptance, readback: read(env.FIVE_ROLE_QA_READBACK_OUTPUT), cleanup: read(env.FIVE_ROLE_QA_CLEANUP_OUTPUT), journal }, identity);
  const blueprint = phaseBlueprintFromEnvironment(env);
  let browser = read(env.PORTAL_BROWSER_OUTPUT);
  let expectedBrowserCases: Record<string, string[]>;
  let localFixtureCaseIds: string[];
  if (blueprint) {
    const state = verifyJournalEvents(journal?.events, identity.runId);
    if (canonical(state.identity) !== canonical(identity)) throw new Error('Phase journal identity mismatch.');
    const plan = state.events.find((event: { data?: { operationId?: string } }) => event.data?.operationId === 'fixture-plan')?.data.plan;
    if (digest(plan) !== identity.planHash || canonical(plan.phaseBlueprint) !== canonical(blueprint)) throw new Error('Phase journal plan mismatch.');
    const fixture = fixtureStateFromJournal(state);
    const checkpoints = phaseCheckpointsFromJournal(state.events, blueprint, JSON.parse(env.DEMO_QA_PHASE_APPROVAL ?? '{}'));
    const cleanupEvents = state.events.filter((event: { kind: string; data?: { operationId?: string } }) => event.kind === 'db-committed' && event.data?.operationId === 'cleanup-db');
    const emptyGraph = cleanupEvents.length === 1 && cleanupEvents[0].data.ownedGraph;
    const phaseAbsence = cleanupEvents[0]?.data.phaseAbsence;
    if (!emptyGraph || Object.values(emptyGraph).some(rows => !Array.isArray(rows) || rows.length !== 0) || phaseAbsence?.absent !== true || canonical(phaseAbsence.ids) !== canonical(blueprint.ids)) checkpoints.issues.push('phase:cleanup:exact_absence_missing');
    result.reasons.push(...checkpoints.issues); result.ok = result.ok && checkpoints.issues.length === 0;
    const contracts = createPortalPhaseContracts({ identity, fixtures: PORTAL_REVIEW_FIXTURES, memberId: fixture.users.member?.userId, phases: checkpoints.phases });
    const bundles = PHASE_NAMES.map(phase => read(`${env.PORTAL_BROWSER_OUTPUT}.${phase}.json`)).filter(Boolean);
    for (const bundle of bundles) if (checkpoints.issues.some(issue => issue.startsWith(`phase:${bundle.phase?.name}:`))) throw new Error('A browser bundle has no valid journaled phase checkpoint.');
    browser = combinePortalPhaseReceipts(identity, contracts.contracts, bundles);
    write(env.PORTAL_BROWSER_OUTPUT, browser);
    expectedBrowserCases = contracts.expectedCases;
    localFixtureCaseIds = contracts.localFixtureCaseIds;
  } else {
    const input = read(env.PORTAL_BROWSER_INPUT);
    const plan = createPortalBrowserPlan({ identity, fixtures: PORTAL_REVIEW_FIXTURES, memberId: input?.memberId, dynamicRoutes: input?.dynamicRoutes ?? [] });
    expectedBrowserCases = plan.expectedCases;
    localFixtureCaseIds = plan.cases.filter(item => item.missing === 'local_development_only_fixture').map(item => item.id);
  }
  const actionCases = {
    'five-role-actions': MUTATING_SCENARIOS.slice(0, 5), 'member-actions': [...MEMBER_SCENARIOS],
    'database-readback': [...MUTATING_SCENARIOS, ...(blueprint ? PHASE_NAMES.map(name => `phase:${name}`) : [])], cleanup: ['exact-users-and-records-absent', 'audit-journal-retained', ...(blueprint ? ['exact-phase-records-absent'] : [])],
  };
  const expectedCases = { ...expectedBrowserCases, ...actionCases };
  const completedAt = new Date().toISOString();
  const supplemental = Object.entries(actionCases).map(([lane, cases]) => ({ schemaVersion: 1, identity, lane,
    status: result.ok ? 'passed' : 'failed', startedAt: acceptance?.startedAt ?? completedAt, completedAt,
    cases: cases.map(id => ({ id, status: result.ok ? 'passed' : 'failed', ...(result.ok ? {} : { reason: 'durable_acceptance_failed' }) })),
  }));
  write(env.PORTAL_ACTION_LANES_OUTPUT, { identity, receipts: supplemental });
  write(env.PORTAL_ACCEPTANCE_CONTRACT_OUTPUT, { identity, expectedCases, localFixtureCaseIds });
  const local = read(env.PORTAL_LOCAL_FIXTURE_OUTPUT);
  let browserReceipts = browser?.receipts ?? [];
  if (local) {
    verifyLocalExecution(read(`${env.PORTAL_LOCAL_FIXTURE_OUTPUT}.execution.json`), readFileSync(env.PORTAL_LOCAL_FIXTURE_OUTPUT!), identity);
    browserReceipts = mergeLocalFixtureCompanion(browser, local, identity, localFixtureCaseIds);
  }
  const report = evaluateAcceptanceLanes(identity, expectedCases, [...browserReceipts, ...supplemental]);
  write(env.FIVE_ROLE_QA_FINAL_OUTPUT, { ...report, identity, mutationReasons: result.reasons, observedAt: completedAt });
  console.log(`Portal acceptance: ${report.status}`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
} catch {
  // A local-only receipt or malformed/missing hosted bundle must still leave an explicit failed final receipt.
  write(env.FIVE_ROLE_QA_FINAL_OUTPUT, { schemaVersion: 1, identity, status: 'error', errors: ['required_acceptance_evidence_missing_or_invalid'], observedAt: new Date().toISOString() });
  console.error('Portal acceptance evidence is missing or invalid; a failed final receipt was written.');
  process.exitCode = 1;
}
