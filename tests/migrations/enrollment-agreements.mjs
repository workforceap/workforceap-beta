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
  // Do not inherit service/options/hostaddr overrides that could redirect psql.
  PGSERVICE: '', PGSERVICEFILE: '', PGHOSTADDR: '', PGOPTIONS: '',
};
const preamble = '\\set VERBOSITY sqlstate\nSET client_min_messages = warning; SET statement_timeout = \'15s\'; SET lock_timeout = \'10s\';\n';
const migration = readFileSync(resolve(root,
  'prisma/migrations/20261001200042_enrollment_agreement_submissions/migration.sql'), 'utf8');
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
const member = (id, deleted = false) => sql(`INSERT INTO public.users VALUES (${quote(id)}, ${quote(ORG)}, ${deleted ? 'now()' : 'NULL'});`);
const acquire = (id, token, organization = ORG) => bind('acquire', { memberId: id, 'actor.organizationId': organization, token });
const release = (id, token) => bind('release', { memberId: id, 'actor.organizationId': ORG, token });
const erase = (id, token) => bind('erase', { memberId: id, token });
const pathFor = (id, revision) => `enrollment-agreements/${id}/${revision}.pdf`;
function revisionInsert(id, revision, overrides = {}) {
  const values = {
    id: quote(revision), organization_id: quote(ORG), member_id: quote(id),
    storage_path: quote(pathFor(id, revision)), sha256: quote(HASH), size_bytes: '123',
    template_version: "'2026-09-30'", uploaded_by_user_id: quote(ADMIN), ...overrides,
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
function review(id, revision, actor = ADMIN, note = null) {
  return bind('review', {
    'row.memberId': id, 'actor.organizationId': ORG, status: 'verified', 'actor.id': actor,
    'args.reviewNote': note, 'args.id': revision,
  });
}
const rows = (id) => JSON.parse(sql(`SELECT coalesce(json_agg(to_jsonb(s) ORDER BY id), '[]') FROM ${TABLE} s WHERE member_id = ${quote(id)};`));

// A no-database preflight for hosts without psql. CI deliberately invokes this
// script without the option and must execute all real PostgreSQL assertions.
if (checkTemplatesOnly) {
  for (const statement of [acquire('m', 't'), release('m', 't'), erase('m', 't'),
    replace('m', 'r', 't'), review('m', 'r')]) {
    assert.match(statement, /^PREPARE agreement_proof_\d+ \(/);
    assert.match(statement, /EXECUTE agreement_proof_\d+ \(/);
  }
  console.log('PASS all five canonical SQL templates extracted and fixture bindings resolved; PostgreSQL NOT run');
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
  for (const role of ['anon', 'authenticated']) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}';`, 'postgres') === '0') {
      sql(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS;`, 'postgres');
      createdRoles.push(role);
    }
    assert.equal(sql(`SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = '${role}';`, 'postgres'), 'f',
      'Browser stand-ins must not bypass RLS.');
  }
  sql(`CREATE DATABASE ${database};`, 'postgres');
  createdDatabase = true;
  sql(`
    CREATE TABLE public.organizations (id text PRIMARY KEY);
    CREATE TABLE public.users (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES public.organizations(id), deleted_at timestamp);
    INSERT INTO public.organizations VALUES (${quote(ORG)}), (${quote(OTHER_ORG)});
    INSERT INTO public.users VALUES (${quote(ADMIN)}, ${quote(ORG)}, NULL), ('other-org-admin', ${quote(OTHER_ORG)}, NULL);
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id text PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, storage TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    CREATE POLICY broad_existing_bucket_policy ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    INSERT INTO storage.objects VALUES ('protected', 'member-files', 'enrollment-agreements/synthetic/revision.pdf'),
      ('ordinary', 'member-files', 'resumes/synthetic.pdf'), ('other-bucket', 'other-bucket', 'enrollment-agreements/synthetic.pdf');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, anon, authenticated;
  `);
  for (const role of ['anon', 'authenticated']) assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.objects;`), '3');
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
  ]) rejects(`UPDATE ${TABLE} SET ${change} WHERE id = 'initial';`, '23514', 'immutable original evidence');
  assert.deepEqual(rows('immutable'), immutableBefore);
  rejects(revisionInsert('immutable', 'wrong-org', { organization_id: quote(OTHER_ORG) }), '23514', 'cross-org ownership');
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
  rejects(`UPDATE ${TABLE} SET status='verified', reviewed_by_user_id='replacement', reviewed_at=now() WHERE id='new-pending';`,
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
  }
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
