/**
 * Real PostgreSQL contract for private enrollment agreements. Auto-discovered by
 * scripts/run-db-contract-tests.mjs; requires psql and its localhost wap_shadow
 * launcher. Creates a new, dedicated database, refuses to replace an existing
 * one, and removes only fixtures/roles created by this invocation.
 *
 * Applies the unchanged migration, then executes the application's actual
 * tagged SQL as PREPARE/EXECUTE statements with synthetic bound values. Storage
 * is a narrow SQL stub: this does NOT prove hosted Storage/CDN configuration,
 * HTTP authorization, retention decisions, or authenticated preview acceptance.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const database = 'wap_enrollment_agreements_proof';
const checkTemplatesOnly = process.argv.includes('--check-templates');
const rawUrl = process.env.SHADOW_DATABASE_URL
  ?? (checkTemplatesOnly ? 'postgresql://synthetic@127.0.0.1/wap_shadow' : '');
assert.ok(rawUrl, 'Set the local SHADOW_DATABASE_URL.');
const target = new URL(rawUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'PostgreSQL required.');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Only a local disposable database is allowed.');
assert.equal(target.search, '', 'Connection options are not accepted.');
assert.equal(target.hash, '', 'URL fragments are not accepted.');
assert.equal(decodeURIComponent(target.pathname.slice(1)), 'wap_shadow', 'Use wap_shadow only as a launcher.');
const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: database,
  PGCONNECT_TIMEOUT: '5',
};
// Do not inherit service/options/hostaddr overrides that could redirect psql.
// Remove them, rather than assigning empty strings: libpq treats an explicitly
// empty PGSERVICEFILE as a filename and errors before connecting.
for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS']) delete env[key];
const preamble = '\\set VERBOSITY sqlstate\nSET client_min_messages = warning; SET statement_timeout = \'15s\'; SET lock_timeout = \'10s\';\n';
const migration = readFileSync(resolve(root,
  'prisma/migrations/20261001200042_enrollment_agreement_submissions/migration.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'scripts/enrollment-agreements-storage-preflight.sql'), 'utf8');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const pass = (message) => console.log(`PASS ${message}`);

function psql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], {
    env, input: preamble + input, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, `psql invocation failed: ${result.error?.message}`);
  return result;
}
function sql(input, db = database) {
  const result = psql(input, db);
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function rejects(input, state, message) {
  const result = psql(input);
  assert.notEqual(result.status, 0, `${message}: statement unexpectedly succeeded`);
  assert.match(result.stderr, new RegExp(`\\b${state}\\b`), `${message}: ${result.stderr}`);
}

/** Extract executable SQL, not an assertion about a source-code substring. */
function queryTemplate(path, functionName, { contains } = {}) {
  const source = ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === functionName);
  assert.ok(fn, `Missing canonical function ${functionName}`);
  const queries = [];
  function visit(node) {
    if (ts.isTaggedTemplateExpression(node) && ts.isPropertyAccessExpression(node.tag)
      && ['$queryRaw', '$executeRaw'].includes(node.tag.name.text)) {
      const expressions = [];
      let text;
      if (ts.isNoSubstitutionTemplateLiteral(node.template)) text = node.template.text;
      else {
        text = node.template.head.text;
        for (const span of node.template.templateSpans) {
          expressions.push(span.expression.getText(source));
          text += `$${expressions.length}${span.literal.text}`;
        }
      }
      queries.push({ text, expressions });
    }
    ts.forEachChild(node, visit);
  }
  visit(fn);
  const selected = contains ? queries.filter((query) => query.text.includes(contains)) : queries;
  assert.equal(selected.length, 1, `Expected exactly one canonical query for ${functionName}`);
  return selected[0];
}
const templates = {
  acquire: queryTemplate('lib/enrollmentAgreements/operationLock.ts', 'acquireEnrollmentAgreementUploadLock'),
  release: queryTemplate('lib/enrollmentAgreements/operationLock.ts', 'releaseEnrollmentAgreementUploadLock'),
  erase: queryTemplate('lib/enrollmentAgreements/operationLock.ts', 'claimEnrollmentAgreementErasure', { contains: 'WITH member_lock' }),
  replace: queryTemplate('lib/enrollmentAgreements/service.ts', 'createAgreementSubmission'),
  review: queryTemplate('lib/enrollmentAgreements/service.ts', 'reviewAgreementSubmission'),
  purge: queryTemplate('lib/retention/cleanup.ts', 'purgeEligibleAccount'),
  lifecycleLock: queryTemplate('lib/gdpr/accountLifecycle.ts', 'assertNoAgreementOperationForAccountChange', { contains: 'FOR UPDATE' }),
  lifecycleFence: queryTemplate('lib/gdpr/accountLifecycle.ts', 'assertNoAgreementOperationForAccountChange', { contains: 'SELECT EXISTS' }),
  retentionLock: queryTemplate('lib/member/anonymizeMember.ts', 'anonymizeMember', { contains: 'FOR UPDATE' }),
  restoreClaim: queryTemplate('lib/gdpr/accountLifecycle.ts', 'claimAgreementAccountRestore'),
  restoreOwned: queryTemplate('lib/gdpr/accountLifecycle.ts', 'assertAgreementAccountRestoreOwned', { contains: 'SELECT EXISTS' }),
  restoreRelease: queryTemplate('lib/gdpr/accountLifecycle.ts', 'releaseAgreementAccountRestore'),
};
let statementNumber = 0;
function bind(name, values) {
  const template = templates[name];
  const params = template.expressions.map((expression) => {
    assert.ok(Object.hasOwn(values, expression), `Missing fixture binding: ${expression}`);
    return values[expression];
  });
  const statement = `agreement_proof_${++statementNumber}`;
  return `PREPARE ${statement} (${params.map((value) => typeof value === 'number' ? 'integer' : 'text').join(', ')}) AS ${template.text};\n`
    + `EXECUTE ${statement} (${params.map((value) => value === null ? 'NULL' : typeof value === 'number' ? value : quote(value)).join(', ')});`;
}

