#!/usr/bin/env node
/**
 * Workflow step for .github/workflows/preview-service-key-check.yml:
 *   node scripts/check-preview-service-key.mjs PREVIEW_SUPABASE_URL PREVIEW_SUPABASE_SERVICE_ROLE_KEY
 * Reads exactly those two env vars, runs diagnoseDemoServiceKeyHeaders once
 * (scripts/lib/demo-service-key-probe.cjs: the both-header gate GET, then one
 * apikey-only GET to the same hardcoded endpoint) and prints one JSON line,
 * {urlProject, key, keyFormat, bothHeaders, apikeyOnly}, with fixed labels
 * only. Exit 0 only when key (the both-header gate) is "valid". When
 * both-header is rejected but apikey-only is valid, a second fixed line says
 * the client headers must be fixed together with the probe first.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { diagnoseDemoServiceKeyHeaders } = require('./lib/demo-service-key-probe.cjs');

const EXPECTED = ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'];
export const CLIENT_HEADERS_NOTE =
  'The DEMO key is accepted with apikey only but refused with apikey + Authorization: Bearer, which is what the harness client sends. Fix the client headers together with the probe before any Auth write; do not rotate the key on this result.';

export async function run(argv, env, fetchImpl = globalThis.fetch) {
  // Never read arbitrary variables or echo untrusted arguments.
  if (argv.length !== EXPECTED.length || EXPECTED.some((name, index) => argv[index] !== name)) {
    return { ok: false, line: JSON.stringify({ error: 'usage: check-preview-service-key.mjs PREVIEW_SUPABASE_URL PREVIEW_SUPABASE_SERVICE_ROLE_KEY' }) };
  }
  const result = await diagnoseDemoServiceKeyHeaders({ url: env.PREVIEW_SUPABASE_URL, key: env.PREVIEW_SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  // The gate is the both-header result only; apikeyOnly never makes it pass.
  const ok = result.urlProject === 'demo' && result.key === 'valid';
  const note = result.bothHeaders === 'rejected' && result.apikeyOnly === 'valid' ? CLIENT_HEADERS_NOTE : undefined;
  return note ? { ok, line: JSON.stringify(result), note } : { ok, line: JSON.stringify(result) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, line, note } = await run(process.argv.slice(2), process.env);
  process.stdout.write(`${line}\n`);
  if (note) process.stdout.write(`${note}\n`);
  if (!ok) process.exitCode = 1;
}
