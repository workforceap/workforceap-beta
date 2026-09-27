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
import { spawnSync } from 'node:child_process';

const MIGRATION_NAME = '20260927230000_billing_two_stage_j5_j6';
const LEGACY_MIGRATION = 'prisma/migrations/20260904020000_training_billing_packets/migration.sql';
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
function artifactInsert({ id, kind, source, text, caseId = 'case-1', bucket = 'billing-finance', key = null }) {
  return `INSERT INTO public.billing_artifacts (id, organization_id, case_id, kind, source, file_name, mime_type, byte_length, sha256, storage_bucket, storage_key, created_by_subject_id)
    SELECT '${id}', '${ORG}', '${caseId}', '${kind}', '${source}', '${id}.pdf', 'application/pdf', octet_length(b), h, '${bucket}',
      ${key ? `'${key}'` : `'cases/${caseId}/${KEY_SEGMENT[kind]}/' || h || '.pdf'`}, '${STAFF}'
    FROM (SELECT b, encode(sha256(b), 'hex') AS h FROM (SELECT convert_to('${text}', 'UTF8') AS b) y) x;`;
}

const HASH = 'a'.repeat(64);

function stageInsert({ id, stage, version = 1, status = 'draft', doc, extra = {}, caseId = 'case-1' }) {
  const cols = {
    id: `'${id}'`,
    organization_id: `'${ORG}'`,
    case_id: `'${caseId}'`,
    stage: `'${stage}'`,
    version: String(version),
    status: `'${status}'`,
    document_number: `'${doc}'`,
    content_version: '1',
    content: `'{"synthetic":true}'::jsonb`,
    content_sha256: `'${HASH}'`,
    amount_cents: '750000',
    contact_hours: '160',
    class_start_date: `'2026-09-30'`,
    class_end_date: `'2027-02-28'`,
    created_by_subject_id: `'${STAFF}'`,
    updated_at: 'now()',
    ...extra,
  };
  return `INSERT INTO public.billing_stage_records (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')});`;
}

const SIGNED = (artifact) => ({
  signed_at: 'now()',
  signed_by_subject_id: `'${SIGNER}'`,
  signature_method: `'typed_attestation'`,
  signer_intent: `'I, Michael A. Brown, sign this document.'`,
  signed_artifact_id: `'${artifact}'`,
});

