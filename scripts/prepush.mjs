#!/usr/bin/env node
/**
 * Fast checks before a push (WAP-203), and the same list CI's `static-gates`
 * job runs (WAP-200). One script, two scopes, so local and CI can't drift:
 *
 *   npm run prepush                   local: guards, tsc, ESLint + lint guards
 *                                     on files changed vs origin/master, and
 *                                     `vitest --changed` against that base.
 *   node scripts/prepush.mjs --ci     CI static-gates: guards, tsc, the full
 *                                     `lint` script and knip. No Vitest here;
 *                                     the sharded Vitest jobs run every file.
 *
 * Options:
 *   --base <ref>   compare against <ref> instead of origin/master (local only)
 *   --list         print the checks this scope would run, then exit
 *
 * Fails fast: the first failing check stops the run and exits non-zero.
 *
 * The tenant-scoping pin is read from .github/workflows/ci-gate.yml
 * (`TENANT_SCOPING_MAX_UNSCOPED`), never duplicated here. The `lint` and
 * `deadcode` commands are read from package.json, so a guard added to
 * `npm run lint` runs here too.
 *
 * Opt-in hook: `git config core.hooksPath .githooks` runs this before every
 * `git push` (skip once with `git push --no-verify`). Nothing is installed by
 * default and there are no new dependencies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'ci-gate.yml');
const LINTABLE = /\.(c|m)?[jt]sx?$/;

const args = process.argv.slice(2);
const CI_SCOPE = args.includes('--ci');
const LIST_ONLY = args.includes('--list');
const baseIndex = args.indexOf('--base');
const BASE_REF = baseIndex >= 0 ? args[baseIndex + 1] : 'origin/master';
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

if (baseIndex >= 0 && !BASE_REF) fail('usage', '--base needs a git ref');

function fail(name, message) {
  if (IN_ACTIONS) console.log(`::error title=${name}::${message}`);
  console.error(`\n[prepush] FAILED: ${name}\n  ${message}`);
  process.exit(1);
}

/** The tenant-scoping pin lives in ci-gate.yml, next to its WAP-24 note. */
function readTenantPin(workflowText) {
  const match = workflowText.match(/^\s*TENANT_SCOPING_MAX_UNSCOPED:\s*"?(\d+)"?\s*$/m);
  return match ? Number(match[1]) : null;
}

function tenantPin() {
  const pin = readTenantPin(readFileSync(WORKFLOW, 'utf8'));
  if (pin === null) {
    fail('tenant-scoping pin', `TENANT_SCOPING_MAX_UNSCOPED not found in ${path.relative(ROOT, WORKFLOW)}`);
  }
  const fromEnv = process.env.TENANT_SCOPING_MAX_UNSCOPED;
  if (fromEnv !== undefined && Number(fromEnv) !== pin) {
    fail('tenant-scoping pin', `env TENANT_SCOPING_MAX_UNSCOPED=${fromEnv} disagrees with ci-gate.yml (${pin})`);
  }
  return pin;
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Files changed between the merge base with BASE_REF and the working tree. */
function changedFiles() {
  let mergeBase;
  try {
    mergeBase = git('merge-base', BASE_REF, 'HEAD');
  } catch {
    fail(
      'changed files',
      `no merge base with ${BASE_REF}. Run \`git fetch origin master\` (or pass --base <ref>).`,
    );
  }
  const out = git('diff', '--name-only', '--diff-filter=ACMR', mergeBase);
  return { mergeBase, files: out ? out.split('\n').filter(Boolean) : [] };
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lintParts = String(pkg.scripts.lint)
  .split('&&')
  .map((part) => part.trim())
  .filter(Boolean);

function quote(file) {
  return /^[\w./@+-]+$/.test(file) ? file : `"${file.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** Build the ordered check list for this scope. */
function plan() {
  const checks = [
    { name: 'Migration timestamp history', cmd: 'node scripts/check-duplicate-migrations.mjs' },
    { name: 'No new source-text tests (WAP-175)', cmd: 'node scripts/verify-no-source-text-tests.mjs' },
    { name: 'Admin mutation audit coverage (WAP-18)', cmd: 'node scripts/verify-admin-mutation-audit.cjs' },
    { name: 'High-risk tenant routes', cmd: 'node scripts/verify-high-risk-tenant-routes.cjs' },
    {
      name: 'Tenant-scoping ratchet (WAP-24)',
      cmd: `node scripts/audit-tenant-scoping.cjs --max-unscoped ${tenantPin()}`,
    },
    { name: 'Material Symbols subset', cmd: 'node scripts/verify-material-symbols-font-size.mjs' },
  ];

  let changed = null;
  if (!CI_SCOPE) {
    changed = changedFiles();
    if (changed.files.includes('prisma/schema.prisma')) {
      checks.push({ name: 'Prisma client (schema changed)', cmd: 'node scripts/prisma-env.js prisma generate' });
    }
  }

  checks.push({ name: 'Typecheck', cmd: 'tsc --noEmit' });

  for (const part of lintParts) {
    if (/^eslint(\s|$)/.test(part)) {
      if (CI_SCOPE) {
        checks.push({ name: 'Lint (ESLint, whole repo)', cmd: part });
      } else {
        const lintable = changed.files.filter((file) => LINTABLE.test(file));
        checks.push(
          lintable.length
            ? {
                name: `Lint (ESLint, ${lintable.length} changed file${lintable.length === 1 ? '' : 's'})`,
                cmd: `eslint --no-warn-ignored ${lintable.map(quote).join(' ')}`,
              }
            : { name: 'Lint (ESLint)', skip: 'no changed JS/TS files' },
        );
      }
    } else {
      checks.push({ name: `Lint guard: ${part.replace(/^node\s+/, '')}`, cmd: part });
    }
  }

  if (CI_SCOPE) {
    checks.push({ name: 'Dead code (knip, WAP-37)', cmd: String(pkg.scripts.deadcode) });
  } else {
    checks.push({
      name: `Vitest (files related to changes since ${BASE_REF})`,
      cmd: `vitest run --changed ${changed.mergeBase} --passWithNoTests`,
    });
  }
  return checks;
}

const checks = plan();
console.log(`[prepush] scope: ${CI_SCOPE ? 'ci (static-gates)' : `local (vs ${BASE_REF})`}, ${checks.length} checks`);

if (LIST_ONLY) {
  for (const check of checks) console.log(`  - ${check.name}: ${check.skip ? `skipped (${check.skip})` : check.cmd}`);
  process.exit(0);
}

const env = {
  ...process.env,
  PATH: `${path.join(ROOT, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
};
const timings = [];
const started = Date.now();

for (const check of checks) {
  if (check.skip) {
    console.log(`\n[prepush] ${check.name}: skipped (${check.skip})`);
    timings.push([check.name, 'skip']);
    continue;
  }
  if (IN_ACTIONS) console.log(`::group::${check.name}`);
  console.log(`\n[prepush] ${check.name}\n  $ ${check.cmd}`);
  const t0 = Date.now();
  const result = spawnSync(check.cmd, { cwd: ROOT, env, stdio: 'inherit', shell: true });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  if (IN_ACTIONS) console.log('::endgroup::');
  timings.push([check.name, `${seconds}s`]);
  if (result.status !== 0) {
    fail(check.name, `\`${check.cmd}\` exited ${result.status ?? result.signal} after ${seconds}s`);
  }
}

console.log('\n[prepush] all checks passed');
for (const [name, time] of timings) console.log(`  ${time.padStart(7)}  ${name}`);
console.log(`  total ${((Date.now() - started) / 1000).toFixed(1)}s`);
