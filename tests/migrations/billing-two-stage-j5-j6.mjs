/**
 * Isolated PostgreSQL proof for 20260927230000_billing_two_stage_j5_j6
 * (two-stage J5 quote/voucher request + J6 invoice/voucher cover letter).
 *
 * On a minimal organizations/users shape plus the real legacy
 * 20260904020000_training_billing_packets migration, with Supabase-like
 * default grants (ALL, including TRUNCATE, to anon/authenticated) it proves:
 *  - ordering: the migration sorts after every migration on disk and touches
 *    no legacy table; it applies twice without error or drift;
 *  - browser roles: every new table has RLS on and no table or column
 *    privilege for anon/authenticated (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
 *    REFERENCES/TRIGGER), while the legacy table's grants are left unchanged;
 *  - legacy compatibility: existing packet rows survive and an old-app insert
 *    into training_billing_packets still succeeds after the migration;
 *  - the contract in the schema: one $7,500.00 amount in cents, 160/200 hours,
 *    J5 is pre-voucher, J6 requires class start + signed voucher + attestation;
 *  - stage/version/recipient uniqueness and stage-qualified idempotency keys;
 *  - one delivery row per recipient, each attaching exactly the archived bytes;
 *  - J6 needs a prior quote: our sent J5 or an attested external one (never a
 *    fabricated J5); a voucher/quote conflict holds J6 for audited review;
 *  - signed records, artifacts and attestations are immutable, artifact bytes
 *    must match their SHA-256;
 *  - ambiguous sends go through reconciliation and settled sends are final;
 *  - payment is pending (expected follow-up +10..+14 days) or received with
 *    evidence, only for a sent J6;
 *  - erasure retention: deleting the member (as cleanupDeletedAccounts does)
 *    detaches member_id and keeps the whole finance archive.
 * Runs only against a dedicated disposable local database. Creates the
 * anon/authenticated stand-in roles only if absent and drops only those it
 * created (the RLS proof later in the lane requires they do not exist).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const MIGRATION_NAME = '20260927230000_billing_two_stage_j5_j6';
const LEGACY_MIGRATION = 'prisma/migrations/20260904020000_training_billing_packets/migration.sql';
// #2701: runs before this migration on master and restricts the legacy table's browser grants.
const LEGACY_GRANTS_MIGRATION_NAME = '20260927224500_restrict_legacy_training_billing_packets';
const legacyGrantsMigration = readFileSync(`prisma/migrations/${LEGACY_GRANTS_MIGRATION_NAME}/migration.sql`, 'utf8');
const migration = readFileSync(`prisma/migrations/${MIGRATION_NAME}/migration.sql`, 'utf8');
const legacyMigration = readFileSync(LEGACY_MIGRATION, 'utf8');

const NEW_TABLES = [
  'billing_cases',
  'billing_artifacts',
  'billing_attestations',
  'billing_signer_delegations',
  'billing_stage_records',
  'billing_stage_sends',
  'billing_payment_events',
  'billing_stage_recipients',
];

const sourceUrl = process.env.BILLING_TWO_STAGE_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
const proofDatabase = 'wap_billing_two_stage_proof';
assert.ok(
  [proofDatabase, 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const createsDatabase = sourceDatabase !== proofDatabase;

const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: proofDatabase,
  PGCONNECT_TIMEOUT: '5',
};

function runSql(input, database = proofDatabase, { expectFailure = false } = {}) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env,
    input: `\\set VERBOSITY sqlstate\nSET client_min_messages = warning;\n${input}`,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (expectFailure) {
    assert.notEqual(result.status, 0, `Expected the statement to fail: ${input.slice(0, 160)}`);
    return (result.stderr ?? '').trim();
  }
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${(result.stderr ?? '').trim()}`);
  return result.stdout.trim();
}
const sql = (input) => runSql(input, proofDatabase);
/** Run SQL on its own connection, resolving to { code, stderr } (for lock races). */
function sqlAsync(input) {
  return new Promise((resolve) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', proofDatabase], { env });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stderr: stderr.trim() }));
    child.stdin.end(`\\set VERBOSITY sqlstate\nSET client_min_messages = warning;\n${input}`);
  });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const rejects = (input, sqlstate, why) => {
  const stderr = runSql(input, proofDatabase, { expectFailure: true });
  assert.match(stderr, new RegExp(sqlstate), `${why}: expected SQLSTATE ${sqlstate}, got ${stderr}`);
};
const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const pass = (message) => console.log(`PASS ${message}`);

let proofDatabaseCreated = false;
const createdRoles = [];

const ORG = '00000000-0000-4000-8000-000000000001';
const MEMBER = 'member-synthetic-1';
const SIGNER = 'signer-synthetic-1';
const STAFF = 'staff-synthetic-1';

const KEY_SEGMENT = { j5_signed_pdf: 'j5', j6_signed_pdf: 'j6', board_signed_voucher: 'voucher', board_invoice: 'board-invoice', external_j5_copy: 'external-j5' };

/** INSERT for one archived object (synthetic bytes): content-addressed key in the finance bucket. */
function artifactInsert({ id, kind, source, text, caseId = 'case-1', bucket = 'billing-finance', key = null, renders = null }) {
  const bind = renders
    ? `'${renders.record}', '${kind.slice(0, 2)}', ${renders.version}, '${renders.contentSha256}'`
    : 'NULL, NULL, NULL, NULL';
  return `INSERT INTO public.billing_artifacts (id, organization_id, case_id, kind, source, file_name, mime_type, byte_length, sha256, storage_bucket, storage_key, stage_record_id, stage, stage_version, rendered_content_sha256, created_by_subject_id)
    SELECT '${id}', '${ORG}', '${caseId}', '${kind}', '${source}', '${id}.pdf', 'application/pdf', octet_length(b), h, '${bucket}',
      ${key ? `'${key}'` : `'cases/${caseId}/${KEY_SEGMENT[kind]}/' || h || '.pdf'`}, ${bind}, '${STAFF}'
    FROM (SELECT b, encode(sha256(b), 'hex') AS h FROM (SELECT convert_to('${text}', 'UTF8') AS b) y) x;`;
}

/** Freeze the recipient snapshot of a draft record (one normalized address per role). */
function recipientsInsert(record, stage, roles, { caseEmails = {} } = {}) {
  return roles
    .map((role) => `INSERT INTO public.billing_stage_recipients (stage_record_id, organization_id, stage, recipient_role, recipient_name, email)
      VALUES ('${record}', '${ORG}', '${stage}', '${role}', 'Synthetic ${role}', '${caseEmails[role] ?? `${role}@example.test`}');`)
    .join('\n');
}

const HASH = 'a'.repeat(64);

const PROGRAM = 'it-support-professional-certificate-ibm';
const CLASS = 'IT Support Professional Certificate (IBM)';

/** A stage record whose frozen content prints exactly its frozen columns. */
function stageInsert({ id, stage, version = 1, doc, caseId = 'case-1', className = CLASS, program = PROGRAM, hours = 160, start = '2026-09-30', end = '2027-02-28', amount = 750000, extra = {} }) {
  const content = JSON.stringify({ synthetic: true, totalCents: amount, training: { programSlug: program, className, contactHours: hours, classStartDate: start, classEndDate: end } });
  const cols = {
    id: `'${id}'`,
    organization_id: `'${ORG}'`,
    case_id: `'${caseId}'`,
    stage: `'${stage}'`,
    version: String(version),
    document_number: `'${doc}'`,
    content_version: '1',
    content: `'${content.replaceAll("'", "''")}'::jsonb`,
    content_sha256: `'${HASH}'`,
    amount_cents: String(amount),
    class_name: `'${className}'`,
    contact_hours: String(hours),
    class_start_date: `'${start}'`,
    class_end_date: `'${end}'`,
    created_by_subject_id: `'${STAFF}'`,
    updated_at: 'now()',
    ...extra,
  };
  return `INSERT INTO public.billing_stage_records (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')});`;
}

const set = (cols) => Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(', ');
const readinessInsert = (id, over = {}) => {
  const cols = {
    id: `'${id}'`, organization_id: `'${ORG}'`, case_id: `'case-1'`, kind: `'j5_readiness'`,
    statement: `'Synthetic: student approved/ready; counselor requested the quote'`, evidence_reference: `'synthetic referral'`,
    class_start_date: `'2026-09-30'`, student_ready_confirmed: 'true', counselor_requested_by: `'Synthetic Counselor'`,
    counselor_requested_on: `'2026-09-10'`, counselor_request_reference: `'synthetic request email #1'`, attested_by_subject_id: `'${STAFF}'`,
    ...over,
  };
  return `INSERT INTO public.billing_attestations (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')});`;
};

const SIGNED = (artifact) => ({
  signed_at: 'now()',
  signed_by_subject_id: `'${SIGNER}'`,
  signature_method: `'typed_attestation'`,
  signer_intent: `'I, Michael A. Brown, sign this document.'`,
  signed_artifact_id: `'${artifact}'`,
});

