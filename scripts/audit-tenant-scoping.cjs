#!/usr/bin/env node
/**
 * Track A — Tenant Isolation Hardening (Sprint A.1)
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * Static-analysis pass that inventories every Prisma read/write against
 * tenant-scoped models and reports whether the call site appears to be
 * scoped via `withTenantScope` or one of the explicit allowlist helpers.
 *
 * Reporting by default. With `--max-unscoped <n>` it is a **ratchet**
 * (WAP-24): the run fails when the UNSCOPED count exceeds `n`, so the number
 * pinned in .github/workflows/ci-gate.yml can only fall. When the count drops
 * below the pin the script says so and asks for the pin to be lowered in the
 * same PR; it never fails for being better than the baseline.
 *
 * Usage:
 *   node scripts/audit-tenant-scoping.cjs                     # full report to stdout
 *   node scripts/audit-tenant-scoping.cjs --json              # machine-readable
 *   node scripts/audit-tenant-scoping.cjs --summary           # counts only
 *   node scripts/audit-tenant-scoping.cjs --max-unscoped 678  # CI gate: exit 1 above 678
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// Mirrors lib/tenant/withTenantScope.ts TENANT_SCOPED_MODELS.
// Keep in sync.
const TENANT_SCOPED_MODELS = [
  'user',
  'partner',
  'employer',
  'job',
  'course',
  'courseEnrollment',
  'organizationProgramCatalog',
  'preScreeningResponse',
];

const READ_OPS = ['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'];
// Keep in sync with WRITE_OPS in lib/tenant/scopeProxy.ts.
// `createManyAndReturn` (Prisma 5.14+) and `updateManyAndReturn` (Prisma 5.18+)
// were caught by Codex review on PR #1041 — they were silently invisible to
// the burndown before that fix.
const WRITE_OPS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
];
const ALL_OPS = [...READ_OPS, ...WRITE_OPS];

const SCAN_DIRS = ['app', 'lib', 'components'];

const SKIP_PATHS = [
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.test.ts',
  '.test.tsx',
  // The helper itself + the audit script's own consumers
  'lib/tenant/withTenantScope.ts',
  // Cross-tenant utilities that are intentionally org-aware (not org-scoped).
  // Each entry here should be doc'd in docs/TENANT-ISOLATION.md "Allowlist".
  'lib/tenant/organization.ts',
  'lib/admin/boardOutcomes.ts', // platform aggregate; will scope in Sprint A.2
];

// Markers in surrounding context that indicate the call is properly scoped.
// If any of these appear within a small window above a Prisma call site, we
// treat the call as scoped.
//
// `getDefaultOrganizationId` was REMOVED from this list (Codex P2 catch on
// PR #1041): it's just a value lookup, not actual tenant scoping. Calls
// like `prisma.employer.create({ data: { organizationId } })` near a
// nearby `getDefaultOrganizationId` call were being marked scoped purely
// because of the proximity, even though the call wasn't wrapped in
// `withTenantScope`. That false-positive masked real violations from the
// burndown.
const SCOPE_MARKERS = [
  'withTenantScope',
  'crossTenantOK(',
];

function shouldSkipPath(filePath) {
  return SKIP_PATHS.some((p) => filePath.includes(p));
}

function listSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldSkipPath(full)) continue;
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function buildPattern() {
  const models = TENANT_SCOPED_MODELS.join('|');
  const ops = ALL_OPS.join('|');
  // Matches `prisma.<model>.<op>` or `tx.<model>.<op>`.
  return new RegExp(`(prisma|tx|db)\\.(${models})\\.(${ops})\\b`, 'g');
}

/**
 * Codex P2 catch on PR #1041 (commit 5db07b2bc9): the literal-pattern
 * regex above misses dynamic delegate calls — `tx[model].updateMany(...)`
 * where `model` is a string variable. `app/api/admin/members/merge/
 * route.ts` does exactly this and touches `courseEnrollment` and
 * `preScreeningResponse` (both tenant-scoped) without going through
 * `withTenantScope`. Static analysis can't resolve the variable so we
 * surface every dynamic delegate as a "DYNAMIC" entry that requires
 * manual review.
 */
