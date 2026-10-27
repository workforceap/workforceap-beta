#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFeatureChild, PLAN_VERSION } from './ci-plan.mjs';

/** A skipped gate is valid only when a successful planner selected its peer. */
export function evaluateGate(needs, event = {}) {
  const mode = needs?.plan?.outputs?.mode;
  if (needs?.plan?.outputs?.version !== PLAN_VERSION) return { ok: false, reason: 'Unknown CI plan version' };
  if (!['full', 'affected'].includes(mode)) return { ok: false, reason: 'Missing or invalid CI plan' };
  if (mode === 'affected' && !isFeatureChild(event.eventName, event.baseRef)) {
    return { ok: false, reason: 'Affected mode cannot satisfy a release or unknown-base gate' };
  }
  const expected = {
    plan: 'success', 'static-gates': 'success', unit: 'success',
    vitest: mode === 'full' ? 'success' : 'skipped',
    build: mode === 'full' ? 'success' : 'skipped',
    'database-contract': mode === 'full' ? 'success' : 'skipped',
    'vitest-affected': mode === 'affected' ? 'success' : 'skipped',
  };
  const failed = Object.entries(expected)
    .filter(([job, result]) => needs?.[job]?.result !== result)
    .map(([job, result]) => `${job}: expected ${result}, received ${needs?.[job]?.result ?? 'missing'}`);
  return { ok: failed.length === 0, reason: failed.length ? failed.join('; ') : `${mode} validation succeeded` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const verdict = evaluateGate(JSON.parse(process.env.NEEDS_JSON ?? '{}'), {
      eventName: process.env.GITHUB_EVENT_NAME, baseRef: process.env.GITHUB_BASE_REF,
    });
    console.log(verdict.reason);
    if (!verdict.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`Invalid gate receipt: ${error.message}`);
    process.exitCode = 1;
  }
}
