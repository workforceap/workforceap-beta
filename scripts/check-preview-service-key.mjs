#!/usr/bin/env node
/**
 * Workflow step for .github/workflows/preview-service-key-check.yml:
 *   node scripts/check-preview-service-key.mjs PREVIEW_SUPABASE_URL PREVIEW_SUPABASE_SERVICE_ROLE_KEY
 * Reads exactly those two env vars, runs probeDemoServiceKey once
 * (scripts/lib/demo-service-key-probe.cjs) and prints one JSON line,
 * {urlProject, key}, with fixed labels only. Exit 0 only when key is "valid".
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { probeDemoServiceKey } = require('./lib/demo-service-key-probe.cjs');

const EXPECTED = ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'];

export async function run(argv, env, fetchImpl = globalThis.fetch) {
  // Never read arbitrary variables or echo untrusted arguments.
  if (argv.length !== EXPECTED.length || EXPECTED.some((name, index) => argv[index] !== name)) {
    return { ok: false, line: JSON.stringify({ error: 'usage: check-preview-service-key.mjs PREVIEW_SUPABASE_URL PREVIEW_SUPABASE_SERVICE_ROLE_KEY' }) };
  }
  const result = await probeDemoServiceKey({ url: env.PREVIEW_SUPABASE_URL, key: env.PREVIEW_SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  return { ok: result.urlProject === 'demo' && result.key === 'valid', line: JSON.stringify(result) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, line } = await run(process.argv.slice(2), process.env);
  process.stdout.write(`${line}\n`);
  if (!ok) process.exitCode = 1;
}