function buildDynamicPattern() {
  const ops = ALL_OPS.join('|');
  // Matches `prisma[expr].<op>`, `tx[expr].<op>`, `db[expr].<op>` where
  // `expr` is anything inside the brackets (variable, string literal,
  // member-access expression, ternary). We capture the bracket contents
  // verbatim for the report so reviewers can grep for it.
  return new RegExp(`(prisma|tx|db)\\[([^\\]]+)\\]\\.(${ops})\\b`, 'g');
}

function scanFile(filePath) {
  const rel = path.relative(REPO_ROOT, filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const pattern = buildPattern();
  const dynamicPattern = buildDynamicPattern();
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Literal `prisma.<model>.<op>` matches.
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      const lookbackStart = Math.max(0, i - 12);
      const ctx = lines.slice(lookbackStart, i + 1).join('\n');
      const scoped = SCOPE_MARKERS.some((marker) => ctx.includes(marker));
      violations.push({
        file: rel,
        line: i + 1,
        column: match.index + 1,
        symbol: `${match[1]}.${match[2]}.${match[3]}`,
        scoped,
        dynamic: false,
        snippet: line.trim(),
      });
    }

    // Dynamic `prisma[expr].<op>` matches — model unknown at static-analysis
    // time, so we always flag as "dynamic" and require manual review. Marked
    // as scoped only if the surrounding context shows `withTenantScope` /
    // `crossTenantOK`, mirroring the literal-pattern logic.
    dynamicPattern.lastIndex = 0;
    while ((match = dynamicPattern.exec(line)) !== null) {
      const lookbackStart = Math.max(0, i - 12);
      const ctx = lines.slice(lookbackStart, i + 1).join('\n');
      const scoped = SCOPE_MARKERS.some((marker) => ctx.includes(marker));
      violations.push({
        file: rel,
        line: i + 1,
        column: match.index + 1,
        symbol: `${match[1]}[${match[2]}].${match[3]}`,
        scoped,
        dynamic: true,
        snippet: line.trim(),
      });
    }
  }

  return violations;
}

/**
 * Parse `--max-unscoped <n>` (or `--max-unscoped=<n>`). Returns null when
 * absent; throws on a value that is not a non-negative integer so a typo in
 * the workflow cannot silently disable the gate.
 */