const ORG = 'enrollment-proof-org';
const OTHER_ORG = 'enrollment-proof-other-org';
const ADMIN = 'enrollment-proof-admin';
const HASH = 'a'.repeat(64);
const TABLE = 'public.enrollment_agreement_submissions';
const LOCKS = 'public.enrollment_agreement_operation_locks';
const memberName = (id) => `Synthetic ${id}`;
const member = (id, deleted = false) => sql(`INSERT INTO public.users (id, organization_id, deleted_at, full_name) VALUES (${quote(id)}, ${quote(ORG)}, ${deleted ? 'now()' : 'NULL'}, ${quote(memberName(id))});`);
const acquire = (id, token, organization = ORG) => bind('acquire', { memberId: id, 'actor.organizationId': organization, token });
const release = (id, token) => bind('release', { memberId: id, 'actor.organizationId': ORG, token });
const erase = (id, token, deletedBefore = null) => bind('erase', { memberId: id, token, deletedBefore });
const cutoff = '2026-09-01 00:00:00';
const purge = (id) => bind('purge', { id, cutoff, SELF_SERVICE_AUDIT_ACTOR_ROLE: 'member' });
const lifecycleLock = (id) => bind('lifecycleLock', { memberId: id, lockInOrganization: ORG });
const lifecycleFence = (id) => bind('lifecycleFence', { memberId: id });
const retentionLock = (id) => bind('retentionLock', { userId: id, cutoff });
const restoreClaim = (id, token) => bind('restoreClaim', { memberId: id, organizationId: ORG, token });
const restoreOwned = (id, token) => bind('restoreOwned', { memberId: id, organizationId: ORG, token });
const restoreRelease = (id, token) => bind('restoreRelease', { memberId: id, organizationId: ORG, token });
const pathFor = (id, revision) => `enrollment-agreements/${id}/${revision}.pdf`;
function revisionInsert(id, revision, overrides = {}) {
  const values = {
    id: quote(revision), organization_id: quote(ORG), member_id: quote(id),
    subject_member_id: quote(id), subject_name: quote(memberName(id)),
    storage_path: quote(pathFor(id, revision)), sha256: quote(HASH), size_bytes: '123',
    template_version: "'2026-09-30'", uploaded_by_user_id: quote(ADMIN), uploaded_by_subject_id: quote(ADMIN), ...overrides,
  };
  return `INSERT INTO ${TABLE} (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).join(', ')});`;
}
function replace(id, revision, token, hash = HASH) {
  return bind('replace', {
    'args.memberId': id, 'actor.organizationId': ORG, token, id: revision,
    storagePath: pathFor(id, revision), 'agreementSha256(args.bytes)': hash,
    'args.bytes.byteLength': 123, 'args.templateVersion': '2026-09-30', 'actor.id': ADMIN,
  });
}
function review(id, revision, actor = ADMIN, note = null, status = 'verified') {
  return bind('review', {
    'row.memberId': id, 'actor.organizationId': ORG, status, 'actor.id': actor,
    'args.reviewNote': note, 'args.id': revision,
  });
}
const rows = (id) => JSON.parse(sql(`SELECT coalesce(json_agg(to_jsonb(s) ORDER BY id), '[]') FROM ${TABLE} s WHERE subject_member_id = ${quote(id)};`));

