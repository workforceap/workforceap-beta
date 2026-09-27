#!/usr/bin/env node
/**
 * Workflow step for .github/workflows/resume-demo-acceptance.yml.
 *   check-target  exit 1 when RESUME_ACCEPTANCE_TARGET_ORIGIN is not a URL or is
 *                 an exact production hostname (the value is never printed).
 *   receipt       exit 1 unless RESUME_ACCEPTANCE_OUTPUT exists with pass: true
 *                 AND RESUME_QA_CLEANUP_OUTPUT proves the member was removed.
 */
import { hostnameOf, isProductionHost, verifyAcceptanceReceipt, verifyCleanupReceipt } from './lib/resume-acceptance-receipt.mjs';

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
  // Both are checked and reported, so one failure never hides the other.
  const acceptance = verifyAcceptanceReceipt(process.env.RESUME_ACCEPTANCE_OUTPUT);
  const cleanup = verifyCleanupReceipt(process.env.RESUME_QA_CLEANUP_OUTPUT);
  console.log(`Acceptance receipt: ${acceptance.reason}. Cleanup receipt: ${cleanup.reason}.`);
  if (!acceptance.ok) console.error(`::error::${acceptance.reason}`);
  if (!cleanup.ok) console.error(`::error::${cleanup.reason}`);
  if (!acceptance.ok || !cleanup.ok) process.exit(1);
} else {
  console.error('Usage: verify-resume-acceptance-receipt.mjs check-target|receipt');
  process.exit(2);
}
