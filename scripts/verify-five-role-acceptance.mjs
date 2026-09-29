#!/usr/bin/env node
/**
 * The one green check of .github/workflows/five-role-demo-acceptance.yml:
 * exit 1 unless FIVE_ROLE_ACCEPTANCE_OUTPUT, FIVE_ROLE_QA_READBACK_OUTPUT and
 * FIVE_ROLE_QA_CLEANUP_OUTPUT, read together, show that all five synthetic
 * roles wrote and read back through the app, the database readback confirmed
 * each row, and cleanup verified every fixture absent (verifyFiveRoleRun), all
 * for THIS workflow run: every receipt's runId must equal
 * `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>` with attempt 1.
 */
import { runIdFor, verifyFiveRoleRun } from './lib/five-role-acceptance.mjs';

// The expected run comes from the workflow's own context, never from a receipt.
let expectedRunId = null;
try {
  expectedRunId = runIdFor(process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT);
} catch (error) {
  console.error(`::error::${error.message}`);
}
const result = verifyFiveRoleRun(
  process.env.FIVE_ROLE_ACCEPTANCE_OUTPUT,
  process.env.FIVE_ROLE_QA_READBACK_OUTPUT,
  process.env.FIVE_ROLE_QA_CLEANUP_OUTPUT,
  expectedRunId,
);
if (result.ok) {
  console.log(`Receipts: ${result.reasons[0]}.`);
} else {
  for (const reason of result.reasons) console.error(`::error::${reason}`);
  process.exit(1);
}