/** Claim one recipient's copy (every copy starts as `claimed`). */
function sendInsert({ id, record, stage, attempt = 1, role, status = 'claimed', key, attachments = [], email = null }) {
  const hashes = attachments.length > 0 ? `ARRAY[${attachments.map((h) => `'${h}'`).join(', ')}]` : 'ARRAY[]::TEXT[]';
  return `INSERT INTO public.billing_stage_sends (id, organization_id, stage_record_id, stage, attempt_no, recipient_role, recipient_name, email, idempotency_key, status, claim_token, claimed_at, last_claimed_at, attachment_sha256s, updated_at)
    VALUES ('${id}', '${ORG}', '${record}', '${stage}', ${attempt}, '${role}', 'Synthetic ${role}', '${email ?? `${role}@example.test`}', '${key ?? `billing-two-stage:${stage}:${record}:v1:a${attempt}:${role}`}', '${status}', 'tok-${id}', now(), now(), ${hashes}, now());`;
}
/** Provider accepted the copy: `sent` needs the provider message id and sent_at. */
const accepted = (where) => `UPDATE public.billing_stage_sends SET status = 'sent', accepted_at = now(), provider_message_id = 'synthetic-msg-' || id, updated_at = now() WHERE ${where};`;

function privilegeMatrix(role) {
  const checks = NEW_TABLES.flatMap((table) => [
    ...['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].map(
      (p) => `has_table_privilege('${role}', 'public.${table}', '${p}')`,
    ),
    ...['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'].map((p) => `has_any_column_privilege('${role}', 'public.${table}', '${p}')`),
  ]);
  return JSON.parse(sql(`SELECT json_build_array(${checks.join(', ')});`));
}

function schemaFingerprint() {
  return sql(`
    SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
      SELECT conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid) AS x
        FROM pg_constraint WHERE conrelid::regclass::text LIKE 'billing_%'
      UNION ALL
      SELECT tgrelid::regclass::text || ':' || tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'billing_%'
      UNION ALL
      SELECT indexrelid::regclass::text || ':' || pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid::regclass::text LIKE 'billing_%'
    ) s;`);
}

