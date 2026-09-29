#!/usr/bin/env node
/**
 * CLI for the WAP-202 preview smoke (logic: scripts/lib/preview-smoke.mjs).
 * Run by .github/workflows/preview-smoke.yml after each successful Vercel
 * Preview deployment; also runnable by hand against any preview or a local
 * `next start`:
 *
 *   PREVIEW_SMOKE_BASE_URL=http://localhost:3000 node scripts/preview-smoke.mjs
 *
 * Environment:
 *   PREVIEW_SMOKE_BASE_URL            origin to probe (required)
 *   PREVIEW_SMOKE_EXPECTED_SHA        full commit the deployment should serve (optional;
 *                                     checked against /api/health `version`)
 *   VERCEL_AUTOMATION_BYPASS_SECRET   Vercel "Protection Bypass for Automation" secret
 *                                     (optional; sent only to *.vercel.app origins)
 *   PREVIEW_SMOKE_OUTPUT              write the JSON result here (optional)
 *   GITHUB_STEP_SUMMARY / GITHUB_OUTPUT  set by Actions
 *
 * Exit codes: 0 pass · 1 a probe failed · 2 configuration error ·
 * 3 Vercel Deployment Protection answered and no working bypass secret was set.
 * The origin is never printed: preview URLs are unguessable by design.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPreviewProbes,
  formatSummary,
  loadRouteProbes,
  normalizeOrigin,
  runPreviewSmoke,
} from './lib/preview-smoke.mjs';

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const origin = normalizeOrigin(process.env.PREVIEW_SMOKE_BASE_URL);
if (!origin) {
  console.error('[preview-smoke] PREVIEW_SMOKE_BASE_URL must be an http(s) origin.');
  setOutput('result', 'error');
  process.exit(2);
}

const parsed = loadRouteProbes();
if (!parsed.ok) {
  console.error(`[preview-smoke] cannot read the probe list from app/api/cron/smoke-test/route.ts: ${parsed.reason}`);
  setOutput('result', 'error');
  process.exit(2);
}

const probes = buildPreviewProbes(parsed.probes);
const expectedSha = (process.env.PREVIEW_SMOKE_EXPECTED_SHA ?? '').trim().toLowerCase();
const bypassSecret = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '').trim();

console.log(
  `[preview-smoke] ${probes.length} probes (${parsed.probes.length} shared with the production smoke-test route); ` +
    `expected sha=${expectedSha ? expectedSha.slice(0, 7) : 'n/a'} bypass=${bypassSecret ? 'set' : 'unset'}`,
);

const outcome = await runPreviewSmoke({ origin, probes, bypassSecret, expectedSha });

for (const r of outcome.results) {
  const line = `[preview-smoke] ${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(20)} ${r.path.padEnd(26)} ${r.chain ?? r.status}`;
  console.log(r.ok ? line : `${line} — ${r.reason}`);
}

const summary = formatSummary(outcome, { shortSha: expectedSha.slice(0, 7) });
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.PREVIEW_SMOKE_OUTPUT) {
  mkdirSync(path.dirname(process.env.PREVIEW_SMOKE_OUTPUT), { recursive: true });
  writeFileSync(process.env.PREVIEW_SMOKE_OUTPUT, `${JSON.stringify({ ...outcome, checkedAt: new Date().toISOString() }, null, 2)}\n`);
}

const failed = outcome.results.filter((r) => !r.ok).map((r) => r.name);

if (outcome.result === 'protected') {
  if (bypassSecret) {
    // A configured secret that Vercel rejects is a real failure, not a skip.
    setOutput('result', 'fail');
    setOutput('failed', 'vercel-protection');
    console.log(
      '::error::Vercel Deployment Protection rejected the bypass secret. Regenerate "Protection Bypass for Automation" in Vercel and update the VERCEL_AUTOMATION_BYPASS_SECRET repository secret.',
    );
    process.exit(1);
  }
  setOutput('result', 'protected');
  console.log(
    '::notice::Preview is behind Vercel Deployment Protection and VERCEL_AUTOMATION_BYPASS_SECRET is not set; skipping. See docs/HEALTH-PROBES.md "Preview smoke".',
  );
  process.exit(3);
}

setOutput('result', outcome.result);
setOutput('failed', failed.join(','));
if (outcome.result === 'fail') {
  console.log(`::error::Preview smoke failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`[preview-smoke] all ${outcome.checked} probes passed.`);
