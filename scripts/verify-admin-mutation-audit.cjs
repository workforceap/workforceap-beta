#!/usr/bin/env node
/**
 * CI guardrail (WAP-18): every `app/api/admin/**\/route.ts` that exports a
 * mutating method (POST / PATCH / PUT / DELETE) must write an audit row.
 *
 * A route is covered when its source references `auditLog` or `logAuditEvent`
 * directly, OR when it imports one of the DELEGATED_AUDIT_HELPERS below (the
 * helper itself is checked for an audit call, so a helper cannot silently
 * lose its audit write). Routes that mutate nothing — previews, dry runs,
 * AI generation that returns text — sit on ALLOWLIST with a reason.
 *
 * Usage: node scripts/verify-admin-mutation-audit.cjs
 *        node scripts/verify-admin-mutation-audit.cjs --list   (print coverage table)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_API_ROOT = path.join(ROOT, 'app', 'api', 'admin');

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Helpers that perform the audit write on behalf of the route. Each entry is
 * verified to contain an audit call itself. Keys are import specifiers as they
 * appear in route source.
 */
const DELEGATED_AUDIT_HELPERS = {
  '@/lib/admin/applicationReview': 'lib/admin/applicationReview.ts',
  '@/lib/admin/courseraEnrollmentApproval': 'lib/admin/courseraEnrollmentApproval.ts',
  '@/lib/coursera/enrollPort': 'lib/coursera/enrollPort.ts',
};

/**
 * Routes whose mutating verb does not persist anything. Keep this list short
 * and every entry justified; adding a real data mutation here defeats the gate.
 */
const ALLOWLIST = {
  'app/api/admin/email-templates/[id]/preview/route.ts': 'renders a template preview; no persistence',
  'app/api/admin/email-crons/[id]/dry-run/route.ts': 'counts recipients for a dry run; no persistence',
  'app/api/admin/blog/ai/review/route.ts': 'returns AI review text; no persistence',
  'app/api/admin/blog/ai/suggest-topics/route.ts': 'returns AI topic suggestions; no persistence',
  'app/api/admin/blog/generate/route.ts': 'returns generated copy for the editor; no persistence',
  'app/api/admin/reports/wioa/generate/route.ts': 'computes a WIOA report and returns it; nothing is stored (WAP-18)',
};

const AUDIT_CALL = /\b(auditLog|logAuditEvent)\s*\(/;
const AUDIT_IMPORT = /\b(auditLog|logAuditEvent)\b/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function exportedMutatingMethods(source) {
  const found = new Set();
  for (const method of MUTATING_METHODS) {
    const patterns = [
      new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\b`),
      new RegExp(`export\\s+async\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
    ];
    if (patterns.some((re) => re.test(source))) found.add(method);
  }
  return [...found];
}

function importedDelegatedHelpers(source) {
  return Object.keys(DELEGATED_AUDIT_HELPERS).filter((specifier) =>
    new RegExp(`from\\s+['"]${specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`).test(source),
  );
}

function classify(file) {
  const relPath = rel(file);
  const source = fs.readFileSync(file, 'utf8');
  const methods = exportedMutatingMethods(source);
  if (methods.length === 0) return { relPath, methods, status: 'read-only' };
  if (AUDIT_IMPORT.test(source) && AUDIT_CALL.test(source)) return { relPath, methods, status: 'direct' };
  const helpers = importedDelegatedHelpers(source);
  if (helpers.length > 0) return { relPath, methods, status: 'delegated', helpers };
  if (ALLOWLIST[relPath]) return { relPath, methods, status: 'allowlisted', reason: ALLOWLIST[relPath] };
  return { relPath, methods, status: 'missing' };
}

function verifyHelpers() {
  const failures = [];
  for (const [specifier, helperPath] of Object.entries(DELEGATED_AUDIT_HELPERS)) {
    const full = path.join(ROOT, helperPath);
    if (!fs.existsSync(full)) {
      failures.push(`${specifier}: helper file ${helperPath} does not exist`);
      continue;
    }
    const src = fs.readFileSync(full, 'utf8');
    if (!AUDIT_CALL.test(src)) failures.push(`${specifier}: ${helperPath} no longer calls auditLog/logAuditEvent`);
  }
  return failures;
}

function verifyAllowlist(results) {
  const failures = [];
  const byPath = new Map(results.map((r) => [r.relPath, r]));
  for (const relPath of Object.keys(ALLOWLIST)) {
    const entry = byPath.get(relPath);
    if (!entry) failures.push(`allowlist entry ${relPath} does not exist — remove it`);
    else if (entry.status !== 'allowlisted') {
      failures.push(`allowlist entry ${relPath} is now ${entry.status} — remove the stale exemption`);
    }
  }
  return failures;
}

function run() {
  if (!fs.existsSync(ADMIN_API_ROOT)) {
    console.error('[verify-admin-mutation-audit] app/api/admin not found');
    process.exit(1);
  }
  const results = walk(ADMIN_API_ROOT).sort().map(classify);
  const mutating = results.filter((r) => r.status !== 'read-only');
  const missing = mutating.filter((r) => r.status === 'missing');
  const failures = [...verifyHelpers(), ...verifyAllowlist(results)];

  if (process.argv.includes('--list')) {
    for (const r of mutating) {
      console.log(`${r.status.padEnd(12)} ${r.methods.join(',').padEnd(18)} ${r.relPath}${r.helpers ? `  via ${r.helpers.join(', ')}` : ''}`);
    }
  }

  for (const r of missing) {
    console.error(
      `[verify-admin-mutation-audit] ${r.relPath} exports ${r.methods.join('/')} but references neither auditLog nor logAuditEvent.` +
        ' Add a dual audit call, delegate to a listed audited helper, or (only for a non-persisting verb) add an ALLOWLIST entry with a reason.',
    );
  }
  for (const f of failures) console.error(`[verify-admin-mutation-audit] ${f}`);

  if (missing.length > 0 || failures.length > 0) process.exit(1);

  const counts = mutating.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  console.log(
    `[verify-admin-mutation-audit] OK — ${mutating.length} mutating admin routes audited ` +
      `(direct ${counts.direct || 0}, delegated ${counts.delegated || 0}, allowlisted ${counts.allowlisted || 0})`,
  );
}

module.exports = { classify, exportedMutatingMethods, ALLOWLIST, DELEGATED_AUDIT_HELPERS };

if (require.main === module) run();