function parseMaxUnscoped(args) {
  const idx = args.findIndex((a) => a === '--max-unscoped' || a.startsWith('--max-unscoped='));
  if (idx === -1) return null;
  const raw = args[idx].includes('=') ? args[idx].split('=')[1] : args[idx + 1];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`--max-unscoped expects a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/**
 * The ratchet verdict. Pure so the CLI and the test share it.
 *   over  → fail: new unscoped call sites were added.
 *   under → pass, but the pin is stale and should be lowered.
 *   equal → pass.
 */
function evaluateRatchet(unscopedCount, maxUnscoped) {
  if (unscopedCount > maxUnscoped) return { ok: false, verdict: 'over', delta: unscopedCount - maxUnscoped };
  if (unscopedCount < maxUnscoped) return { ok: true, verdict: 'under', delta: maxUnscoped - unscopedCount };
  return { ok: true, verdict: 'equal', delta: 0 };
}

function main() {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const wantSummary = args.includes('--summary');
  const maxUnscoped = parseMaxUnscoped(args);

  const files = SCAN_DIRS.flatMap((d) => listSourceFiles(path.join(REPO_ROOT, d)));
  const allViolations = files.flatMap(scanFile);

  const unscoped = allViolations.filter((v) => !v.scoped);
  const scoped = allViolations.filter((v) => v.scoped);
  const dynamic = allViolations.filter((v) => v.dynamic);

  if (maxUnscoped !== null) {
    const { ok, verdict, delta } = evaluateRatchet(unscoped.length, maxUnscoped);
    console.log('tenant-scoping ratchet (WAP-24):');
    console.log(`  files scanned:      ${files.length}`);
    console.log(`  scoped:             ${scoped.length}`);
    console.log(`  UNSCOPED:           ${unscoped.length}  (pin: ${maxUnscoped})`);
    if (verdict === 'over') {
      console.log('');
      console.log(`✖ ${delta} more unscoped tenant-model Prisma call site(s) than the pinned baseline.`);
      console.log('  Wrap the new read/write in withTenantScope(orgId, async (db) => …), or mark a');
      console.log('  deliberately cross-tenant read with crossTenantOK(() => …) — see');
      console.log('  docs/TENANT-ISOLATION.md "Allowlist". Never raise the pin to make CI pass.');
      console.log('');
      console.log('  Unscoped call sites (all; diff against master to find the new ones):');
      const byFile = new Map();
      for (const v of unscoped) {
        if (!byFile.has(v.file)) byFile.set(v.file, []);
        byFile.get(v.file).push(v);
      }
      for (const [file, vs] of [...byFile.entries()].sort()) {
        console.log(`    ${file}: ${vs.map((v) => `L${v.line} ${v.symbol}`).join(', ')}`);
      }
      process.exitCode = 1;
      return;
    }
    if (verdict === 'under') {
      console.log('');
      console.log(`✔ ${delta} fewer unscoped call site(s) than the pin. Lower --max-unscoped to ${unscoped.length}`);
      console.log('  in .github/workflows/ci-gate.yml in this PR so the ratchet keeps the gain.');
      return;
    }
    console.log('');
    console.log('✔ Unscoped count matches the pinned baseline.');
    return;
  }

  if (wantJson) {
    process.stdout.write(
      JSON.stringify({ total: allViolations.length, unscoped, scoped, dynamic }, null, 2),
    );
    process.stdout.write('\n');
    return;
  }

  if (wantSummary) {
    console.log(`tenant-scoping audit:`);
    console.log(`  files scanned:      ${files.length}`);
    console.log(`  total call sites:   ${allViolations.length}`);
    console.log(`  scoped:             ${scoped.length}`);
    console.log(`  UNSCOPED:           ${unscoped.length}`);
    console.log(`  dynamic (manual):   ${dynamic.length}  (model unknown at static-analysis time)`);
    return;
  }

  console.log('=== tenant-scoping audit ===');
  console.log(`scanned ${files.length} files in ${SCAN_DIRS.join(', ')}`);
  console.log(`found ${allViolations.length} Prisma calls against tenant-scoped models`);
  console.log(`  ${scoped.length} appear scoped (withTenantScope, crossTenantOK)`);
  console.log(`  ${unscoped.length} appear UNSCOPED — review and migrate`);
  console.log(`  ${dynamic.length} use dynamic delegates (prisma[model].op) — model unknown, manual review required`);
  console.log('');

  // Group unscoped by file
  const byFile = new Map();
  for (const v of unscoped) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }

  if (unscoped.length === 0) {
    console.log('✅ No unscoped tenant-model Prisma calls detected.');
    return;
  }

  console.log('UNSCOPED CALL SITES (file → line:col symbol):');
  for (const [file, vs] of [...byFile.entries()].sort()) {
    console.log(`\n  ${file}`);
    for (const v of vs) {
      const tag = v.dynamic ? ' [DYNAMIC]' : '';
      console.log(`    L${v.line}:${v.column}  ${v.symbol}${tag}`);
      console.log(`      ${v.snippet.slice(0, 120)}${v.snippet.length > 120 ? '…' : ''}`);
    }
  }

  if (dynamic.length > 0) {
    console.log('');
    console.log(`NOTE: ${dynamic.length} dynamic-delegate call sites cannot be statically resolved.`);
    console.log('      Each must be reviewed manually to confirm the runtime model is either');
    console.log('      non-tenant-scoped, or wrapped in withTenantScope, or marked crossTenantOK.');
  }

  console.log('');
  console.log('Migration target: see docs/TENANT-ISOLATION.md "Migration approach" (Sprint A.2).');
  console.log('Each call site needs to be wrapped in withTenantScope(orgId, async (db) => { ... }).');
}

if (require.main === module) {
  main();
}

module.exports = { evaluateRatchet, parseMaxUnscoped };