function sendInsert({ id, record, stage, attempt = 1, role, status = 'claimed', key, attachments = [] }) {
  const sentAt = status === 'sent' ? 'now()' : 'NULL';
  const hashes = attachments.length > 0 ? `ARRAY[${attachments.map((h) => `'${h}'`).join(', ')}]` : 'ARRAY[]::TEXT[]';
  return `INSERT INTO public.billing_stage_sends (id, organization_id, stage_record_id, stage, attempt_no, recipient_role, recipient_name, email, idempotency_key, status, claim_token, claimed_at, last_claimed_at, sent_at, attachment_sha256s, updated_at)
    VALUES ('${id}', '${ORG}', '${record}', '${stage}', ${attempt}, '${role}', 'Synthetic ${role}', '${role}@example.test', '${key ?? `billing-two-stage:${stage}:${record}:v1:a${attempt}:${role}`}', '${status}', 'tok-${id}', now(), now(), ${sentAt}, ${hashes}, now());`;
}

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
  assert.equal(onDisk.at(-1), MIGRATION_NAME, 'The two-stage migration must sort after every migration on disk.');
  assert.ok(onDisk.indexOf('20260904020000_training_billing_packets') < onDisk.indexOf(MIGRATION_NAME));
  const statements = migration.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(statements, /training_billing_packet/, 'The migration must not touch the legacy packet tables.');
  assert.doesNotMatch(statements, /\b(DROP TABLE|DROP COLUMN|ALTER COLUMN|RENAME)\b/i, 'The migration must be purely additive.');
  pass('migration sorts last, is additive and does not reference the legacy packet table');

  if (createsDatabase) {
    assert.equal(
      runSql(`SELECT count(*) FROM pg_database WHERE datname='${proofDatabase}';`, 'postgres'),
      '0',
      'Dedicated proof database must not already exist.',
    );
    runSql(`CREATE DATABASE ${ident(proofDatabase)};`, 'postgres');
    proofDatabaseCreated = true;
  }
  for (const role of ['anon', 'authenticated']) {
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
  const legacyGrantsBefore = sql(`SELECT has_table_privilege('anon','public.training_billing_packets','TRUNCATE')::text || has_table_privilege('authenticated','public.training_billing_packets','SELECT')::text;`);
  assert.equal(legacyGrantsBefore, 'truetrue', 'Fixture: default grants must reach a table created before the migration.');

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
  assert.equal(
    sql(`SELECT has_table_privilege('anon','public.training_billing_packets','TRUNCATE')::text || has_table_privilege('authenticated','public.training_billing_packets','SELECT')::text;`),
    legacyGrantsBefore,
    'Legacy packet grants are out of scope for this migration and must be unchanged.',
  );
  pass('with Supabase-like default ALL grants (incl. TRUNCATE, and PUBLIC), anon/authenticated/PUBLIC end with no table or column rights on any new table; RLS on; owner keeps access; legacy grants unchanged');

  // ---------------------------------------------------- legacy compatibility
  assert.equal(sql(`SELECT md5(row_to_json(p)::text) FROM public.training_billing_packets p WHERE id='legacy-1';`), legacyBefore);
  sql(legacyInsert('legacy-2', 'WAP-2026-0002'));
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets;`), '2');
  pass('legacy packet rows are preserved and an old-app legacy insert still succeeds after the migration');

  // ----------------------------------------------------------- fixture
  sql(`
    INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-1', '${ORG}', '${MEMBER}', '${MEMBER}', 'it-support-professional-certificate-ibm', '${STAFF}', now());
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, attested_by_subject_id)
      VALUES ('att-ready', '${ORG}', 'case-1', 'j5_readiness', 'Synthetic readiness statement', 'synthetic referral', '2026-09-30', '${STAFF}');
    ${artifactInsert({ id: 'art-j5', kind: 'j5_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J5' })}
  `);
  rejects(
    `INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-x', '${ORG}', '${MEMBER}', 'someone-else', 'x', '${STAFF}', now());`,
    '23514',
    'member_id must equal subject_member_id',
  );

  // ------------------------------------------------------ contract checks
  rejects(stageInsert({ id: 'bad-amt', stage: 'j5', doc: 'Q-bad1', extra: { amount_cents: '750001', readiness_attestation_id: `'att-ready'` } }), '23514', 'amount must be 750000 cents');
  rejects(stageInsert({ id: 'bad-hrs', stage: 'j5', doc: 'Q-bad2', extra: { contact_hours: '180', readiness_attestation_id: `'att-ready'` } }), '23514', 'hours must be 160 or 200');
  rejects(stageInsert({ id: 'bad-j5', stage: 'j5', doc: 'Q-bad3' }), '23514', 'J5 needs a readiness attestation');
  rejects(
    stageInsert({ id: 'bad-j5v', stage: 'j5', doc: 'Q-bad4', extra: { readiness_attestation_id: `'att-ready'`, voucher_artifact_id: `'art-j5'` } }),
    '23514',
    'J5 is pre-voucher',
  );
  rejects(
    stageInsert({ id: 'bad-sign', stage: 'j5', status: 'signed', doc: 'Q-bad5', extra: { readiness_attestation_id: `'att-ready'`, signed_at: 'now()' } }),
    '23514',
    'signed needs signer, method, intent and signed bytes',
  );
  sql(stageInsert({ id: 'j5-v1', stage: 'j5', doc: 'WAP-Q-2026-0001', extra: { readiness_attestation_id: `'att-ready'` } }));
  pass('J5 needs only a readiness attestation (no voucher); amount is fixed at 750000 cents; hours 160/200; signing needs full signature fields');

  rejects(stageInsert({ id: 'j5-dup', stage: 'j5', version: 2, doc: 'WAP-Q-2026-0002', extra: { readiness_attestation_id: `'att-ready'` } }), '23505', 'one open J5 per case');
  sql(`UPDATE public.billing_stage_records SET content = '{"synthetic":"edited draft"}'::jsonb, updated_at = now() WHERE id='j5-v1';`);
  sql(`UPDATE public.billing_stage_records SET status='signed', ${Object.entries(SIGNED('art-j5')).map(([k, v]) => `${k}=${v}`).join(', ')}, updated_at = now() WHERE id='j5-v1';`);
  rejects(`UPDATE public.billing_stage_records SET content = '{"tampered":true}'::jsonb WHERE id='j5-v1';`, '23514', 'signed content is frozen');
  rejects(`UPDATE public.billing_stage_records SET signed_by_subject_id = 'someone-else' WHERE id='j5-v1';`, '23514', 'signature is frozen');
  rejects(`UPDATE public.billing_stage_records SET status = 'draft' WHERE id='j5-v1';`, '23514', 'no un-signing');
  rejects(`DELETE FROM public.billing_stage_records WHERE id='j5-v1';`, '23514', 'signed records are never deleted');
  pass('drafts are editable; signed stage records are frozen, cannot return to draft and cannot be deleted');

  rejects(`UPDATE public.billing_artifacts SET file_name = 'renamed.pdf' WHERE id='art-j5';`, '23514', 'artifacts are append-only');
  rejects(`DELETE FROM public.billing_artifacts WHERE id='art-j5';`, '23514', 'artifacts are never deleted');
  rejects(artifactInsert({ id: 'art-member', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', bucket: 'member-files' }), '23514', 'never a member bucket');
  rejects(
    artifactInsert({ id: 'art-prefix', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', key: `cert-files/${MEMBER}/voucher.pdf` }),
    '23514',
    'never a member-owned prefix',
  );
  rejects(
    artifactInsert({ id: 'art-hash', kind: 'board_signed_voucher', source: 'uploaded', text: 'x', key: `cases/case-1/voucher/${HASH}.pdf` }),
    '23514',
    'the key is addressed by the object sha256',
  );
  rejects(artifactInsert({ id: 'art-kind', kind: 'j5_signed_pdf', source: 'uploaded', text: 'x' }), '23514', 'signed PDFs are rendered, never uploaded');
  rejects(`UPDATE public.billing_attestations SET evidence_reference = 'changed' WHERE id='att-ready';`, '23514', 'attestations are append-only');
  pass('artifacts live only under content-addressed keys in the private finance bucket (no member bucket/prefix); artifacts and attestations are append-only');

  // --------------------------- J5 sends: per-recipient rows, exact bytes
  const j5Hash = sql(`SELECT sha256 FROM public.billing_artifacts WHERE id='art-j5';`);
  rejects(sendInsert({ id: 's-j5-wrong', record: 'j5-v1', stage: 'j5', role: 'student', attachments: [HASH] }), '23514', 'a copy must attach the archived signed bytes');
  sql(sendInsert({ id: 's-j5-student', record: 'j5-v1', stage: 'j5', role: 'student', status: 'sent', attachments: [j5Hash] }));
  sql(sendInsert({ id: 's-j5-counselor', record: 'j5-v1', stage: 'j5', role: 'counselor', status: 'ambiguous', attachments: [j5Hash] }));
  rejects(sendInsert({ id: 's-j5-dup', record: 'j5-v1', stage: 'j5', role: 'student', key: 'other-key', attachments: [j5Hash] }), '23505', 'one claim per record/stage/attempt/role');
  rejects(sendInsert({ id: 's-j5-fin', record: 'j5-v1', stage: 'j5', role: 'finance', attachments: [j5Hash] }), '23514', 'J5 has no finance recipient');
  rejects(sendInsert({ id: 's-j5-as-j6', record: 'j5-v1', stage: 'j6', role: 'finance', attachments: [j5Hash] }), '23503', 'a send row stage must equal its record stage');
  assert.equal(
    sql(`SELECT bool_and(s.attachment_sha256s = ARRAY[a.sha256::text] AND a.storage_key LIKE '%/' || s.attachment_sha256s[1] || '.pdf')
         FROM public.billing_stage_sends s JOIN public.billing_stage_records r ON r.id = s.stage_record_id
         JOIN public.billing_artifacts a ON a.id = r.signed_artifact_id WHERE s.stage_record_id = 'j5-v1';`),
    't',
  );
  pass('J5 copies are one row per recipient (student/counselor only), unique per (record, stage, attempt, role), and attach exactly the archived signed bytes');

  // ------------------------------------------------- reconciliation
  rejects(`UPDATE public.billing_stage_sends SET status = 'claimed' WHERE id='s-j5-student';`, '23514', 'a sent copy is final');
  sql(`UPDATE public.billing_stage_sends SET status = 'needs_reconciliation', updated_at = now() WHERE id='s-j5-counselor';`);
  rejects(`UPDATE public.billing_stage_sends SET status = 'reconciled_delivered' WHERE id='s-j5-counselor';`, '23514', 'reconciliation needs who, when and a note');
  sql(`UPDATE public.billing_stage_sends SET status = 'reconciled_delivered', reconciled_by_subject_id = '${STAFF}', reconciled_at = now(), reconcile_note = 'Synthetic provider log shows delivery', updated_at = now() WHERE id='s-j5-counselor';`);
  rejects(`UPDATE public.billing_stage_sends SET status = 'needs_reconciliation' WHERE id='s-j5-counselor';`, '23514', 'a reconciled copy is final');
  rejects(`UPDATE public.billing_stage_sends SET email = 'other@example.test' WHERE id='s-j5-student';`, '23514', 'send identity is immutable');
  rejects(`DELETE FROM public.billing_stage_sends WHERE id='s-j5-student';`, '23514', 'send rows are never deleted');
  sql(`UPDATE public.billing_stage_records SET status='sent', sent_at = now(), send_receipt = '{"synthetic":"j5 receipt"}'::jsonb, updated_at = now() WHERE id='j5-v1';`);
  pass('an ambiguous copy moves to reconciliation, needs who/when/note to settle, and settled copies are final');

  // ---------------------------------------- J6 prerequisites and linkage
  sql(`
    ${artifactInsert({ id: 'art-voucher', kind: 'board_signed_voucher', source: 'uploaded', text: '%PDF-1.7 synthetic board-signed voucher' })}
    ${artifactInsert({ id: 'art-invoice', kind: 'board_invoice', source: 'uploaded', text: '%PDF-1.7 synthetic board invoice' })}
    ${artifactInsert({ id: 'art-j6', kind: 'j6_signed_pdf', source: 'rendered', text: '%PDF-1.7 synthetic J6' })}
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
      VALUES ('att-start', '${ORG}', 'case-1', 'class_started', 'Synthetic class started', 'synthetic attendance', '2026-10-05', '2027-03-05', '${STAFF}');
  `);
  rejects(
    `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, authorized_amount_cents, attested_by_subject_id)
      VALUES ('att-v-bad', '${ORG}', 'case-1', 'voucher_board_signed', 'Synthetic', 'synthetic board email', 'art-voucher', 750000, '${STAFF}');`,
    '23514',
    'voucher attestation needs the voucher reference',
  );
  rejects(
    `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, attested_by_subject_id)
      VALUES ('att-v-bad2', '${ORG}', 'case-1', 'voucher_board_signed', 'Synthetic', 'synthetic board email', 'art-voucher', 'PO-SYN-1', '${STAFF}');`,
    '23514',
    'voucher attestation records the authorized amount',
  );
  const voucherAttestation = (id, signaturePresent, receivedOn = `'2026-10-02'`) => `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('${id}', '${ORG}', 'case-1', 'voucher_board_signed', 'Synthetic voucher is board-signed and receipt-signed', 'synthetic board email', 'art-voucher', 'PO-SYN-1', 700000, ${receivedOn}, ${signaturePresent}, '${STAFF}');`;
  rejects(voucherAttestation('att-v-nosig', 'NULL'), '23514', 'the receiving-signature attestation is required');
  rejects(voucherAttestation('att-v-falsesig', 'false'), '23514', 'an unsigned (not receipt-signed) voucher cannot be attested');
  rejects(voucherAttestation('att-v-nodate', 'true', 'NULL'), '23514', 'the received date is required');
  sql(voucherAttestation('att-voucher', 'true'));
  const uploaded = Buffer.from('%PDF-1.7 synthetic board-signed voucher', 'utf8');
  assert.equal(
    sql(`SELECT sha256 || ':' || byte_length || ':' || created_by_subject_id FROM public.billing_artifacts WHERE id='art-voucher';`),
    `${createHash('sha256').update(uploaded).digest('hex')}:${uploaded.byteLength}:${STAFF}`,
    'the archived voucher record is the uploaded bytes, untransformed, with its uploader',
  );
  const j6Links = { class_start_attestation_id: `'att-start'`, voucher_artifact_id: `'art-voucher'`, voucher_attestation_id: `'att-voucher'`, prior_j5_source: `'system'`, prior_j5_record_id: `'j5-v1'`, class_start_date: `'2026-10-05'`, class_end_date: `'2027-03-05'` };
  rejects(stageInsert({ id: 'j6-bad1', stage: 'j6', doc: 'WAP-I-bad1', extra: { ...j6Links, voucher_artifact_id: 'NULL' } }), '23514', 'J6 needs the signed voucher');
  rejects(stageInsert({ id: 'j6-bad2', stage: 'j6', doc: 'WAP-I-bad2', extra: { ...j6Links, class_start_attestation_id: 'NULL' } }), '23514', 'J6 needs the class-start attestation');
  rejects(stageInsert({ id: 'j6-bad3', stage: 'j6', doc: 'WAP-I-bad3', extra: { ...j6Links, voucher_attestation_id: 'NULL' } }), '23514', 'J6 needs the voucher attestation');
  rejects(stageInsert({ id: 'j6-bad4', stage: 'j6', doc: 'WAP-I-bad4', extra: { ...j6Links, prior_j5_record_id: 'NULL' } }), '23514', 'a system prior J5 names our J5 record');
  rejects(stageInsert({ id: 'j6-bad5', stage: 'j6', doc: 'WAP-I-bad5', extra: { ...j6Links, prior_j5_source: 'NULL', prior_j5_record_id: 'NULL' } }), '23514', 'without a prior quote the J6 is held');
  rejects(stageInsert({ id: 'j6-bad6', stage: 'j6', doc: 'WAP-I-bad6', extra: { ...j6Links, voucher_artifact_id: `'art-invoice'` } }), '23514', 'the voucher link must be the board-signed voucher, not the invoice');
  rejects(stageInsert({ id: 'j6-bad7', stage: 'j6', doc: 'WAP-I-bad7', extra: { ...j6Links, voucher_attestation_id: `'att-start'` } }), '23514', 'the voucher attestation must be a voucher attestation');
  sql(`INSERT INTO public.billing_cases (id, organization_id, member_id, subject_member_id, program_slug, created_by_subject_id, updated_at)
      VALUES ('case-2', '${ORG}', NULL, 'other-member', 'it-support-professional-certificate-ibm', '${STAFF}', now());`);
  rejects(stageInsert({ id: 'j6-cross', stage: 'j6', doc: 'WAP-I-bad8', caseId: 'case-2', extra: { ...j6Links, prior_j5_record_id: 'NULL', prior_j5_source: `'external'`, external_j5_attestation_id: `'att-start'` } }), '235(03|14)', 'J6 cannot use another case\'s voucher or attestations');
  // The voucher authorized 700000 cents, not 750000: the J6 is held for review.
  rejects(stageInsert({ id: 'j6-bad9', stage: 'j6', doc: 'WAP-I-bad9', extra: { ...j6Links, review_required: 'true' } }), '23514', 'a review hold names its reasons');
  sql(stageInsert({ id: 'j6-v1', stage: 'j6', doc: 'WAP-I-2026-0001', extra: { ...j6Links, board_invoice_artifact_id: `'art-invoice'`, review_required: 'true', review_reasons: `ARRAY['voucher_amount_differs']` } }));
  pass('J6 requires class start, the board-signed voucher and its attestation from the same case, and a prior quote (system or external); board invoice optional');

  const signJ6 = `UPDATE public.billing_stage_records SET status='signed', ${Object.entries(SIGNED('art-j6')).map(([k, v]) => `${k}=${v}`).join(', ')}, updated_at = now() WHERE id='j6-v1';`;
  rejects(signJ6, '23514', 'a J6 under review cannot be signed');
  rejects(`UPDATE public.billing_stage_records SET review_cleared_at = now(), review_cleared_by_subject_id = '${STAFF}' WHERE id='j6-v1';`, '23514', 'clearing a review needs a note');
  sql(`UPDATE public.billing_stage_records SET review_cleared_at = now(), review_cleared_by_subject_id = '${STAFF}', review_note = 'Synthetic: board confirmed the $7,500 quote in writing', updated_at = now() WHERE id='j6-v1';`);
  sql(signJ6);
  rejects(`UPDATE public.billing_stage_records SET review_note = 'rewritten' WHERE id='j6-v1';`, '23514', 'the cleared review is frozen at signing');
  pass('a voucher/quote conflict holds the J6 until an explicit staff review (who, when, note) clears it; the review is frozen at signing');

  // External prior quote: J6 allowed on a case with no system J5 and none is fabricated.
  sql(`
    ${artifactInsert({ id: 'art2-copy', kind: 'external_j5_copy', source: 'uploaded', text: '%PDF-1.7 synthetic manual quote', caseId: 'case-2' })}
    ${artifactInsert({ id: 'art2-voucher', kind: 'board_signed_voucher', source: 'uploaded', text: '%PDF-1.7 synthetic voucher 2', caseId: 'case-2' })}
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, external_reference, external_quote_date, attested_by_subject_id)
      VALUES ('att2-ext', '${ORG}', 'case-2', 'external_j5_reference', 'Synthetic manual quote', 'synthetic sent-mail record', 'art2-copy', 'MANUAL-Q-17', '2026-08-01', '${STAFF}');
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, class_start_date, class_end_date, attested_by_subject_id)
      VALUES ('att2-start', '${ORG}', 'case-2', 'class_started', 'Synthetic class started', 'synthetic attendance', '2026-09-01', '2027-02-01', '${STAFF}');
    INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, artifact_id, voucher_reference, authorized_amount_cents, authorized_start_date, authorized_end_date, received_on, receiving_signature_present, attested_by_subject_id)
      VALUES ('att2-voucher', '${ORG}', 'case-2', 'voucher_board_signed', 'Synthetic voucher is board-signed', 'synthetic board email', 'art2-voucher', 'PO-SYN-2', 750000, '2026-09-01', '2027-02-01', '2026-08-25', true, '${STAFF}');
  `);
  rejects(
    `INSERT INTO public.billing_attestations (id, organization_id, case_id, kind, statement, evidence_reference, external_reference, attested_by_subject_id)
      VALUES ('att2-ext-bad', '${ORG}', 'case-2', 'external_j5_reference', 'Synthetic', 'synthetic', 'MANUAL-Q-18', '${STAFF}');`,
    '23514',
    'an external quote reference records its date',
  );
  sql(stageInsert({ id: 'j6-ext', stage: 'j6', doc: 'WAP-I-2026-0002', caseId: 'case-2', extra: {
    class_start_attestation_id: `'att2-start'`, voucher_artifact_id: `'art2-voucher'`, voucher_attestation_id: `'att2-voucher'`,
    prior_j5_source: `'external'`, external_j5_attestation_id: `'att2-ext'`, class_start_date: `'2026-09-01'`, class_end_date: `'2027-02-01'` } }));
  assert.equal(sql(`SELECT count(*) FROM public.billing_stage_records WHERE case_id='case-2' AND stage='j5';`), '0');
  pass('an attested external (manual) prior quote lets J6 proceed without fabricating a system J5');

  // --------------------------- J6 sends: three recipients, exact bytes
  const j6Hashes = sql(`SELECT string_agg(sha256, ',' ORDER BY ord) FROM (VALUES ('art-j6', 1), ('art-voucher', 2), ('art-invoice', 3)) v(id, ord) JOIN public.billing_artifacts a USING (id);`).split(',');
  rejects(sendInsert({ id: 's-j6-noinv', record: 'j6-v1', stage: 'j6', role: 'finance', attachments: j6Hashes.slice(0, 2) }), '23514', 'the optional board invoice, when on the record, is attached');
  rejects(sendInsert({ id: 's-j6-order', record: 'j6-v1', stage: 'j6', role: 'finance', attachments: [j6Hashes[1], j6Hashes[0], j6Hashes[2]] }), '23514', 'cover letter first, then voucher, then invoice');
  for (const role of ['student', 'counselor', 'finance']) sql(sendInsert({ id: `s-j6-${role}`, record: 'j6-v1', stage: 'j6', role, attachments: j6Hashes }));
  rejects(sendInsert({ id: 's-j6-key', record: 'j6-v1', stage: 'j6', attempt: 2, role: 'student', key: 'billing-two-stage:j5:j5-v1:v1:a1:student', attachments: j6Hashes }), '23505', 'idempotency keys are globally unique');
  assert.equal(sql(`SELECT count(DISTINCT idempotency_key) FROM public.billing_stage_sends;`), '5');
  assert.equal(sql(`SELECT count(DISTINCT email) FROM public.billing_stage_sends WHERE stage_record_id='j6-v1';`), '3');
  pass('J6 copies go to finance, counselor and student as separate rows, each attaching the cover letter + exact voucher (+ invoice) bytes; J5 and J6 keys cannot collide');

  // --------------------------------------------------------- payment
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('pay-early', '${ORG}', 'case-1', 'j6-v1', 'pending', '2026-10-11', '2026-10-15', '${STAFF}');`,
    '23514',
    'payment is tracked only for a sent J6',
  );
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('pay-j5', '${ORG}', 'case-1', 'j5-v1', 'pending', '2026-10-11', '2026-10-15', '${STAFF}');`,
    '23514',
    'payment is never tracked on a J5',
  );
  sql(`UPDATE public.billing_stage_records SET status='sent', sent_at = '2026-10-01 15:00', send_receipt = '{"synthetic":true}'::jsonb, updated_at = now() WHERE id='j6-v1';`);
  rejects(`UPDATE public.billing_stage_records SET send_receipt = '{"rewritten":true}'::jsonb WHERE id='j6-v1';`, '23514', 'the send receipt is frozen once written');
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('pay-wide', '${ORG}', 'case-1', 'j6-v1', 'pending', '2026-10-11', '2026-10-31', '${STAFF}');`,
    '23514',
    'the expected follow-up window is exactly +10..+14 days',
  );
  sql(`INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, expected_follow_up_from, expected_follow_up_to, recorded_by_subject_id)
      VALUES ('pay-pending', '${ORG}', 'case-1', 'j6-v1', 'pending', '2026-10-11', '2026-10-15', '${STAFF}');`);
  rejects(
    `INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, received_on, recorded_by_subject_id)
      VALUES ('pay-noev', '${ORG}', 'case-1', 'j6-v1', 'received', '2026-10-12', '${STAFF}');`,
    '23514',
    'received needs evidence',
  );
  sql(`INSERT INTO public.billing_payment_events (id, organization_id, case_id, j6_record_id, status, received_on, evidence, recorded_by_subject_id)
      VALUES ('pay-received', '${ORG}', 'case-1', 'j6-v1', 'received', '2026-10-12', 'Synthetic remittance advice #1', '${STAFF}');`);
  rejects(`UPDATE public.billing_payment_events SET evidence = 'edited' WHERE id='pay-received';`, '23514', 'payment events are append-only');
  pass('payment: only for a sent J6; pending carries the +10..+14 day expectation; received needs a date and evidence; events are append-only');

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
  sql(migration);
  assert.equal(schemaFingerprint(), fingerprint, 'Re-applying must not change constraints, triggers or indexes.');
  for (const role of ['anon', 'authenticated']) assert.ok(privilegeMatrix(role).every((v) => v === false));
  assert.equal(sql(`SELECT count(*) FROM public.billing_stage_records;`), '3');
  pass('the migration is idempotent: a second apply keeps schema, grants and rows');
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
  for (const role of createdRoles) {
    runSql(`DROP ROLE IF EXISTS ${ident(role)};`, 'postgres');
  }
}
