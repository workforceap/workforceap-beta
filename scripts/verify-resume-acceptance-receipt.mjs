#!/usr/bin/env node
/**
 * Workflow step for .github/workflows/resume-demo-acceptance.yml.
 *   check-target  exit 1 when RESUME_ACCEPTANCE_TARGET_ORIGIN is not a URL or is
 *                 an exact production hostname (the value is never printed).
 *   receipt       the one green check: exit 1 unless RESUME_ACCEPTANCE_OUTPUT and
 *                 RESUME_QA_CLEANUP_OUTPUT, read together, show a passing run
 *                 whose member cleanup removed and verified (verifyAcceptanceRun).
 */
import { hostnameOf, isProductionHost, verifyAcceptanceRun } from './lib/resume-acceptance-receipt.mjs';

const command = process.argv[2];
if (command === 'check-target') {
  const host = hostnameOf(process.env.RESUME_ACCEPTANCE_TARGET_ORIGIN);
  if (!host) {
    console.error('::error::The acceptance target is not an http(s) URL.');
    process.exit(1);
  }
  if (isProductionHost(host)) {
    console.error('::error::The acceptance target is a production hostname; refusing.');
    process.exit(1);
  }
  console.log('Acceptance target is not a production hostname.');
} else if (command === 'receipt') {
  const result = verifyAcceptanceRun(process.env.RESUME_ACCEPTANCE_OUTPUT, process.env.RESUME_QA_CLEANUP_OUTPUT);
  if (result.ok) {
    console.log(`Receipts: ${result.reasons[0]}.`);
  } else {
    for (const reason of result.reasons) console.error(`::error::${reason}`);
    process.exit(1);
  }
} else {
  console.error('Usage: verify-resume-acceptance-receipt.mjs check-target|receipt');
  process.exit(2);
}
