import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PORTAL_REVIEW_FIXTURES } from '../lib/dev/portalReviewFixtures';
import { createPortalBrowserPlan } from './lib/portal-browser-plan.mjs';
import { evaluateAcceptanceLanes, mergeLocalFixtureCompanion } from './lib/portal-acceptance-lanes.mjs';
import { identityFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { verifyDurableAcceptance, MUTATING_SCENARIOS, MEMBER_SCENARIOS } from './lib/demo-acceptance-receipt.mjs';
const env = process.env;
const read = (path: string | undefined) => { try { return JSON.parse(readFileSync(path!, 'utf8')); } catch { return null; } };
const identity = identityFromEnvironment(env);
const acceptance = read(env.FIVE_ROLE_ACCEPTANCE_OUTPUT);
const result = verifyDurableAcceptance({ acceptance, readback: read(env.FIVE_ROLE_QA_READBACK_OUTPUT), cleanup: read(env.FIVE_ROLE_QA_CLEANUP_OUTPUT), journal: read(env.FIVE_ROLE_QA_JOURNAL_OUTPUT) }, identity);
const input = read(env.PORTAL_BROWSER_INPUT);
const plan = createPortalBrowserPlan({ identity, fixtures: PORTAL_REVIEW_FIXTURES, memberId: input?.memberId, dynamicRoutes: input?.dynamicRoutes ?? [] });
const actionCases = {
  'five-role-actions': MUTATING_SCENARIOS.slice(0, 5), 'member-actions': [...MEMBER_SCENARIOS],
  'database-readback': [...MUTATING_SCENARIOS], cleanup: ['exact-users-and-records-absent', 'audit-journal-retained'],
};
const expectedCases = { ...plan.expectedCases, ...actionCases };
const completedAt = new Date().toISOString();
const supplemental = Object.entries(actionCases).map(([lane, cases]) => ({ schemaVersion: 1, identity, lane,
  status: result.ok ? 'passed' : 'failed', startedAt: acceptance?.startedAt ?? completedAt, completedAt,
  cases: cases.map(id => ({ id, status: result.ok ? 'passed' : 'failed', ...(result.ok ? {} : { reason: 'durable_acceptance_failed' }) })),
}));
const browser = read(env.PORTAL_BROWSER_OUTPUT);
const local = read(env.PORTAL_LOCAL_FIXTURE_OUTPUT);
let browserReceipts = browser?.receipts ?? [];
if (local) browserReceipts = mergeLocalFixtureCompanion(browser, local, identity, plan.cases.filter(item => item.missing === 'local_development_only_fixture').map(item => item.id));
const report = evaluateAcceptanceLanes(identity, expectedCases, [...browserReceipts, ...supplemental]);
const output = env.FIVE_ROLE_QA_FINAL_OUTPUT;
if (!output) throw new Error('Final receipt output path is required.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ ...report, identity, mutationReasons: result.reasons, observedAt: completedAt }, null, 2));
console.log(`Portal acceptance: ${report.status}`);
process.exitCode = report.status === 'passed' ? 0 : 1;
