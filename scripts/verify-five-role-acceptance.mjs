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
import { readFileSync } from 'node:fs';
import { identityFromEnvironment } from './lib/demo-acceptance-lifecycle.mjs';
import { verifyDurableAcceptance } from './lib/demo-acceptance-receipt.mjs';

// The expected run comes from the workflow's own context, never from a receipt.
let expectedIdentity = null;
try {
  expectedIdentity = identityFromEnvironment(process.env);
} catch (error) {
  console.error(`::error::${error.message}`);
}
const read = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const result = expectedIdentity ? verifyDurableAcceptance({ acceptance: read(process.env.FIVE_ROLE_ACCEPTANCE_OUTPUT), readback: read(process.env.FIVE_ROLE_QA_READBACK_OUTPUT), cleanup: read(process.env.FIVE_ROLE_QA_CLEANUP_OUTPUT), journal: read(process.env.FIVE_ROLE_QA_JOURNAL_OUTPUT) }, expectedIdentity) : { ok: false, reasons: ['Trusted workflow identity is invalid.'] };
if (result.ok) {
  console.log('All required mutation, persistence and cleanup receipts match the retained journal.');
} else {
  for (const reason of result.reasons) console.error(`::error::${reason}`);
  process.exit(1);
}