try {
  // ------------------------------------------------------------ ordering
  const onDisk = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  // Master order: legacy packets, #2701's legacy grant guard, then this migration
  // (Mike's finance-bucket slice #2700 at 20260927232204 may follow it).
  const mine = onDisk.indexOf(MIGRATION_NAME);
  assert.ok(mine > onDisk.indexOf('20260904020000_training_billing_packets'));
  assert.ok(mine > onDisk.indexOf(LEGACY_GRANTS_MIGRATION_NAME) && onDisk.indexOf(LEGACY_GRANTS_MIGRATION_NAME) >= 0, 'must follow #2701');
  assert.ok(onDisk.slice(mine + 1).every((name) => name > MIGRATION_NAME), 'later migrations sort strictly after this one');
  const statements = migration.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(statements, /training_billing_packet/, 'The migration must not touch the legacy packet tables.');
  assert.doesNotMatch(statements, /\b(DROP TABLE|DROP COLUMN|ALTER COLUMN|RENAME)\b/i, 'The migration must be purely additive.');
  pass('migration follows the legacy packet and #2701 legacy-grant migrations, is additive and does not reference the legacy packet table');

  if (createsDatabase) {
    assert.equal(
      runSql(`SELECT count(*) FROM pg_database WHERE datname='${proofDatabase}';`, 'postgres'),
      '0',
      'Dedicated proof database must not already exist.',
    );
    runSql(`CREATE DATABASE ${ident(proofDatabase)};`, 'postgres');
    proofDatabaseCreated = true;
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (runSql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}';`, 'postgres') === '0') {
      runSql(`CREATE ROLE ${ident(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;`, 'postgres');
      createdRoles.push(role);
    }
  }

  // Minimal preimage + Supabase-like default privileges (ALL incl. TRUNCATE).
  sql(`
    CREATE TABLE public.organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL, organization_id TEXT);
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
    INSERT INTO public.organizations VALUES ('${ORG}', 'Synthetic provider');
    INSERT INTO public.users VALUES ('${MEMBER}', 'student@example.test', '${ORG}'), ('${SIGNER}', 'signer@example.test', '${ORG}'), ('${STAFF}', 'staff@example.test', '${ORG}');
  `);
  sql(legacyMigration);
  const legacyInsert = (id, number) => `INSERT INTO public.training_billing_packets
      (id, organization_id, member_id, program_slug, packet_number, status, invoice_date, bill_to_name, line_items, total_amount, cover_letter_body, signer_name, signer_title, signed_at, signed_by_id, updated_at)
    VALUES ('${id}', '${ORG}', '${MEMBER}', 'it-support-professional-certificate-ibm', '${number}', 'signed', '2026-09-01', 'Synthetic board',
      '[{"description":"Synthetic class","hours":160,"amount":7500}]', 7500, 'Synthetic cover letter body text.', 'Synthetic signer', 'Director', now(), '${SIGNER}', now());`;
  sql(legacyInsert('legacy-1', 'WAP-2026-0001'));
  const legacyBefore = sql(`SELECT md5(row_to_json(p)::text) FROM public.training_billing_packets p WHERE id='legacy-1';`);
  assert.equal(
    sql(`SELECT has_table_privilege('anon','public.training_billing_packets','TRUNCATE')::text;`),
    'true',
    'Fixture: Supabase-like default grants reach the legacy table before #2701.',
  );
  sql(legacyGrantsMigration);
  // Whatever legacy access exists after #2701, this migration must not change it.
  const legacyAccess = () => sql(`
    SELECT md5(json_build_object(
      'acl', (SELECT relacl::text FROM pg_class WHERE oid = 'public.training_billing_packets'::regclass),
      'rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.training_billing_packets'::regclass),
      'columns', (SELECT json_agg(attacl::text ORDER BY attnum) FROM pg_attribute
                  WHERE attrelid = 'public.training_billing_packets'::regclass AND attnum > 0 AND NOT attisdropped),
      'policies', (SELECT json_agg(policyname ORDER BY policyname) FROM pg_policies WHERE tablename = 'training_billing_packets'),
      'effective', (SELECT json_agg(json_build_array(r, p, has_table_privilege(r, 'public.training_billing_packets', p)) ORDER BY r, p)
                    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
                         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p)
    )::text);`);
  const legacyGrantsBefore = legacyAccess();

  // ------------------------------------------------------------ migrate
  sql(migration);
  const fingerprint = schemaFingerprint();
  pass('migration applies on the legacy billing state');

  // ------------------------------------------------------- browser roles
  for (const role of ['anon', 'authenticated']) {
    const matrix = privilegeMatrix(role);
    assert.equal(matrix.length, NEW_TABLES.length * 11);
    assert.ok(matrix.every((v) => v === false), `${role} must hold no table or column privilege on the new tables: ${JSON.stringify(matrix)}`);
  }
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname = ANY(ARRAY['${NEW_TABLES.join("','")}']) AND relrowsecurity;`), String(NEW_TABLES.length));
  assert.equal(
    sql(`SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name = ANY(ARRAY['${NEW_TABLES.join("','")}']) AND grantee IN ('anon','authenticated','PUBLIC');`),
    '0',
    'no direct browser/PUBLIC grant is listed (informational; the effective checks above are the acceptance evidence)',
  );
  assert.equal(
    sql(`SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE c.relname = ANY(ARRAY['${NEW_TABLES.join("','")}']) AND a.grantee = 0;`),
    '0',
    'PUBLIC holds no privilege on any new table',
  );
  assert.equal(
    sql(`SELECT bool_and(has_table_privilege(current_user, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE')) FROM unnest(ARRAY['${NEW_TABLES.join("','")}']) t;`),
    't',
    'the table owner (server-side Prisma role) keeps access',
  );
  assert.equal(
    sql(`SELECT bool_or(has_function_privilege(r, p.oid, 'EXECUTE')) FROM pg_proc p, unnest(ARRAY['anon','authenticated']) r WHERE p.proname LIKE 'billing\\_%';`),
    'f',
    'Browser roles must not execute the billing trigger functions.',
  );
  assert.equal(legacyAccess(), legacyGrantsBefore, 'Legacy packet access (ACLs, column ACLs, RLS, policies, effective rights) must be unchanged by this migration.');
  pass('with Supabase-like default ALL grants (incl. TRUNCATE, and PUBLIC), anon/authenticated/PUBLIC end with no table or column rights on any new table; RLS on; owner keeps access; legacy grants unchanged');

  // ---------------------------------------------------- legacy compatibility
  assert.equal(sql(`SELECT md5(row_to_json(p)::text) FROM public.training_billing_packets p WHERE id='legacy-1';`), legacyBefore);
  sql(legacyInsert('legacy-2', 'WAP-2026-0002'));
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets;`), '2');
  pass('legacy packet rows are preserved and an old-app legacy insert still succeeds after the migration');

  // ----------------------------------------------------------- fixture
  sql(`
    INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-1', '${ORG}', '${MEMBER}', '${MEMBER}', '${PROGRAM}', '${STAFF}', now());
  `);
  rejects(
    `INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-x', '${ORG}', '${MEMBER}', 'someone-else', 'x', '${STAFF}', now());`,
    '23514',
    'member_id must equal subject_member_id',
  );
  sql(`INSERT INTO public.organizations VALUES ('org-b', 'Synthetic other tenant');
       INSERT INTO public.users VALUES ('org-b-member', 'orgb@example.test', 'org-b');`);
  rejects(
    `INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-xorg', '${ORG}', 'org-b-member', 'org-b-member', '${PROGRAM}', '${STAFF}', now());`,
    '23514',
    'an org-A case cannot name an org-B member',
  );
  pass('a billing case member must belong to the case organization');

  // --------------------------- contract hours: DB rule equals the code rule
  // Load the code rule through tsx (the app's TypeScript), not by reading its source text.
  const loaded = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "const ns = async (p) => { const m = await import(p); return m.default ?? m; };" +
    "const { PROGRAM_SYLLABI } = await ns('./shared/programSyllabi.ts'); const { expectedContractHours } = await ns('./lib/billing/twoStage/hours.ts');" +
    "console.log(JSON.stringify(Object.keys(PROGRAM_SYLLABI).map((s) => [s, expectedContractHours(s)])));"], { encoding: 'utf8' });
  assert.equal(loaded.status, 0, loaded.stderr);
  const codeHours = JSON.parse(loaded.stdout);
  assert.ok(codeHours.length >= 12);
  const dbHours = JSON.parse(sql(`SELECT json_agg(json_build_array(s, public.billing_contract_hours(s)) ORDER BY o)
    FROM unnest(ARRAY[${codeHours.map(([slug]) => `'${slug}'`).join(', ')}]) WITH ORDINALITY u(s, o);`));
  assert.deepEqual(dbHours, codeHours, 'billing_contract_hours() must equal expectedContractHours() for every approved syllabus');
  assert.deepEqual(codeHours.filter(([, h]) => h === 200).map(([slug]) => slug), ['software-developer-professional-certificate-ibm']);
  pass('DB contract hours equal the code rule for every approved syllabus (only the IBM AI & Software Developer program is 200 h)');

  // ------------------------------------- J5 readiness: two explicit facts
  rejects(readinessInsert('att-r1', { student_ready_confirmed: 'NULL' }), '23514', 'approved/ready must be recorded');
  rejects(readinessInsert('att-r2', { student_ready_confirmed: 'false' }), '23514', 'approved/ready must be true');
  rejects(readinessInsert('att-r3', { counselor_requested_by: 'NULL' }), '23514', 'who requested the quote');
  rejects(readinessInsert('att-r4', { counselor_requested_on: 'NULL' }), '23514', 'when the counselor requested it');
  rejects(readinessInsert('att-r5', { counselor_request_reference: `' '` }), '23514', 'the request reference');
  sql(readinessInsert('att-ready'));
  pass('J5 readiness records both facts separately: student approved/ready and counselor requested the quote (who, when, reference)');

  // ------------------------------------------------------ contract checks
  const j5Links = { readiness_attestation_id: `'att-ready'` };
  rejects(stageInsert({ id: 'bad-amt', stage: 'j5', doc: 'Q-bad1', amount: 750001, extra: j5Links }), '23514', 'amount must be 750000 cents');
  rejects(stageInsert({ id: 'bad-hrs', stage: 'j5', doc: 'Q-bad2', hours: 180, extra: j5Links }), '23514', 'hours must be 160 or 200');
  rejects(stageInsert({ id: 'bad-j5', stage: 'j5', doc: 'Q-bad3' }), '23514', 'J5 needs a readiness attestation');
  sql(artifactInsert({ id: 'art-upload', kind: 'board_signed_voucher', source: 'uploaded', text: '%PDF-1.7 synthetic early upload' }));
  rejects(stageInsert({ id: 'bad-j5v', stage: 'j5', doc: 'Q-bad4', extra: { ...j5Links, voucher_artifact_id: `'art-upload'` } }), '23514', 'J5 is pre-voucher');
  rejects(stageInsert({ id: 'bad-sign', stage: 'j5', doc: 'Q-bad5', extra: { ...j5Links, status: `'signed'`, signed_at: 'now()' } }), '23514', 'records start as drafts');
  rejects(stageInsert({ id: 'bad-end', stage: 'j5', doc: 'Q-bad6', end: '2027-03-01', extra: j5Links }), '23514', 'J5 end is start + 5 calendar months');
  rejects(stageInsert({ id: 'bad-prog', stage: 'j5', doc: 'Q-bad7', program: 'data-analytics-professional-certificate-google', extra: j5Links }), '23514', 'the program is the case program');
  rejects(
    stageInsert({ id: 'bad-json', stage: 'j5', doc: 'Q-bad8', extra: { ...j5Links, class_name: `'Other class'` } }),
    '23514',
    'the frozen content prints the frozen class name',
  );
  rejects(stageInsert({ id: 'bad-it200', stage: 'j5', doc: 'Q-bad9', hours: 200, extra: j5Links }), '23514', 'IT Support is 160 h, not 200');
  for (const [caseId, program, className, hours] of [
    ['case-ibm', 'software-developer-professional-certificate-ibm', 'AI and Software Developer Professional Certificate (IBM)', 160],
    ['case-aws', 'ai-practitioner-professional-certificate-aws', 'AI Practitioner Professional Certificate (AWS)', 200],
  ]) {
    sql(`INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
         VALUES ('${caseId}', '${ORG}', NULL, 'subject-${caseId}', '${program}', '${STAFF}', now());
         ${readinessInsert(`att-${caseId}`).replace("'case-1'", `'${caseId}'`)}`);
    rejects(stageInsert({ id: `bad-${caseId}`, stage: 'j5', doc: `Q-${caseId}`, caseId, program, className, hours, extra: { readiness_attestation_id: `'att-${caseId}'` } }), '23514', `${program} at ${hours} h is refused`);
    sql(stageInsert({ id: `ok-${caseId}`, stage: 'j5', doc: `Q-ok-${caseId}`, caseId, program, className, hours: hours === 160 ? 200 : 160, extra: { readiness_attestation_id: `'att-${caseId}'` } }));
  }
  pass('hours are bound to the case program in the database: IBM at 160 and AWS AI Practitioner at 200 are refused');
  sql(stageInsert({ id: 'j5-v1', stage: 'j5', doc: 'WAP-Q-2026-0001', extra: j5Links }));
  pass('J5 needs only readiness (no voucher); 750000 cents; 160/200 h; start + 5 months; case program; content equals columns; drafts only on insert');

  rejects(stageInsert({ id: 'j5-dup', stage: 'j5', version: 2, doc: 'WAP-Q-2026-0002', extra: j5Links }), '235(05|14)', 'one open J5 per case');
  const J5_HASH = 'b'.repeat(64);
  sql(`UPDATE public.billing_stage_records SET content_sha256 = '${J5_HASH}', updated_at = now() WHERE id='j5-v1';`);
  // Signed bytes are bound to the exact record version and content they render.
  sql(artifactInsert({ id: 'art-j5-stale', kind: 'j5_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic stale J5', renders: { record: 'j5-v1', version: 1, contentSha256: HASH } }));
  rejects(`UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art-j5-stale'))}, updated_at = now() WHERE id='j5-v1';`, '23514', 'a PDF rendered from other content cannot be the signed bytes');
  rejects(artifactInsert({ id: 'art-j5-v2', kind: 'j5_signed_pdf', source: 'rendered', text: 'x', renders: { record: 'j5-v1', version: 2, contentSha256: J5_HASH } }), '23503', 'a rendered PDF names a version that exists');
  rejects(artifactInsert({ id: 'art-j5-unbound', kind: 'j5_signed_pdf', source: 'rendered', text: 'x' }), '23514', 'a rendered PDF must be bound to its record');
  sql(artifactInsert({ id: 'art-j5', kind: 'j5_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J5', renders: { record: 'j5-v1', version: 1, contentSha256: J5_HASH } }));
  rejects(`UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art-j5'))}, updated_at = now() WHERE id='j5-v1';`, '23514', 'signing needs the frozen recipient snapshot');
  rejects(recipientsInsert('j5-v1', 'j5', ['finance']), '23514', 'J5 has no finance recipient');
  rejects(`INSERT INTO public.billing_stage_recipients (stage_record_id, organization_id, stage, recipient_role, recipient_name, email) VALUES ('j5-v1', '${ORG}', 'j5', 'student', 'S', ' Student@Example.test ');`, '23514', 'addresses are stored normalized');
  sql(recipientsInsert('j5-v1', 'j5', ['counselor', 'student']));
  // Race: B signs and holds its transaction; A edits a recipient meanwhile. A must
  // wait for B (parent row lock) and then fail, so a frozen address never changes.
  const signer = sqlAsync(`BEGIN; UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art-j5'))}, updated_at = now() WHERE id='j5-v1'; SELECT pg_sleep(1.5); COMMIT;`);
  await pause(400);
  const editor = sqlAsync(`UPDATE public.billing_stage_recipients SET email = 'student2@example.test' WHERE stage_record_id='j5-v1' AND recipient_role='student';`);
  const [signed, edited] = await Promise.all([signer, editor]);
  assert.equal(signed.code, 0, signed.stderr);
  assert.notEqual(edited.code, 0, 'the concurrent recipient edit must fail after the sign commits');
  assert.match(edited.stderr, /23514/);
  assert.equal(sql(`SELECT status || '|' || (SELECT email FROM public.billing_stage_recipients WHERE stage_record_id='j5-v1' AND recipient_role='student') FROM public.billing_stage_records WHERE id='j5-v1';`), 'signed|student@example.test');
  rejects(`UPDATE public.billing_stage_recipients SET email = 'other@example.test' WHERE stage_record_id='j5-v1' AND recipient_role='student';`, '23514', 'recipients are frozen once signed');
  rejects(recipientsInsert('j5-v1', 'j5', ['finance']), '23514', 'no recipient can be added after signing');
  rejects(`UPDATE public.billing_stage_records SET content_sha256 = '${HASH}' WHERE id='j5-v1';`, '23514', 'signed content is frozen');
  rejects(`UPDATE public.billing_stage_records SET signed_by_subject_id = 'someone-else' WHERE id='j5-v1';`, '23514', 'signature is frozen');
  rejects(`UPDATE public.billing_stage_records SET status = 'draft' WHERE id='j5-v1';`, '23514', 'no un-signing');
  rejects(`DELETE FROM public.billing_stage_records WHERE id='j5-v1';`, '23514', 'signed records are never deleted');
  pass('signed bytes must be rendered from this exact record version and content; signing needs the frozen 2-recipient snapshot; a concurrent recipient edit is serialized behind the sign and refused; signed records are frozen');

  rejects(`UPDATE public.billing_artifacts SET file_name = 'renamed.pdf' WHERE id='art-j5';`, '23514', 'artifacts are append-only');
  rejects(`DELETE FROM public.billing_artifacts WHERE id='art-j5';`, '23514', 'artifacts are never deleted');
  rejects(artifactInsert({ id: 'art-member', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', bucket: 'member-files' }), '23514', 'never a member bucket');
  rejects(artifactInsert({ id: 'art-prefix', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', key: `cert-files/${MEMBER}/voucher.pdf` }), '23514', 'never a member-owned prefix');
  rejects(artifactInsert({ id: 'art-hash', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', key: `cases/case-1/voucher/${HASH}.pdf` }), '23514', 'the key is addressed by the object sha256');
  rejects(artifactInsert({ id: 'art-kind', kind: 'j5_signed_pdf', source: 'uploaded', text: 'x', renders: { record: 'j5-v1', version: 1, contentSha256: J5_HASH } }), '23514', 'signed PDFs are rendered, never uploaded');
  rejects(`UPDATE public.billing_attestations SET evidence_reference = 'changed' WHERE id='att-ready';`, '23514', 'attestations are append-only');
  pass('artifacts live only under content-addressed keys in the private finance bucket (no member bucket/prefix); artifacts and attestations are append-only');

  // --------------------------- J5 sends: per-recipient rows, exact bytes
  const j5Hash = sql(`SELECT sha256 FROM public.billing_artifacts WHERE id='art-j5';`);
  rejects(sendInsert({ id: 's-j5-wrong', record: 'j5-v1', stage: 'j5', role: 'student', attachments: [HASH] }), '23514', 'a copy must attach the archived signed bytes');
  rejects(sendInsert({ id: 's-j5-direct', record: 'j5-v1', stage: 'j5', role: 'student', status: 'sent', attachments: [j5Hash] }), '23514', 'a copy starts as claimed');
  rejects(sendInsert({ id: 's-j5-addr', record: 'j5-v1', stage: 'j5', role: 'student', attachments: [j5Hash], email: 'attacker@example.test' }), '23503', 'a copy goes only to the frozen address for its role');
  rejects(sendInsert({ id: 's-j5-swap', record: 'j5-v1', stage: 'j5', role: 'student', attachments: [j5Hash], email: 'counselor@example.test' }), '23503', 'a role cannot use another role\'s address');
  sql(sendInsert({ id: 's-j5-student', record: 'j5-v1', stage: 'j5', role: 'student', attachments: [j5Hash] }));
  rejects(`UPDATE public.billing_stage_sends SET status = 'sent', accepted_at = now() WHERE id = 's-j5-student';`, '23514', 'sent requires the provider message id');
  sql(accepted(`id = 's-j5-student'`));
  const markJ5Sent = `UPDATE public.billing_stage_records SET status='sent', sent_at = now(), send_receipt = '{"synthetic":"j5 receipt"}'::jsonb, updated_at = now() WHERE id='j5-v1';`;
  rejects(markJ5Sent, '23514', 'J5 is not sent while the counselor copy is missing');
  sql(sendInsert({ id: 's-j5-counselor', record: 'j5-v1', stage: 'j5', role: 'counselor', attachments: [j5Hash] }));
  rejects(`UPDATE public.billing_stage_sends SET status = 'reconciled_delivered', reconciled_by_subject_id = '${STAFF}', reconciled_at = now(), reconcile_note = 'x' WHERE id='s-j5-counselor';`, '23514', 'a claimed copy cannot be reconciled directly');
  sql(`UPDATE public.billing_stage_sends SET status = 'ambiguous', last_error = 'synthetic timeout', updated_at = now() WHERE id='s-j5-counselor';`);
  rejects(markJ5Sent, '23514', 'an ambiguous copy keeps J5 not-sent');
  rejects(sendInsert({ id: 's-j5-dup', record: 'j5-v1', stage: 'j5', role: 'student', key: 'other-key', attachments: [j5Hash] }), '23505', 'one claim per record/stage/attempt/role');
  rejects(sendInsert({ id: 's-j5-fin', record: 'j5-v1', stage: 'j5', role: 'finance', attachments: [j5Hash] }), '235(03|14)', 'J5 has no finance recipient');
  rejects(sendInsert({ id: 's-j5-as-j6', record: 'j5-v1', stage: 'j6', role: 'finance', attachments: [j5Hash] }), '23503', 'a send row stage must equal its record stage');
  assert.equal(
    sql(`SELECT bool_and(s.attachment_sha256s = ARRAY[a.sha256::text] AND a.storage_key LIKE '%/' || s.attachment_sha256s[1] || '.pdf')
         FROM public.billing_stage_sends s JOIN public.billing_stage_records r ON r.id = s.stage_record_id
         JOIN public.billing_artifacts a ON a.id = r.signed_artifact_id WHERE s.stage_record_id = 'j5-v1';`),
    't',
  );
  pass('J5 copies: one claimed row per frozen recipient address (wrong or swapped address refused), sent needs a provider id, archived bytes attached; missing or ambiguous copies keep it not-sent');

  // ------------------------------------------------- reconciliation
  rejects(`UPDATE public.billing_stage_sends SET status = 'claimed' WHERE id='s-j5-student';`, '23514', 'a sent copy is final');
  sql(`UPDATE public.billing_stage_sends SET status = 'needs_reconciliation', updated_at = now() WHERE id='s-j5-counselor';`);
  rejects(`UPDATE public.billing_stage_sends SET status = 'reconciled_delivered' WHERE id='s-j5-counselor';`, '23514', 'reconciliation needs who, when and a note');
  sql(`UPDATE public.billing_stage_sends SET status = 'reconciled_delivered', reconciled_by_subject_id = '${STAFF}', reconciled_at = now(), reconcile_note = 'Synthetic provider log shows delivery', reconcile_evidence_artifact_id = 'art-upload', updated_at = now() WHERE id='s-j5-counselor';`);
  rejects(`UPDATE public.billing_stage_sends SET status = 'needs_reconciliation' WHERE id='s-j5-counselor';`, '23514', 'a reconciled copy is final');
  rejects(`UPDATE public.billing_stage_sends SET email = 'other@example.test' WHERE id='s-j5-student';`, '23514', 'send identity is immutable');
  rejects(`DELETE FROM public.billing_stage_sends WHERE id='s-j5-student';`, '23514', 'send rows are never deleted');
  sql(markJ5Sent);
  pass('manual reconciliation is a separate audited path (only from ambiguous/needs_reconciliation, who/when/note, optional evidence file); settled copies are final; J5 is sent only once both copies are delivered');

  // ---------------------------------------- J6 prerequisites and linkage
  sql(`
    ${artifactInsert({ id: 'art-voucher', kind: 'board_signed_voucher', source: 'uploaded', text: '%PDF-1.7 synthetic board-signed voucher' })}
    ${artifactInsert({ id: 'art-invoice', kind: 'board_invoice', source: 'uploaded', text: '%PDF-1.7 synthetic board invoice' })}
    ${artifactInsert({ id: 'art-evidence', kind: 'board_invoice', source: 'uploaded', text: '%PDF-1.7 synthetic exception evidence' })}
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
      VALUES ('att-start', '${ORG}', 'case-1', 'class_started', 'Synthetic class started', 'synthetic attendance', '2026-09-20', '2027-02-20', '${STAFF}');
  `);
  const voucherAttestation = (id, signaturePresent, { receivedOn = `'2026-10-02'`, amount = 700000, program = `'${PROGRAM}'`, className = `'${CLASS}'`, start = `'2026-09-01'`, end = `'2027-03-31'` } = {}) => `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, authorized_program_slug, authorized_class_name, authorized_start_date, authorized_end_date, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('${id}', '${ORG}', 'case-1', 'voucher_board_signed', 'Synthetic voucher is board-signed and receipt-signed', 'synthetic board email', 'art-voucher', 'PO-SYN-1', ${amount}, ${program}, ${className}, ${start}, ${end}, ${receivedOn}, ${signaturePresent}, '${STAFF}');`;
  rejects(voucherAttestation('att-v-nosig', 'NULL'), '23514', 'the receiving-signature attestation is required');
  rejects(voucherAttestation('att-v-falsesig', 'false'), '23514', 'an unsigned (not receipt-signed) voucher cannot be attested');
  rejects(voucherAttestation('att-v-nodate', 'true', { receivedOn: 'NULL' }), '23514', 'the received date is required');
  rejects(voucherAttestation('att-v-noamt', 'true', { amount: 'NULL' }), '23514', 'the authorized amount is required');
  rejects(voucherAttestation('att-v-noprog', 'true', { program: 'NULL' }), '23514', 'the authorized program is required');
  rejects(voucherAttestation('att-v-nocls', 'true', { className: `' '` }), '23514', 'the authorized class is required');
  rejects(voucherAttestation('att-v-noper', 'true', { end: 'NULL' }), '23514', 'the authorized period is required');
  sql(voucherAttestation('att-voucher', 'true'));
  const uploaded = Buffer.from('%PDF-1.7 synthetic board-signed voucher', 'utf8');
  assert.equal(
    sql(`SELECT sha256 || ':' || byte_length || ':' || created_by_subject_id FROM public.billing_artifacts WHERE id='art-voucher';`),
    `${createHash('sha256').update(uploaded).digest('hex')}:${uploaded.byteLength}:${STAFF}`,
    'the archived voucher record is the uploaded bytes, untransformed, with its uploader',
  );
  const j6Dates = { start: '2026-09-20', end: '2027-02-20' };
  const j6Links = { class_start_attestation_id: `'att-start'`, voucher_artifact_id: `'art-voucher'`, voucher_attestation_id: `'att-voucher'`, prior_j5_source: `'system'`, prior_j5_record_id: `'j5-v1'` };
  const held = (reasons) => ({ review_required: 'true', review_reasons: `ARRAY[${reasons.map((r) => `'${r}'`).join(', ')}]` });
  rejects(stageInsert({ id: 'j6-bad1', stage: 'j6', doc: 'WAP-I-bad1', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), voucher_artifact_id: 'NULL' } }), '23514', 'J6 needs the signed voucher');
  rejects(stageInsert({ id: 'j6-bad2', stage: 'j6', doc: 'WAP-I-bad2', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), class_start_attestation_id: 'NULL' } }), '23514', 'J6 needs the class-start attestation');
  rejects(stageInsert({ id: 'j6-bad3', stage: 'j6', doc: 'WAP-I-bad3', ...j6Dates, extra: { ...j6Links, voucher_attestation_id: 'NULL' } }), '23514', 'J6 needs the voucher attestation');
  rejects(stageInsert({ id: 'j6-bad4', stage: 'j6', doc: 'WAP-I-bad4', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), prior_j5_record_id: 'NULL' } }), '23514', 'a system prior J5 names our J5 record');
  rejects(stageInsert({ id: 'j6-bad5', stage: 'j6', doc: 'WAP-I-bad5', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), prior_j5_source: 'NULL', prior_j5_record_id: 'NULL' } }), '23514', 'without a prior quote the J6 is held');
  rejects(stageInsert({ id: 'j6-bad6', stage: 'j6', doc: 'WAP-I-bad6', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), voucher_artifact_id: `'art-invoice'` } }), '23514', 'the voucher link must be the board-signed voucher');
  rejects(stageInsert({ id: 'j6-bad7', stage: 'j6', doc: 'WAP-I-bad7', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), voucher_attestation_id: `'att-start'` } }), '23514', 'the voucher attestation must be a voucher attestation');
  rejects(stageInsert({ id: 'j6-bad8', stage: 'j6', doc: 'WAP-I-bad8', start: '2026-09-30', end: '2027-02-28', extra: { ...j6Links, ...held(['voucher_amount_differs']) } }), '23514', 'J6 prints the attested actual dates, not the J5 estimate');
  sql(`INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-2', '${ORG}', NULL, 'other-member', '${PROGRAM}', '${STAFF}', now());`);
  rejects(stageInsert({ id: 'j6-cross', stage: 'j6', doc: 'WAP-I-bad9', caseId: 'case-2', ...j6Dates, extra: { ...j6Links, prior_j5_record_id: 'NULL', prior_j5_source: `'external'`, external_j5_attestation_id: `'att-start'` } }), '235(03|14)', 'J6 cannot use another case\'s voucher or attestations');
  pass('J6 requires class start (printing its attested dates), the receipt-signed board voucher and its attestation from the same case, and a prior quote; board invoice optional');

  // --------------------- (1) money mismatch is derived and never note-clearable
  // The voucher authorizes 700000 cents, not 750000.
  rejects(stageInsert({ id: 'j6-flag', stage: 'j6', doc: 'WAP-I-2026-0001', ...j6Dates, extra: j6Links }), '23514', 'review_required=false is refused when the voucher amount differs');
  rejects(stageInsert({ id: 'j6-flag2', stage: 'j6', doc: 'WAP-I-2026-0001', ...j6Dates, extra: { ...j6Links, ...held(['voucher_period_conflict']) } }), '23514', 'the reasons must be the derived ones');
  // (2) class identity: a different 160h class than the J5 quoted (and the voucher authorized) is a blocking hold.
  sql(stageInsert({ id: 'j6-cls', stage: 'j6', doc: 'WAP-I-2026-0001', className: 'Data Analytics Professional Certificate (Google)', ...j6Dates,
    extra: { ...j6Links, ...held(['voucher_amount_differs', 'voucher_class_differs', 'class_differs_from_quote']) } }));
  sql(recipientsInsert('j6-cls', 'j6', ['finance', 'counselor', 'student']));
  sql(artifactInsert({ id: 'art-j6-cls', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6 v1', renders: { record: 'j6-cls', version: 1, contentSha256: HASH } }));
  sql(`UPDATE public.billing_stage_records SET ${set({ review_cleared_at: 'now()', review_cleared_by_subject_id: `'${STAFF}'`, review_note: `'Synthetic: looks fine'` })}, updated_at = now() WHERE id='j6-cls';`);
  rejects(`UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art-j6-cls'))} WHERE id='j6-cls';`, '23514', 'a class mismatch blocks signing whatever the review says');
  sql(`UPDATE public.billing_stage_records SET status='voided', voided_at = now(), closed_by_subject_id = '${STAFF}', close_reason = 'Synthetic: wrong class', updated_at = now() WHERE id='j6-cls';`);
  pass('J6 review reasons are derived by the database; a program/class mismatch against the quote or voucher (two 160h classes) blocks signing even with a cleared review');

  // --------------------- (3) supersede lineage stays in one case and stage
  assert.match(
    sql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'billing_stage_records_supersedes_record_id_case_id_stage_fkey';`),
    /FOREIGN KEY \(supersedes_record_id, case_id, stage\) REFERENCES billing_stage_records\(id, case_id, stage\)/,
  );
  sql(`
    ${artifactInsert({ id: 'art2-voucher', kind: 'board_signed_voucher', source: 'uploaded', text: '%PDF-1.7 synthetic voucher 2', caseId: 'case-2' })}
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, external_reference, external_quote_date, quoted_program_slug, quoted_class_name, attested_by_subject_id)
      VALUES ('att2-ext', '${ORG}', 'case-2', 'external_j5_reference', 'Synthetic manual quote', 'synthetic sent-mail record', NULL, 'MANUAL-Q-17', '2026-08-01', '${PROGRAM}', '${CLASS}', '${STAFF}');
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
      VALUES ('att2-start', '${ORG}', 'case-2', 'class_started', 'Synthetic class started', 'synthetic attendance', '2026-09-01', '2027-02-01', '${STAFF}');
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, authorized_program_slug, authorized_class_name, authorized_start_date, authorized_end_date, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('att2-voucher', '${ORG}', 'case-2', 'voucher_board_signed', 'Synthetic voucher is board-signed', 'synthetic board email', 'art2-voucher', 'PO-SYN-2', 750000, '${PROGRAM}', '${CLASS}', '2026-09-01', '2027-02-01', '2026-08-25', true, '${STAFF}');
  `);
  const case2Links = { class_start_attestation_id: `'att2-start'`, voucher_artifact_id: `'art2-voucher'`, voucher_attestation_id: `'att2-voucher'`, prior_j5_source: `'external'`, external_j5_attestation_id: `'att2-ext'` };
  const case2Dates = { caseId: 'case-2', start: '2026-09-01', end: '2027-02-01' };
  rejects(stageInsert({ id: 'x-student', stage: 'j6', version: 2, doc: 'WAP-I-x1', ...case2Dates, extra: { ...case2Links, supersedes_record_id: `'j6-cls'` } }), '235(03|14)', 'a record cannot supersede another student\'s record');
  rejects(stageInsert({ id: 'x-stage', stage: 'j6', version: 2, doc: 'WAP-I-x2', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), supersedes_record_id: `'j5-v1'` } }), '235(03|14)', 'a J6 cannot supersede a J5');
  rejects(stageInsert({ id: 'x-version', stage: 'j6', version: 3, doc: 'WAP-I-x3', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), supersedes_record_id: `'j6-cls'` } }), '23514', 'a correction is exactly the next version');
  rejects(stageInsert({ id: 'x-orphan', stage: 'j6', version: 2, doc: 'WAP-I-x4', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']) } }), '23514', 'version 2 must name what it supersedes');
  sql(stageInsert({ id: 'j6-v2', stage: 'j6', version: 2, doc: 'WAP-I-2026-0002', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), supersedes_record_id: `'j6-cls'`, board_invoice_artifact_id: `'art-invoice'` } }));
  rejects(stageInsert({ id: 'x-second', stage: 'j6', version: 2, doc: 'WAP-I-x5', ...j6Dates, extra: { ...j6Links, ...held(['voucher_amount_differs']), supersedes_record_id: `'j6-cls'` } }), '23505', 'one successor per record');
  pass('supersede links use a composite (id, case, stage) FK: cross-student and cross-stage links, skipped versions and second successors are refused');

  // ------------- (1 cont.) no review note ever clears a money hold; there is no exception path
  sql(recipientsInsert('j6-v2', 'j6', ['finance', 'counselor', 'student']));
  sql(artifactInsert({ id: 'art-j6', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6', renders: { record: 'j6-v2', version: 2, contentSha256: HASH } }));
  const signJ6 = (id, artifact = 'art-j6') => `UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED(artifact))}, updated_at = now() WHERE id='${id}';`;
  rejects(signJ6('j6-v2'), '23514', 'a held J6 cannot be signed');
  sql(`UPDATE public.billing_stage_records SET ${set({ review_cleared_at: 'now()', review_cleared_by_subject_id: `'${STAFF}'`, review_note: `'Synthetic: board says $7,000 is fine'` })}, updated_at = now() WHERE id='j6-v2';`);
  rejects(signJ6('j6-v2'), '23514', 'a $7,000 voucher cannot be signed with any review note');
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname = 'billing_amount_exceptions';`), '0', 'there is no amount-exception bypass');
  // Corrected authorization: a new voucher attestation for $7,500.00 clears the money reason.
  sql(voucherAttestation('att-voucher-fix', 'true', { amount: 750000 }));
  rejects(`UPDATE public.billing_stage_records SET voucher_attestation_id = 'att-voucher-fix', updated_at = now() WHERE id='j6-v2';`, '23514', 'the stale reasons no longer match the corrected voucher');
  sql(`UPDATE public.billing_stage_records SET ${set({ voucher_attestation_id: `'att-voucher-fix'`, review_required: 'false', review_reasons: 'ARRAY[]::TEXT[]', review_cleared_at: 'NULL', review_cleared_by_subject_id: 'NULL', review_note: 'NULL' })}, updated_at = now() WHERE id='j6-v2';`);
  rejects(signJ6('j6-v2', 'art-j6-cls'), '23514', 'version 2 cannot reuse version 1\'s signed PDF');
  // Race, other order: A renames a recipient and holds; B's sign waits, then signs the committed snapshot.
  const renamer = sqlAsync(`BEGIN; UPDATE public.billing_stage_recipients SET recipient_name = 'Synthetic finance (confirmed)' WHERE stage_record_id='j6-v2' AND recipient_role='finance'; SELECT pg_sleep(1.5); COMMIT;`);
  await pause(400);
  const signing = sqlAsync(signJ6('j6-v2'));
  const [renamed, j6Signed] = await Promise.all([renamer, signing]);
  assert.equal(renamed.code, 0, renamed.stderr);
  assert.equal(j6Signed.code, 0, j6Signed.stderr);
  assert.equal(sql(`SELECT r.status || '|' || p.recipient_name FROM public.billing_stage_records r JOIN public.billing_stage_recipients p ON p.stage_record_id = r.id AND p.recipient_role = 'finance' WHERE r.id='j6-v2';`), 'signed|Synthetic finance (confirmed)');
  rejects(`UPDATE public.billing_stage_records SET review_note = 'rewritten' WHERE id='j6-v2';`, '23514', 'the signed record is frozen');
  pass('a voucher amount mismatch has no bypass (no review note, no exception table); a corrected $7,500.00 voucher attestation makes the J6 signable; v2 cannot reuse v1\'s PDF; a sign waits for an in-flight recipient edit');

  // External prior quote: J6 allowed on a case with no system J5; class compared to the quote.
  rejects(
    `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, external_reference, external_quote_date, attested_by_subject_id)
      VALUES ('att2-ext-bad', '${ORG}', 'case-2', 'external_j5_reference', 'Synthetic', 'synthetic', 'MANUAL-Q-18', '2026-08-01', '${STAFF}');`,
    '23514',
    'an external quote names the program and class it quoted',
  );
  sql(`INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, external_reference, external_quote_date, quoted_program_slug, quoted_class_name, attested_by_subject_id)
      VALUES ('att2-ext-other', '${ORG}', 'case-2', 'external_j5_reference', 'Synthetic manual quote', 'synthetic', 'MANUAL-Q-19', '2026-08-01', 'data-analytics-professional-certificate-google', 'Data Analytics Professional Certificate (Google)', '${STAFF}');`);
  rejects(stageInsert({ id: 'j6-ext-other', stage: 'j6', doc: 'WAP-I-2026-0006', ...case2Dates, extra: { ...case2Links, external_j5_attestation_id: `'att2-ext-other'` } }), '23514', 'an external quote for another class is a class mismatch');
  // (1b) the voucher itself must authorize this program and class.
  sql(`INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, authorized_program_slug, authorized_class_name, authorized_start_date, authorized_end_date, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('att2-voucher-cls', '${ORG}', 'case-2', 'voucher_board_signed', 'Synthetic voucher for another class', 'synthetic board email', 'art2-voucher', 'PO-SYN-3', 750000, 'data-analytics-professional-certificate-google', 'Data Analytics Professional Certificate (Google)', '2026-09-01', '2027-02-01', '2026-08-25', true, '${STAFF}');`);
  const vclsLinks = { ...case2Links, voucher_attestation_id: `'att2-voucher-cls'` };
  rejects(stageInsert({ id: 'j6-vcls', stage: 'j6', doc: 'WAP-I-2026-0003', ...case2Dates, extra: vclsLinks }), '23514', 'the database derives the voucher class mismatch');
  sql(stageInsert({ id: 'j6-vcls', stage: 'j6', doc: 'WAP-I-2026-0003', ...case2Dates, extra: { ...vclsLinks, ...held(['voucher_class_differs']) } }));
  sql(recipientsInsert('j6-vcls', 'j6', ['finance', 'counselor', 'student']));
  sql(artifactInsert({ id: 'art2-j6-vcls', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6 vcls', caseId: 'case-2', renders: { record: 'j6-vcls', version: 1, contentSha256: HASH } }));
  sql(`UPDATE public.billing_stage_records SET ${set({ review_cleared_at: 'now()', review_cleared_by_subject_id: `'${STAFF}'`, review_note: `'Synthetic: close enough'` })}, updated_at = now() WHERE id='j6-vcls';`);
  rejects(`UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art2-j6-vcls'))} WHERE id='j6-vcls';`, '23514', 'a voucher for another class blocks signing whatever the review says');
  sql(`UPDATE public.billing_stage_records SET status='voided', voided_at = now(), closed_by_subject_id = '${STAFF}', close_reason = 'Synthetic: voucher names another class', updated_at = now() WHERE id='j6-vcls';`);
  pass('a board voucher authorizing another program/class is a derived blocking hold that no review clears');
  sql(stageInsert({ id: 'j6-ext', stage: 'j6', version: 2, doc: 'WAP-I-2026-0005', ...case2Dates, extra: { ...case2Links, supersedes_record_id: `'j6-vcls'` } }));
  assert.equal(sql(`SELECT count(*) FROM public.billing_stage_records WHERE case_id='case-2' AND stage='j5';`), '0');
  pass('an attested external (manual) quote naming the same program/class lets J6 proceed without fabricating a system J5');

  // (c) a J6 whose class has not started (America/Chicago) cannot be signed.
  sql(`UPDATE public.billing_stage_records SET status='voided', voided_at = now(), closed_by_subject_id = '${STAFF}', close_reason = 'Synthetic', updated_at = now() WHERE id='j6-ext';
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
      VALUES ('att2-future', '${ORG}', 'case-2', 'class_started', 'Synthetic (wrongly) started', 'synthetic', '2099-01-15', '2099-06-15', '${STAFF}');
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, authorized_program_slug, authorized_class_name, authorized_start_date, authorized_end_date, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('att2-voucher-future', '${ORG}', 'case-2', 'voucher_board_signed', 'Synthetic voucher', 'synthetic', 'art2-voucher', 'PO-SYN-4', 750000, '${PROGRAM}', '${CLASS}', '2099-01-01', '2099-12-31', '2026-08-25', true, '${STAFF}');`);
  sql(stageInsert({ id: 'j6-future', stage: 'j6', version: 3, doc: 'WAP-I-2026-0007', caseId: 'case-2', start: '2099-01-15', end: '2099-06-15',
    extra: { ...case2Links, class_start_attestation_id: `'att2-future'`, voucher_attestation_id: `'att2-voucher-future'`, supersedes_record_id: `'j6-ext'` } }));
  sql(recipientsInsert('j6-future', 'j6', ['finance', 'counselor', 'student']));
  sql(artifactInsert({ id: 'art2-j6-future', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6 future', caseId: 'case-2', renders: { record: 'j6-future', version: 3, contentSha256: HASH } }));
  rejects(`UPDATE public.billing_stage_records SET status='signed', ${set(SIGNED('art2-j6-future'))} WHERE id='j6-future';`, '23514', 'a J6 cannot be signed before its class starts');
  pass('a J6 whose class start is after today (America/Chicago) cannot be signed');

  // --------------------------- J6 sends: three recipients, exact bytes
  const j6Hashes = sql(`SELECT string_agg(sha256, ',' ORDER BY ord) FROM (VALUES ('art-j6', 1), ('art-voucher', 2), ('art-invoice', 3)) v(id, ord) JOIN public.billing_artifacts a USING (id);`).split(',');
  rejects(sendInsert({ id: 's-j6-noinv', record: 'j6-v2', stage: 'j6', role: 'finance', attachments: j6Hashes.slice(0, 2) }), '23514', 'the board invoice on the record is attached');
  rejects(sendInsert({ id: 's-j6-order', record: 'j6-v2', stage: 'j6', role: 'finance', attachments: [j6Hashes[1], j6Hashes[0], j6Hashes[2]] }), '23514', 'cover letter, then voucher, then invoice');
  rejects(sendInsert({ id: 's-j6-badfin', record: 'j6-v2', stage: 'j6', role: 'finance', attachments: j6Hashes, email: 'finance-typo@example.test' }), '23503', 'finance gets only its frozen address');
  for (const role of ['student', 'counselor', 'finance']) sql(sendInsert({ id: `s-j6-${role}`, record: 'j6-v2', stage: 'j6', role, attachments: j6Hashes, key: `billing-two-stage:j6:j6-v2:v2:a1:${role}` }));
  rejects(sendInsert({ id: 's-j6-key', record: 'j6-v2', stage: 'j6', attempt: 2, role: 'student', key: 'billing-two-stage:j5:j5-v1:v1:a1:student', attachments: j6Hashes }), '23505', 'idempotency keys are globally unique');
  assert.equal(sql(`SELECT count(DISTINCT idempotency_key) FROM public.billing_stage_sends;`), '5');
  assert.equal(sql(`SELECT count(DISTINCT email) FROM public.billing_stage_sends WHERE stage_record_id='j6-v2';`), '3');
  const markJ6Sent = `UPDATE public.billing_stage_records SET status='sent', sent_at = '2026-10-01 15:00', send_receipt = '{"synthetic":true}'::jsonb, updated_at = now() WHERE id='j6-v2';`;
  rejects(markJ6Sent, '23514', 'J6 is not sent while copies are only claimed');
  sql(accepted(`stage_record_id = 'j6-v2' AND recipient_role IN ('student', 'counselor')`));
  rejects(markJ6Sent, '23514', 'J6 is not sent until finance also has its copy');
  sql(`UPDATE public.billing_stage_sends SET status = 'rejected_definite', last_error = 'synthetic 422', updated_at = now() WHERE id = 's-j6-finance';`);
  // Attempt 2 delivers finance only: attempt 1 (student, counselor) + attempt 2 (finance) do not add up.
  sql(sendInsert({ id: 's-j6-finance-a2', record: 'j6-v2', stage: 'j6', attempt: 2, role: 'finance', attachments: j6Hashes, key: 'billing-two-stage:j6:j6-v2:v2:a2:finance' }));
  sql(accepted(`id = 's-j6-finance-a2'`));
  rejects(markJ6Sent, '23514', 'deliveries spread across attempts do not complete a stage');
  for (const role of ['student', 'counselor']) {
    sql(sendInsert({ id: `s-j6-${role}-a2`, record: 'j6-v2', stage: 'j6', attempt: 2, role, attachments: j6Hashes, key: `billing-two-stage:j6:j6-v2:v2:a2:${role}` }));
    sql(accepted(`id = 's-j6-${role}-a2'`));
  }
  pass('J6 copies go to finance, counselor and student as separate rows with the cover letter + exact voucher (+ invoice) bytes; J6 is sent only when ONE attempt delivered all three (mixed attempts refused)');

  // --------------------------------------------------------- payment
  const pending = (id, record) => `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('${id}', '${ORG}', 'case-1', '${record}', 'pending', '2026-10-11', '2026-10-15', '${STAFF}');`;
  rejects(pending('pay-early', 'j6-v2'), '23514', 'payment is tracked only for a sent J6');
  rejects(pending('pay-j5', 'j5-v1'), '23514', 'payment is never tracked on a J5');
  sql(markJ6Sent);
  rejects(`UPDATE public.billing_stage_records SET send_receipt = '{"rewritten":true}'::jsonb WHERE id='j6-v2';`, '23514', 'the send receipt is frozen once written');
  // Delivery evidence is separate from acceptance: a later bounce is recorded once and never unsends the stage.
  rejects(`UPDATE public.billing_stage_sends SET delivery_status = 'bounced', delivery_evidence_at = now(), delivery_evidence_source = 'synthetic webhook' WHERE id = 's-j6-finance';`, '23514', 'a rejected copy has no delivery evidence');
  rejects(`UPDATE public.billing_stage_sends SET delivery_status = 'bounced', delivery_evidence_at = now() WHERE id = 's-j6-student-a2';`, '23514', 'delivery evidence names its source');
  sql(`UPDATE public.billing_stage_sends SET delivery_status = 'bounced', delivery_evidence_at = now(), delivery_evidence_source = 'synthetic provider webhook', updated_at = now() WHERE id = 's-j6-student-a2';`);
  sql(`UPDATE public.billing_stage_sends SET delivery_status = 'delivered', delivery_evidence_at = now(), delivery_evidence_source = 'synthetic provider webhook', updated_at = now() WHERE id = 's-j6-finance-a2';`);
  rejects(`UPDATE public.billing_stage_sends SET delivery_status = 'delivered' WHERE id = 's-j6-student-a2';`, '23514', 'delivery evidence is recorded once');
  rejects(`UPDATE public.billing_stage_sends SET provider_message_id = 'other' WHERE id = 's-j6-finance-a2';`, '23514', 'acceptance evidence is final');
  assert.equal(sql(`SELECT status FROM public.billing_stage_records WHERE id='j6-v2';`), 'sent', 'a bounce after acceptance does not unsend the stage');
  pass('provider acceptance gates sent; later delivered/bounced evidence is recorded once with time and source and never unsends the stage');
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('pay-wide', '${ORG}', 'case-1', 'j6-v2', 'pending', '2026-10-11', '2026-10-31', '${STAFF}');`,
    '23514',
    'the expected follow-up window is exactly +10..+14 days',
  );
  sql(pending('pay-pending', 'j6-v2'));
  // Regression: the sent J6 is superseded by a corrected cover letter before the payment arrives.
  sql(`UPDATE public.billing_stage_records SET status='superseded', superseded_at = now(), closed_by_subject_id = '${STAFF}', close_reason = 'Synthetic corrected cover', updated_at = now() WHERE id='j6-v2';`);
  // Period and contract-end holds: review notes never clear them; corrected evidence does.
  sql(`${voucherAttestation('att-voucher-late', 'true', { amount: 750000, start: `'2026-09-25'` })}
       INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
         VALUES ('att-start-long', '${ORG}', 'case-1', 'class_started', 'Synthetic long class', 'synthetic attendance', '2026-09-20', '2027-03-10', '${STAFF}');`);
  sql(stageInsert({ id: 'j6-v3', stage: 'j6', version: 3, doc: 'WAP-I-2026-0004', ...j6Dates, extra: { ...j6Links, voucher_attestation_id: `'att-voucher-late'`, supersedes_record_id: `'j6-v2'`, ...held(['voucher_period_conflict']) } }));
  sql(recipientsInsert('j6-v3', 'j6', ['finance', 'counselor', 'student']));
  sql(artifactInsert({ id: 'art-j6-v3', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6 v3', renders: { record: 'j6-v3', version: 3, contentSha256: HASH } }));
  const clearReview = `UPDATE public.billing_stage_records SET ${set({ review_cleared_at: 'now()', review_cleared_by_subject_id: `'${STAFF}'`, review_note: `'Synthetic: board OK by phone'` })}, updated_at = now() WHERE id='j6-v3';`;
  sql(clearReview);
  rejects(signJ6('j6-v3', 'art-j6-v3'), '23514', 'a voucher-period conflict is never cleared by a review note');
  sql(`UPDATE public.billing_stage_records SET ${set({ class_start_attestation_id: `'att-start-long'`, class_end_date: `'2027-03-10'`, voucher_attestation_id: `'att-voucher-fix'`, review_reasons: `ARRAY['end_date_not_contract']`,
    content: `'${JSON.stringify({ synthetic: true, totalCents: 750000, training: { programSlug: PROGRAM, className: CLASS, contactHours: 160, classStartDate: '2026-09-20', classEndDate: '2027-03-10' } })}'::jsonb` })}, updated_at = now() WHERE id='j6-v3';`);
  rejects(signJ6('j6-v3', 'art-j6-v3'), '23514', 'an end date that is not start + 5 months is never cleared by a review note');
  // Corrected class evidence and voucher: both holds disappear.
  sql(`UPDATE public.billing_stage_records SET ${set({ class_start_attestation_id: `'att-start'`, class_end_date: `'2027-02-20'`, review_required: 'false', review_reasons: 'ARRAY[]::TEXT[]', review_cleared_at: 'NULL', review_cleared_by_subject_id: 'NULL', review_note: 'NULL',
    content: `'${JSON.stringify({ synthetic: true, totalCents: 750000, training: { programSlug: PROGRAM, className: CLASS, contactHours: 160, classStartDate: '2026-09-20', classEndDate: '2027-02-20' } })}'::jsonb` })}, updated_at = now() WHERE id='j6-v3';`);
  pass('voucher-period and contract-end holds are hard: a cleared review never unlocks signing; corrected voucher/class evidence clears them');
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, received_on, recorded_by_subject_id)
      VALUES ('pay-noev', '${ORG}', 'case-1', 'j6-v2', 'received', '2026-10-12', '${STAFF}');`,
    '23514',
    'received needs evidence',
  );
  sql(`INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, received_on, evidence, recorded_by_subject_id)
      VALUES ('pay-received', '${ORG}', 'case-1', 'j6-v2', 'received', '2026-10-12', 'Synthetic remittance advice #1', '${STAFF}');`);
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, received_on, evidence, recorded_by_subject_id)
      VALUES ('pay-v3', '${ORG}', 'case-1', 'j6-v3', 'received', '2026-10-12', 'Synthetic remittance', '${STAFF}');`,
    '23514',
    'payment against a never-sent J6 is refused',
  );
  rejects(`UPDATE public.billing_payment_events SET evidence = 'edited' WHERE id='pay-received';`, '23514', 'payment events are append-only');
  pass('payment: only for a J6 proven sent (sent_at + delivered finance/counselor/student copies), still reconcilable after it is superseded; never for an unsent J6; received needs evidence; append-only');

  // ------------------------------------------------- member merge repoint
  sql(`
    INSERT INTO public.users VALUES ('dup-member', 'dup@example.test', '${ORG}'), ('survivor', 'survivor@example.test', '${ORG}'), ('other-org-user', 'o@example.test', 'org-b');
    INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-3', '${ORG}', 'dup-member', 'dup-member', '${PROGRAM}', '${STAFF}', now());
  `);
  rejects(`UPDATE public.billing_cases SET member_id = 'survivor' WHERE id='case-3';`, '23514', 'an arbitrary repoint without a recorded merge is refused');
  rejects(`BEGIN; SELECT set_config('app.billing_member_merge', 'dup-member>${STAFF}', true); UPDATE public.billing_cases SET member_id = 'survivor' WHERE id='case-3'; COMMIT;`, '23514', 'the merge pair must match');
  rejects(`BEGIN; SELECT set_config('app.billing_member_merge', 'dup-member>other-org-user', true); UPDATE public.billing_cases SET member_id = 'other-org-user' WHERE id='case-3'; COMMIT;`, '23514', 'the survivor must be in the same organization');
  rejects(`UPDATE public.billing_cases SET member_merged_from_id = 'forged', member_merged_at = now() WHERE id='case-3'; SELECT CASE WHEN member_merged_from_id IS NULL THEN 1/0 END FROM public.billing_cases WHERE id='case-3';`, '22012', 'the merge audit columns cannot be written by hand');
  sql(`BEGIN; SELECT set_config('app.billing_member_merge', 'dup-member>survivor', true); UPDATE public.billing_cases SET member_id = 'survivor', updated_at = now() WHERE member_id = 'dup-member'; COMMIT;`);
  assert.equal(
    sql(`SELECT member_id || '|' || subject_member_id || '|' || member_merged_from_id || '|' || (member_merged_at IS NOT NULL)::text FROM public.billing_cases WHERE id='case-3';`),
    'survivor|dup-member|dup-member|true',
  );
  rejects(`INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, member_merged_from_id, member_merged_at, created_by_subject_id, updated_at)
      VALUES ('case-4', '${ORG}', 'survivor', 'dup-member', '${PROGRAM}', 'dup-member', now(), '${STAFF}', now());`, '23514', 'a new case cannot claim a merge');
  pass('a recorded member merge repoints member_id to the survivor with audit; subject_member_id keeps the original subject; any other repoint is refused');

  // ------------------------------------------------- erasure retention
  const archiveBefore = sql(`SELECT json_build_array(
      (SELECT count(*) FROM public.billing_stage_records WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_artifacts WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_attestations WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_stage_sends),
      (SELECT count(*) FROM public.billing_payment_events),
      (SELECT string_agg(sha256, ',' ORDER BY id) FROM public.billing_artifacts))::text;`);
  // cleanupDeletedAccounts (lib/retention/cleanup.ts) purges with users.deleteMany.
  sql(`DELETE FROM public.users WHERE id='${MEMBER}';`);
  assert.equal(sql(`SELECT coalesce(member_id, 'NULL') || '|' || subject_member_id FROM public.billing_cases WHERE id='case-1';`), `NULL|${MEMBER}`);
  assert.equal(sql(`SELECT json_build_array(
      (SELECT count(*) FROM public.billing_stage_records WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_artifacts WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_attestations WHERE case_id='case-1'),
      (SELECT count(*) FROM public.billing_stage_sends),
      (SELECT count(*) FROM public.billing_payment_events),
      (SELECT string_agg(sha256, ',' ORDER BY id) FROM public.billing_artifacts))::text;`), archiveBefore);
  rejects(`UPDATE public.billing_cases SET member_id = '${STAFF}' WHERE id='case-1';`, '23514', 'a detached case cannot be re-pointed at another account');
  pass('purging the member detaches member_id, keeps subject_member_id and the whole finance archive');

  // ------------------------------------------------------- re-run
  const recordCount = sql(`SELECT count(*) FROM public.billing_stage_records;`);
  sql(migration);
  assert.equal(schemaFingerprint(), fingerprint, 'Re-applying must not change constraints, triggers or indexes.');
  for (const role of ['anon', 'authenticated']) assert.ok(privilegeMatrix(role).every((v) => v === false));
  assert.equal(legacyAccess(), legacyGrantsBefore, 'a re-run leaves legacy access unchanged');
  assert.equal(sql(`SELECT count(*) FROM public.billing_stage_records;`), recordCount);
  pass('the migration is idempotent: a second apply keeps schema, grants and rows');
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
  for (const role of createdRoles) {
    runSql(`DROP ROLE IF EXISTS ${ident(role)};`, 'postgres');
  }
}