// A no-database preflight for hosts without psql. CI deliberately invokes this
// script without the option and must execute all real PostgreSQL assertions.
if (checkTemplatesOnly) {
  for (const statement of [acquire('m', 't'), release('m', 't'), erase('m', 't'),
    erase('m', 't', cutoff), replace('m', 'r', 't'), review('m', 'r'), purge('m'), lifecycleLock('m'), lifecycleFence('m'), retentionLock('m'),
    restoreClaim('m', 't'), restoreOwned('m', 't'), restoreRelease('m', 't')]) {
    assert.match(statement, /^PREPARE agreement_proof_\d+ \(/);
    assert.match(statement, /EXECUTE agreement_proof_\d+ \(/);
  }
  console.log('PASS all twelve canonical SQL templates extracted and fixture bindings resolved; PostgreSQL NOT run');
  process.exit(0);
}

const connections = new Set();
function connection(label) {
  const appName = `enrollment-proof-${process.pid}-${label}`;
  const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], { env: { ...env, PGAPPNAME: appName } });
  let stdout = '';
  let stderr = '';
  let finished = false;
  const done = new Promise((resolveDone, rejectDone) => {
    child.on('error', rejectDone);
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('close', (code) => {
      finished = true;
      connections.delete(child);
      resolveDone({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
  // A bounded process lifetime remains even if a proof assertion fails early.
  const timer = setTimeout(() => child.kill(), 20_000);
  done.finally(() => clearTimeout(timer)).catch(() => {});
  connections.add(child);
  child.stdin.write(preamble);
  return { appName, child, done, output: () => stdout, finished: () => finished };
}
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function until(predicate, description) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await pause(25);
  }
}
/** First claim remains uncommitted until pg_stat_activity proves second waits. */
async function blockedRace(first, second, expectedFirst, expectedSecond, label) {
  const holder = connection(`${label}-holder`);
  const contender = connection(`${label}-contender`);
  try {
    holder.child.stdin.write(`BEGIN; ${first}\nSELECT 'holder-ready';\n`);
    await until(() => holder.output().includes('holder-ready') || holder.finished(), 'first transaction to hold its lock');
    assert.equal(holder.finished(), false, 'First transaction must still be open');
    contender.child.stdin.end(second);
    await until(() => sql(`SELECT count(*) FROM pg_stat_activity WHERE datname = ${quote(database)}
      AND application_name = ${quote(contender.appName)} AND wait_event_type = 'Lock';`) === '1', 'contender to block on an actual PostgreSQL lock');
    assert.equal(contender.finished(), false, 'Contender must not finish before first commit');
    holder.child.stdin.end('COMMIT;');
    const [a, b] = await Promise.all([holder.done, contender.done]);
    assert.equal(a.code, 0, a.stderr);
    assert.equal(b.code, 0, b.stderr);
    assert.equal(a.stdout.replace(/\n?holder-ready$/, ''), expectedFirst);
    assert.equal(b.stdout, expectedSecond);
  } finally {
    for (const session of [holder, contender]) if (!session.finished()) session.child.kill();
    await Promise.allSettled([holder.done, contender.done]);
  }
}

let createdDatabase = false;
const createdRoles = [];
try {
  assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}';`, 'postgres'), '0',
    'Dedicated proof database already exists; refusing to replace it.');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}';`, 'postgres') === '0') {
      sql(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER ${role === 'service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS'};`, 'postgres');
      createdRoles.push(role);
    }
    assert.equal(sql(`SELECT rolsuper FROM pg_roles WHERE rolname = '${role}';`, 'postgres'), 'f', 'API stand-ins must not be superusers.');
    assert.equal(sql(`SELECT rolbypassrls FROM pg_roles WHERE rolname = '${role}';`, 'postgres'), role === 'service_role' ? 't' : 'f',
      'Only the service-role stand-in must bypass RLS.');
  }
  sql(`CREATE DATABASE ${database};`, 'postgres');
  createdDatabase = true;
  sql(`
    CREATE TABLE public.organizations (id text PRIMARY KEY);
    CREATE TABLE public.users (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES public.organizations(id), deleted_at timestamp, full_name text NOT NULL);
    CREATE TABLE public.audit_events (id text PRIMARY KEY, actor_user_id text REFERENCES public.users(id) ON DELETE SET NULL, actor_role text);
    INSERT INTO public.organizations VALUES (${quote(ORG)}), (${quote(OTHER_ORG)});
    INSERT INTO public.users VALUES (${quote(ADMIN)}, ${quote(ORG)}, NULL, ${quote(memberName(ADMIN))}), ('other-org-admin', ${quote(OTHER_ORG)}, NULL, 'Synthetic other-org-admin');
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id text PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, storage TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
    CREATE POLICY broad_existing_bucket_policy ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    INSERT INTO storage.objects VALUES ('protected', 'member-files', 'enrollment-agreements/synthetic/revision.pdf'),
      ('ordinary', 'member-files', 'resumes/synthetic.pdf'), ('other-bucket', 'other-bucket', 'enrollment-agreements/synthetic.pdf');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  for (const role of ['anon', 'authenticated']) assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.objects;`), '3');
  sql(preflight);
  rejects(`SET ROLE anon; ${preflight}`, 'P0001', 'read-only preflight rejects non-owner deployment authority');
  // Generic PostgreSQL accepts arbitrary custom-GUC placeholders. They are not
  // registered pg_settings parameters and must never stand in for supautils.
  const fakeGrants = JSON.stringify({ anon: ['storage.objects'] });
  assert.equal(sql(`SET ROLE anon; SET supautils.policy_grants = ${quote(fakeGrants)};
    SELECT current_setting('supautils.policy_grants');
    SELECT count(*) FROM pg_settings WHERE name = 'supautils.policy_grants';`), `${fakeGrants}\n0`,
  'a fake custom setting is readable but has no registered policy-management capability');
  for (const grants of [fakeGrants, '{"postgres":["storage.objects"]}', '{"anon":["storage.buckets"]}',
    '{"anon":"storage.objects"}', '{"anon":["storage.objects",true]}', 'not JSON']) {
    rejects(`SET ROLE anon; SET supautils.policy_grants = ${quote(grants)}; ${preflight}`, 'P0001',
      'preflight rejects unregistered policy-grant placeholders, wrong scope and malformed values');
  }
  pass('exact read-only Storage preflight accepts its owner and rejects anon, including forged policy-grant settings');
  sql(migration);
  pass('exact additive migration applies over synthetic users/orgs and an existing permissive Storage policy');

  member('immutable');
  sql(revisionInsert('immutable', 'initial'));
  rejects(revisionInsert('immutable', 'duplicate-current'), '23505', 'one current revision per member');
  const immutableBefore = rows('immutable');
  for (const change of [
    `sha256 = '${'b'.repeat(64)}'`, 'size_bytes = 124', "storage_path = 'different.pdf'",
    "template_version = 'previous'", "uploaded_at = uploaded_at + interval '1 second'",
    `organization_id = ${quote(OTHER_ORG)}`, "id = 'rewritten-id'", `uploaded_by_user_id = 'other-org-admin'`,
    "member_id = 'other-org-admin'", "subject_member_id = 'rewritten-subject'", "subject_name = 'Rewritten name'",
    "uploaded_by_subject_id = 'rewritten-uploader'",
  ]) rejects(`UPDATE ${TABLE} SET ${change} WHERE id = 'initial';`, '23514', 'immutable original evidence');
  assert.deepEqual(rows('immutable'), immutableBefore);
  rejects(revisionInsert('immutable', 'wrong-org', { organization_id: quote(OTHER_ORG) }), '23514', 'cross-org ownership');
  rejects(revisionInsert('immutable', 'wrong-subject', { subject_member_id: quote(ADMIN) }), '23514', 'historical subject must match live member');
  rejects(revisionInsert('immutable', 'wrong-name', { subject_name: "'Incorrect snapshot'" }), '23514', 'subject name must be the original account snapshot');
  rejects(revisionInsert('immutable', 'wrong-uploader', { uploaded_by_subject_id: quote('immutable') }), '23514', 'historical uploader must match live uploader');
  rejects(`DELETE FROM ${TABLE} WHERE id='initial';`, '23514', 'pending agreement must be retained');
  pass('partial-current uniqueness and immutable hash/size/path/version/ownership enforced by PostgreSQL');

  member('replacement');
  sql(revisionInsert('replacement', 'old-pending'));
  // Simulate a review tab that read the old revision before replacement.
  const staleRevision = rows('replacement')[0].id;
  assert.equal(sql(acquire('replacement', 'replace-token')), 'replace-token');
  assert.equal(sql(replace('replacement', 'new-pending', 'replace-token')), 'new-pending');
  sql(release('replacement', 'replace-token'));
  assert.equal(sql(acquire('replacement', staleRevision)), staleRevision);
  assert.equal(sql(review('replacement', staleRevision)), '', 'Stale review must update zero rows');
  sql(release('replacement', staleRevision));
  assert.deepEqual(rows('replacement').map((row) => [row.id, row.is_current, row.status]),
    [['new-pending', true, 'pending'], ['old-pending', false, 'pending']]);
  rejects(`UPDATE ${TABLE} SET is_current = true WHERE id = 'old-pending';`, '23514', 'retired revision cannot reactivate');
  assert.equal(sql(acquire('replacement', 'new-pending')), 'new-pending');
  assert.equal(sql(review('replacement', 'new-pending', 'replacement')), '', 'No self-review');
  rejects(`UPDATE ${TABLE} SET status='verified', reviewed_by_user_id='replacement', reviewed_by_subject_id='replacement', reviewed_at=now() WHERE id='new-pending';`,
    '23514', 'trigger rejects direct self-review');
  assert.equal(sql(review('replacement', 'new-pending')), 'new-pending');
  const reviewed = rows('replacement');
  assert.equal(sql(review('replacement', 'new-pending', ADMIN, 'overwrite attempt')), '', 'Second review cannot overwrite evidence');
  assert.deepEqual(rows('replacement'), reviewed);
  sql(release('replacement', 'new-pending'));
  assert.equal(sql(acquire('replacement', 'third-token')), 'third-token');
  assert.equal(sql(replace('replacement', 'third-pending', 'third-token')), 'third-pending');
  sql(release('replacement', 'third-token'));
  assert.equal(rows('replacement').find((row) => row.id === 'new-pending').status, 'verified');
  assert.equal(rows('replacement').find((row) => row.id === 'third-pending').status, 'pending');
  pass('stale/self/duplicate review CAS cannot verify a replacement; retired verified evidence survives a later upload');

  const beforeFailure = rows('replacement');
  assert.equal(sql(acquire('replacement', 'failure-token')), 'failure-token');
  rejects(replace('replacement', 'bad-hash', 'failure-token', 'invalid'), '23514', 'failed insert rolls back retirement');
  assert.deepEqual(rows('replacement'), beforeFailure);
  rejects(replace('replacement', 'initial', 'failure-token'), '23505', 'unique conflict rolls back retirement');
  assert.deepEqual(rows('replacement'), beforeFailure);
  sql(release('replacement', 'failure-token'));
  pass('constraint and unique-conflict failures atomically preserve the complete old current revision');

  member('two-uploads');
  await blockedRace(acquire('two-uploads', 'upload-winner'), acquire('two-uploads', 'upload-loser'), 'upload-winner', '', 'two-uploads');
  assert.equal(sql(`SELECT token FROM ${LOCKS} WHERE member_id='two-uploads';`), 'upload-winner');
  sql(release('two-uploads', 'upload-loser'));
  assert.equal(sql(`SELECT token FROM ${LOCKS} WHERE member_id='two-uploads';`), 'upload-winner', 'Wrong-token release cannot remove fence');
  sql(release('two-uploads', 'upload-winner'));
  assert.equal(sql(acquire('two-uploads', 'retry-token')), 'retry-token');
  sql(release('two-uploads', 'retry-token'));
  pass('concurrent upload claims block on a real lock, only one wins, and wrong-token release is harmless');

  member('upload-first');
  await blockedRace(acquire('upload-first', 'upload-first-token'), erase('upload-first', 'erase-loser'), 'upload-first-token', 't|f', 'upload-first');
  assert.equal(sql(`SELECT state || ':' || token FROM ${LOCKS} WHERE member_id='upload-first';`), 'upload:upload-first-token');
  sql(release('upload-first', 'upload-first-token'));
  assert.equal(sql(erase('upload-first', 'erase-retry')), 't|t');
  member('erase-first');
  await blockedRace(erase('erase-first', 'erase-winner'), acquire('erase-first', 'upload-after-erase'), 't|t', '', 'erase-first');
  assert.equal(sql(erase('erase-first', 'erase-second-token')), 't|t', 'Erasure is idempotent');
  sql(release('erase-first', 'erase-winner'));
  assert.equal(sql(`SELECT state || ':' || token FROM ${LOCKS} WHERE member_id='erase-first';`), 'erasure:erase-winner',
    'Neither an erasure retry nor upload release can replace/remove an erasure token');
  member('deleted-member', true);
  assert.equal(sql(acquire('deleted-member', 'denied')), '');
  assert.equal(sql(erase('deleted-member', 'deleted-erasure')), 't|t');
  assert.equal(sql(erase('nonexistent-member', 'unknown-token')), 'f|f');
  assert.equal(sql(acquire('immutable', 'wrong-organization', OTHER_ORG)), '');
  pass('upload/erasure both lock orderings fail closed; erasure retry preserves token, deleted-user cleanup remains possible');

  const expired = (id) => { member(id); sql(`UPDATE users SET deleted_at='2026-08-01' WHERE id=${quote(id)};`); };
  member('active-cutoff'); member('recent-cutoff', true); expired('expired-cutoff');
  for (const id of ['active-cutoff', 'recent-cutoff', 'missing-cutoff']) {
    assert.equal(sql(erase(id, 'ineligible-token', cutoff)), 'f|f');
    assert.equal(sql(`SELECT count(*) FROM ${LOCKS} WHERE member_id=${quote(id)};`), '0');
  }
  assert.equal(sql(erase('expired-cutoff', 'eligible-erasure', cutoff)), 't|t');
  expired('restore-before-erasure');
  await blockedRace(`UPDATE users SET deleted_at=NULL WHERE id='restore-before-erasure';`,
    erase('restore-before-erasure', 'stale-purge', cutoff), '', 'f|f', 'restore-before-erasure');
  assert.equal(sql(`SELECT count(*) FROM ${LOCKS} WHERE member_id='restore-before-erasure';`), '0');
  expired('erasure-before-restore');
  await blockedRace(erase('erasure-before-restore', 'purge-fence', cutoff),
    `BEGIN; ${lifecycleLock('erasure-before-restore')} ${lifecycleFence('erasure-before-restore')} COMMIT;`,
    't|t', 'erasure-before-restore\nt', 'erasure-before-restore');
  assert.equal(sql("SELECT deleted_at IS NOT NULL FROM users WHERE id='erasure-before-restore';"), 't');
  pass('cutoff claim rejects active/recent/missing subjects; real restore/erasure lock orderings protect the subject or expose the retained fence');

  expired('restore-fence-first');
  await blockedRace(restoreClaim('restore-fence-first', 'restore-owner'), erase('restore-fence-first', 'purge-contender', cutoff),
    'restore-owner', 't|f', 'restore-fence-first');
  assert.equal(sql(acquire('restore-fence-first', 'upload-contender')), '');
  sql(restoreRelease('restore-fence-first', 'wrong-token'));
  assert.equal(sql(restoreOwned('restore-fence-first', 'restore-owner')), 't');
  assert.equal(sql(`BEGIN; ${lifecycleLock('restore-fence-first')} ${restoreOwned('restore-fence-first', 'restore-owner')}
    UPDATE users SET deleted_at=NULL WHERE id='restore-fence-first'; ${restoreRelease('restore-fence-first', 'restore-owner')} COMMIT;`), 'restore-fence-first\nt');
  assert.equal(sql(erase('restore-fence-first', 'stale-purge-after-activation', cutoff)), 'f|f');
  expired('purge-fence-first');
  await blockedRace(erase('purge-fence-first', 'purge-owner', cutoff), restoreClaim('purge-fence-first', 'restore-contender'),
    't|t', '', 'purge-fence-first');
  expired('uncertain-restore');
  assert.equal(sql(restoreClaim('uncertain-restore', 'uncertain-owner')), 'uncertain-owner');
  // Auth/DB uncertainty must not release this fence. A later restore and a
  // purge retry both fail until an authorized reconciliation, not a TTL.
  assert.equal(sql(restoreClaim('uncertain-restore', 'unsafe-retry')), '');
  assert.equal(sql(erase('uncertain-restore', 'unsafe-purge', cutoff)), 't|f');
  assert.equal(sql(restoreOwned('uncertain-restore', 'uncertain-owner')), 't');
  pass('persistent restore fence wins/loses safely against purge, releases only its successful exact token, and protects uncertain Auth outcomes');

  expired('purge-expired');
  sql("INSERT INTO audit_events VALUES ('own-audit','purge-expired','member'), ('staff-audit','purge-expired','admin');");
  assert.equal(sql(purge('purge-expired')), '1');
  assert.equal(sql("SELECT count(*) FROM audit_events WHERE id='own-audit';"), '0');
  assert.equal(sql("SELECT actor_user_id IS NULL FROM audit_events WHERE id='staff-audit';"), 't');
  expired('restore-before-cascade');
  sql("INSERT INTO audit_events VALUES ('restored-audit','restore-before-cascade','member');");
  await blockedRace("UPDATE users SET deleted_at=NULL WHERE id='restore-before-cascade';",
    purge('restore-before-cascade'), '', '0', 'restore-before-cascade');
  assert.equal(sql("SELECT count(*) FROM audit_events WHERE id='restored-audit';"), '1');
  expired('cascade-before-restore');
  await blockedRace(purge('cascade-before-restore'),
    "UPDATE users SET deleted_at=NULL WHERE id='cascade-before-restore' RETURNING id;", '1', '', 'cascade-before-restore');
  expired('purge-held');
  sql("CREATE TABLE held_evidence (member_id text REFERENCES users(id) ON DELETE RESTRICT); INSERT INTO held_evidence VALUES ('purge-held'); INSERT INTO audit_events VALUES ('held-audit','purge-held','member');");
  rejects(purge('purge-held'), '23503', 'held account keeps its atomic audit delete rolled back');
  assert.equal(sql("SELECT count(*) FROM audit_events WHERE id='held-audit';"), '1');
  assert.equal(sql("SELECT count(*) FROM users WHERE id='purge-held';"), '1');
  await blockedRace("UPDATE users SET deleted_at=NULL WHERE id='purge-held';",
    `BEGIN; ${retentionLock('purge-held')} COMMIT;`, '', '', 'restore-before-anonymization');
  pass('atomic purge rechecks cutoff after waiting, preserves restored subjects and staff audit, and rolls back self-audit deletion on FK failure');

  member('retained-subject'); member('retained-uploader'); member('retained-reviewer');
  sql(revisionInsert('retained-subject', 'retained-1-pending', {
    uploaded_by_user_id: quote('retained-uploader'), uploaded_by_subject_id: quote('retained-uploader'),
  }));
  for (const [revision, status] of [
    ['retained-2-verified', 'verified'], ['retained-3-correction', 'needs_correction'], ['retained-4-pending', 'pending'],
  ]) {
    const token = `${revision}-upload`;
    assert.equal(sql(acquire('retained-subject', token)), token);
    assert.equal(sql(replace('retained-subject', revision, token)), revision);
    sql(release('retained-subject', token));
    if (status !== 'pending') {
      assert.equal(sql(acquire('retained-subject', revision)), revision);
      assert.equal(sql(review('retained-subject', revision, 'retained-reviewer', status === 'needs_correction' ? 'Missing signature' : null, status)), revision);
      sql(release('retained-subject', revision));
    }
  }
  const retainedBefore = rows('retained-subject');
  assert.equal(retainedBefore.length, 4);
  sql("UPDATE users SET full_name='Changed account name', deleted_at='2026-08-01' WHERE id='retained-subject';");
  assert.equal(sql(erase('retained-subject', 'retained-erasure', cutoff)), 't|t');
  assert.equal(sql(purge('retained-subject')), '1');
  assert.equal(sql("SELECT count(*) FROM users WHERE id='retained-subject';"), '0');
  assert.equal(sql(`SELECT count(*) FROM ${LOCKS} WHERE member_id='retained-subject';`), '0');
  assert.deepEqual(rows('retained-subject'), retainedBefore.map((row) => ({ ...row, member_id: null })),
    'Purge retains every original name/hash/path/review/status/revision while the live subject FK detaches');
  sql("DELETE FROM users WHERE id IN ('retained-uploader','retained-reviewer');");
  const detachedEvidence = retainedBefore.map((row) => ({ ...row, member_id: null,
    uploaded_by_user_id: row.uploaded_by_user_id === 'retained-uploader' ? null : row.uploaded_by_user_id,
    reviewed_by_user_id: null,
  }));
  assert.deepEqual(rows('retained-subject'), detachedEvidence, 'Actor deletion preserves original historical UUIDs and review evidence');
  for (const row of detachedEvidence) {
    rejects(`DELETE FROM ${TABLE} WHERE id=${quote(row.id)};`, '23514', `retain ${row.status} revision`);
    rejects(`UPDATE ${TABLE} SET member_id=${quote(ADMIN)} WHERE id=${quote(row.id)};`, '23514', 'detached subject cannot be reassigned');
  }
  for (const change of ["reviewed_by_subject_id=NULL", `reviewed_by_subject_id=${quote(ADMIN)}`,
    `reviewed_by_user_id=${quote(ADMIN)}`, "review_note='rewritten'"]) {
    rejects(`UPDATE ${TABLE} SET ${change} WHERE id='retained-2-verified';`, '23514', 'review identity and evidence cannot be rewritten after actor deletion');
  }
  rejects(`UPDATE ${TABLE} SET uploaded_by_user_id=${quote(ADMIN)} WHERE id='retained-1-pending';`, '23514', 'detached uploader cannot be reassigned');
  // Even accidental re-creation of the original UUID cannot reattach old evidence
  // or bypass historical-current uniqueness through the nullable live FK.
  member('retained-subject'); member('retained-uploader'); member('retained-reviewer');
  rejects(`UPDATE ${TABLE} SET member_id='retained-subject' WHERE id='retained-4-pending';`, '23514', 'subject cannot reattach to a recreated UUID');
  rejects(`UPDATE ${TABLE} SET uploaded_by_user_id='retained-uploader' WHERE id='retained-1-pending';`, '23514', 'uploader cannot reattach to a recreated UUID');
  rejects(`UPDATE ${TABLE} SET reviewed_by_user_id='retained-reviewer' WHERE id='retained-2-verified';`, '23514', 'reviewer cannot reattach to a recreated UUID');
  rejects(revisionInsert('retained-subject', 'duplicate-detached-current'), '23505', 'one current historical subject despite detached live FK');
  rejects(`UPDATE ${TABLE} SET status='verified', reviewed_by_user_id='retained-subject', reviewed_by_subject_id='retained-subject', reviewed_at=now()
    WHERE id='retained-4-pending';`, '23514', 'detached pending evidence cannot become a self-reviewed agreement');
  assert.deepEqual(rows('retained-subject'), detachedEvidence);
  member('explicit-detach');
  sql(revisionInsert('explicit-detach', 'explicit-detach-pending'));
  const explicitBefore = rows('explicit-detach');
  sql(`UPDATE ${TABLE} SET member_id=NULL WHERE member_id='explicit-detach';`);
  assert.deepEqual(rows('explicit-detach'), explicitBefore.map((row) => ({ ...row, member_id: null })));
  rejects(`UPDATE ${TABLE} SET member_id='explicit-detach' WHERE id='explicit-detach-pending';`, '23514', 'soft-deletion detach cannot be undone');
  rejects(`UPDATE ${TABLE} SET status='verified', reviewed_by_user_id=${quote(ADMIN)}, reviewed_by_subject_id=${quote(ADMIN)}, reviewed_at=now()
    WHERE id='explicit-detach-pending';`, '23514', 'even an active original account cannot review its detached revision');
  member('suspended-subject');
  sql(revisionInsert('suspended-subject', 'suspended-pending'));
  sql("UPDATE users SET deleted_at=now() WHERE id='suspended-subject';");
  const suspendedBefore = rows('suspended-subject');
  assert.equal(sql(review('suspended-subject', 'suspended-pending')), '', 'Canonical review excludes a suspended live subject');
  rejects(`UPDATE ${TABLE} SET status='verified', reviewed_by_user_id=${quote(ADMIN)}, reviewed_by_subject_id=${quote(ADMIN)}, reviewed_at=now()
    WHERE id='suspended-pending';`, '23514', 'trigger rejects review for a soft-deleted subject whose live FK remains');
  assert.deepEqual(rows('suspended-subject'), suspendedBefore);
  pass('all agreement revisions survive account purge and actor deletion with immutable snapshots; detach is one-way and row erasure is rejected');

  member('review-race');
  sql(revisionInsert('review-race', 'review-race-old'));
  await blockedRace(acquire('review-race', 'review-race-old'), acquire('review-race', 'replacement-contender'),
    'review-race-old', '', 'review-replace');
  assert.equal(sql(review('review-race', 'review-race-old')), 'review-race-old');
  sql(release('review-race', 'review-race-old'));
  assert.equal(sql(acquire('review-race', 'replacement-retry')), 'replacement-retry');
  assert.equal(sql(replace('review-race', 'review-race-new', 'replacement-retry')), 'review-race-new');
  sql(release('review-race', 'replacement-retry'));
  assert.deepEqual(rows('review-race').map((row) => [row.id, row.is_current, row.status]),
    [['review-race-new', true, 'pending'], ['review-race-old', false, 'verified']]);
  pass('review/upload share the same persistent serialization fence; replacement never inherits verification');

  for (const table of [TABLE, LOCKS]) {
    assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid=${quote(table)}::regclass;`), 't');
    for (const role of ['anon', 'authenticated']) {
      assert.equal(sql(`SELECT has_table_privilege('${role}', ${quote(table)}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('${role}', ${quote(table)}, 'SELECT,INSERT,UPDATE,REFERENCES');`), 'f');
      for (const command of [`SELECT * FROM ${table};`, `INSERT INTO ${table} DEFAULT VALUES;`,
        `DELETE FROM ${table};`, `TRUNCATE ${table};`]) rejects(`SET ROLE ${role}; ${command}`, '42501', 'browser table access');
      assert.equal(sql(`BEGIN; GRANT SELECT, UPDATE, DELETE ON ${table} TO ${role}; SET ROLE ${role};
        SELECT count(*) FROM ${table}; WITH removed AS (DELETE FROM ${table} RETURNING 1) SELECT count(*) FROM removed; ROLLBACK;`), '0\n0',
        'Default-deny RLS still protects rows if a table grant is mistakenly reintroduced');
    }
    assert.equal(sql(`SELECT has_table_privilege('service_role', ${quote(table)}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('service_role', ${quote(table)}, 'SELECT,INSERT,UPDATE,REFERENCES');`), 'f');
    for (const command of [`SELECT * FROM ${table};`, `INSERT INTO ${table} DEFAULT VALUES;`,
      `UPDATE ${table} SET organization_id=organization_id;`, `DELETE FROM ${table};`, `TRUNCATE ${table};`]) {
      rejects(`SET ROLE service_role; ${command}`, '42501', 'service-role Data API table access despite BYPASSRLS');
    }
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(sql(`SELECT has_function_privilege('${role}', 'public.enrollment_agreement_guard_revision()', 'EXECUTE');`), 'f');
  }
  assert.equal(sql('SET ROLE service_role; SELECT count(*) FROM storage.objects;'), '3', 'Server Storage service-role access is not revoked');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`SELECT has_function_privilege('${role}', 'public.enrollment_agreement_guard_revision()', 'EXECUTE');`), 'f');
    assert.equal(sql(`SET ROLE ${role}; SELECT string_agg(id, ',' ORDER BY id) FROM storage.objects;`), 'ordinary,other-bucket');
    assert.equal(sql(`SET ROLE ${role}; WITH changed AS (UPDATE storage.objects SET name='leaked.pdf' WHERE id='protected' RETURNING 1)
      SELECT count(*) FROM changed; WITH removed AS (DELETE FROM storage.objects WHERE id='protected' RETURNING 1) SELECT count(*) FROM removed;`), '0\n0');
    rejects(`SET ROLE ${role}; INSERT INTO storage.objects VALUES ('${role}-private', 'member-files', 'enrollment-agreements/new.pdf');`, '42501', 'protected-prefix insert');
    rejects(`SET ROLE ${role}; UPDATE storage.objects SET name='enrollment-agreements/moved.pdf' WHERE id='ordinary';`, '42501', 'rename into protected prefix');
    assert.equal(sql(`SET ROLE ${role}; INSERT INTO storage.objects VALUES ('${role}-control', 'member-files', 'resumes/control.pdf');
      UPDATE storage.objects SET name='resumes/control-renamed.pdf' WHERE id='${role}-control';
      DELETE FROM storage.objects WHERE id='${role}-control' RETURNING id;`), `${role}-control`);
  }
  assert.equal(sql("SELECT name FROM storage.objects WHERE id='protected';"), 'enrollment-agreements/synthetic/revision.pdf');
  assert.equal(sql('SELECT count(*) FROM storage.objects;'), '3');
  pass('browser table ACLs and RLS deny access; restrictive prefix policy defeats broad grants/policy without breaking ordinary files or owner access');
  console.log('Enrollment agreement PostgreSQL contract passed (hosted Supabase and authenticated preview gates remain).');
} finally {
  for (const child of connections) child.kill();
  // These exact objects are exclusively synthetic and were created above.
  if (createdDatabase) sql(`DROP DATABASE ${database};`, 'postgres');
  for (const role of createdRoles.reverse()) sql(`DROP ROLE ${role};`, 'postgres');
}
