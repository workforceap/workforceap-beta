#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { evaluateAcceptanceLanes, mergeLocalFixtureCompanion } from './lib/portal-acceptance-lanes.mjs';

// The coordinator generates expectedCases from the trusted runner and action contract.
// Receipt-owned expectedCases is deliberately ignored.
const [contractPath, outputPath, ...receiptPaths] = process.argv.slice(2);
if (!contractPath || !outputPath || !receiptPaths.length) {
  console.error('Usage: node scripts/portal-acceptance-status.mjs trusted-contract.json output.json receipt.json [...]');
  process.exitCode = 2;
} else {
  let report;
  try {
    const contract = JSON.parse(readFileSync(resolve(contractPath), 'utf8'));
    const bundles = receiptPaths.map(path => JSON.parse(readFileSync(resolve(path), 'utf8')));
    const local = bundles.filter(value => value.kind === 'local-fixture-companion');
    const hosted = bundles.filter(value => value.kind === 'hosted-browser');
    if (local.length > 1 || (local.length && hosted.length !== 1)) throw new Error('Ambiguous browser companion receipts');
    const merged = local.length ? mergeLocalFixtureCompanion(hosted[0], local[0], contract.identity, contract.localFixtureCaseIds) : null;
    const receipts = bundles.flatMap(value => {
      if (value.kind === 'local-fixture-companion') return [];
      if (value.kind === 'hosted-browser' && merged) return merged;
      return Array.isArray(value) ? value : value.receipts ?? [value];
    });
    report = evaluateAcceptanceLanes(contract.identity, contract.expectedCases, receipts);
  } catch {
    report = { status: 'error', failure: 'acceptance_contract_or_evidence_unreadable', observedAt: new Date().toISOString() };
  }
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2));
  console.log(`Portal acceptance: ${report.status}`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
