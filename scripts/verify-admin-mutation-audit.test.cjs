const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { classify, exportedMutatingMethods, ALLOWLIST, DELEGATED_AUDIT_HELPERS } = require('./verify-admin-mutation-audit.cjs');

const ROOT = path.resolve(__dirname, '..');

function tmpRoute(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wap-audit-gate-'));
  const file = path.join(dir, 'route.ts');
  fs.writeFileSync(file, source);
  return file;
}

test('detects every export shape for mutating methods and ignores GET-only routes', () => {
  assert.deepEqual(exportedMutatingMethods("export async function GET() {}"), []);
  assert.deepEqual(exportedMutatingMethods("export const POST = withApiGuc(_POST);"), ['POST']);
  assert.deepEqual(exportedMutatingMethods("export async function PATCH() {}\nexport function DELETE() {}").sort(), ['DELETE', 'PATCH']);
  assert.deepEqual(exportedMutatingMethods("async function _PUT() {}\nexport { _PUT as PUT };"), ['PUT']);
});

test('a mutating route with no audit reference is reported missing', () => {
  const file = tmpRoute("import { prisma } from '@/lib/db/prisma';\nexport const POST = async () => prisma.user.update({});\n");
  assert.equal(classify(file).status, 'missing');
});

test('a direct auditLog or logAuditEvent call counts as covered', () => {
  const a = tmpRoute("import { auditLog } from '@/lib/audit';\nexport async function DELETE() { await auditLog({}); }\n");
  const b = tmpRoute("import { logAuditEvent } from '@/lib/audit/log';\nexport const PATCH = () => logAuditEvent({});\n");
  assert.equal(classify(a).status, 'direct');
  assert.equal(classify(b).status, 'direct');
});

test('importing the name without calling it is not coverage', () => {
  const file = tmpRoute("import { auditLog } from '@/lib/audit';\nexport async function POST() { return null; }\n");
  assert.equal(classify(file).status, 'missing');
});

test('delegating to a listed audited helper counts as covered', () => {
  const file = tmpRoute("import { changeApplicationStatus } from '@/lib/admin/applicationReview';\nexport const PATCH = () => changeApplicationStatus({});\n");
  const result = classify(file);
  assert.equal(result.status, 'delegated');
  assert.deepEqual(result.helpers, ['@/lib/admin/applicationReview']);
});

test('every delegated helper on disk still performs an audit write', () => {
  for (const helperPath of Object.values(DELEGATED_AUDIT_HELPERS)) {
    const src = fs.readFileSync(path.join(ROOT, helperPath), 'utf8');
    assert.match(src, /\b(auditLog|logAuditEvent)\s*\(/, `${helperPath} must call auditLog or logAuditEvent`);
  }
});

test('allowlist entries exist, are mutating, and carry a reason', () => {
  for (const [relPath, reason] of Object.entries(ALLOWLIST)) {
    const full = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(full), `${relPath} listed in ALLOWLIST does not exist`);
    assert.ok(typeof reason === 'string' && reason.length > 10, `${relPath} needs a reason`);
    const methods = exportedMutatingMethods(fs.readFileSync(full, 'utf8'));
    assert.ok(methods.length > 0, `${relPath} exports no mutating method; drop it from ALLOWLIST`);
  }
});

test('the gate passes against the current tree', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/verify-admin-mutation-audit.cjs')], { encoding: 'utf8' });
  assert.match(out, /OK — \d+ mutating admin routes audited/);
});
