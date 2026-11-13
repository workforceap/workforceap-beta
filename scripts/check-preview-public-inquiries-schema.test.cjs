const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSchema, readSchemaState, MIGRATION_NAME } = require('./lib/public-inquiries-schema-contract.cjs');
const { validatePreviewTarget, main } = require('./check-preview-public-inquiries-schema.cjs');

const DEMO = 'esbdrgaonplpvzmtrdhw';
const PROD = 'jqddnyuszufndwwezdwp';
const column = (name, type, notNull = true, defaultValue = null) => ({
  name, type, notNull, default: defaultValue, identity: '', generated: '',
});
const index = (columns, unique = false, primary = false) => ({
  columns, unique, primary, valid: true, ready: true, method: 'btree', partial: false, expressions: false,
});
function completeSchema() {
  return {
    tables: [{ kind: 'r', rls: true, forceRls: false }],
    columns: [
      column('id', 'text'), column('organization_id', 'text'),
      column('submission_key', 'character varying(100)'), column('payload_hash', 'character varying(64)'),
      column('kind', 'character varying(20)'), column('first_name', 'character varying(100)'),
      column('last_name', 'character varying(100)'), column('email', 'character varying(254)'),
      column('phone', 'character varying(80)', false), column('topic', 'character varying(200)'),
      column('message', 'character varying(10000)'), column('organization_name', 'character varying(200)', false),
      column('interest_area', 'character varying(200)', false), column('role_title', 'character varying(200)', false),
      column('seats', 'integer', false), column('sms_preferred', 'boolean', true, 'false'),
      column('notification_status', 'character varying(20)', true, "'pending'::character varying"),
      column('notification_attempts', 'integer', true, '0'),
      column('notification_attempted_at', 'timestamp(3) without time zone', false),
      column('created_at', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
      column('updated_at', 'timestamp(3) without time zone'),
    ],
    constraints: [
      { kind: 'p', columns: ['id'], validated: true, deferrable: false },
      { kind: 'f', columns: ['organization_id'], referenceSchema: 'public', referenceTable: 'organizations',
        referenceColumns: ['id'], validated: true, deferrable: false, onDelete: 'c', onUpdate: 'c' },
    ],
    indexes: [index(['id'], true, true), index(['organization_id', 'submission_key'], true),
      index(['organization_id', 'created_at']), index(['created_at'])],
    policyCount: 0, publicTablePrivileges: [], publicColumnPrivileges: [],
    apiRoles: ['anon', 'authenticated', 'service_role'].map((name) => ({
      name, present: true, tablePrivileges: [], columnPrivileges: [],
    })),
  };
}
function environment() {
  return {
    VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: `https://${DEMO}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_key_for_schema_tests',
    POSTGRES_PRISMA_URL: `postgresql://postgres:synthetic@db.${DEMO}.supabase.co:5432/postgres`,
  };
}
function expectFailure(change, code) {
  const state = completeSchema();
  change(state);
  const verdict = evaluateSchema(state);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.includes(code), JSON.stringify(verdict));
}
function execution(overrides = {}) {
  const output = [];
  const calls = { constructed: 0, queries: 0, disconnected: 0 };
  const options = {
    env: environment(), args: ['--project-ref', DEMO], log: (line) => output.push(line), error: (line) => output.push(line),
    createClient: (url) => {
      calls.constructed += 1;
      assert.equal(url, options.env.POSTGRES_PRISMA_URL);
      return {
        async $queryRawUnsafe() { calls.queries += 1; return [{ state: completeSchema() }]; },
        async $disconnect() { calls.disconnected += 1; },
      };
    },
    ...overrides,
  };
  return { options, output, calls };
}

test('accepts the complete server-only inquiry schema and compatible nullable additions', () => {
  assert.deepEqual(evaluateSchema(completeSchema()), { ok: true, migration: MIGRATION_NAME, errors: [] });
  const state = completeSchema();
  state.columns.push(column('future_optional', 'text', false));
  assert.equal(evaluateSchema(state).ok, true);
});

test('absent relation produces an actionable migration prerequisite, never empty-inbox success', () => {
  expectFailure((state) => { state.tables = []; state.columns = []; }, 'public_inquiries_table_missing');
  expectFailure((state) => { state.tables[0].kind = 'v'; }, 'public_inquiries_table_kind');
});

test('detects missing, truncated, nullable, generated, and unsafe-default columns', () => {
  expectFailure((state) => { state.columns = state.columns.filter((entry) => entry.name !== 'message'); }, 'column_missing_or_duplicate:message');
  expectFailure((state) => { state.columns.find((entry) => entry.name === 'message').type = 'character varying(120)'; }, 'column_contract:message');
  expectFailure((state) => { state.columns.find((entry) => entry.name === 'organization_id').notNull = false; }, 'column_contract:organization_id');
  expectFailure((state) => { state.columns[0].generated = 's'; }, 'column_contract:id');
  expectFailure((state) => { state.columns.find((entry) => entry.name === 'created_at').default = null; }, 'column_default:created_at');
  expectFailure((state) => { state.columns.find((entry) => entry.name === 'notification_status').default = "'accepted'::text"; }, 'column_default:notification_status');
  expectFailure((state) => { state.columns.push(column('future_required', 'text')); }, 'unexpected_required_column');
});

test('requires a valid primary key and tenant FK with the reviewed cascade behavior', () => {
  expectFailure((state) => { state.constraints = state.constraints.filter((entry) => entry.kind !== 'p'); }, 'primary_key_contract');
  expectFailure((state) => { state.indexes[0].valid = false; }, 'primary_key_contract');
  for (const changes of [{ referenceTable: 'users' }, { referenceSchema: 'other' }, { validated: false },
    { onDelete: 'n' }, { onUpdate: 'a' }, { deferrable: true }, { columns: ['id'] }]) {
    expectFailure((state) => Object.assign(state.constraints[1], changes), 'organization_foreign_key_contract');
  }
});

test('requires usable unconditional tenant uniqueness and received/retention indexes', () => {
  for (const changes of [{ unique: false }, { valid: false }, { ready: false }, { partial: true },
    { expressions: true }, { columns: ['submission_key'] }, { method: 'hash' }]) {
    expectFailure((state) => Object.assign(state.indexes[1], changes), 'tenant_submission_unique');
  }
  expectFailure((state) => { state.indexes.splice(2, 1); }, 'tenant_received_index');
  expectFailure((state) => { state.indexes[3].partial = true; }, 'retention_index');
});

test('requires RLS without added policies or forced-owner isolation', () => {
  expectFailure((state) => { state.tables[0].rls = false; }, 'public_inquiries_rls_contract');
  expectFailure((state) => { state.tables[0].forceRls = true; }, 'public_inquiries_rls_contract');
  expectFailure((state) => { state.policyCount = 1; }, 'unexpected_public_inquiries_policy');
});

test('rejects PUBLIC table/column grants and effective API-role privileges, including membership-derived results', () => {
  expectFailure((state) => { state.publicTablePrivileges = ['SELECT']; }, 'public_privileges_present');
  expectFailure((state) => { state.publicColumnPrivileges = ['UPDATE']; }, 'public_privileges_present');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expectFailure((state) => { state.apiRoles.find((entry) => entry.name === role).tablePrivileges = ['INSERT']; }, `api_role_privileges:${role}`);
    expectFailure((state) => { state.apiRoles.find((entry) => entry.name === role).columnPrivileges = ['SELECT']; }, `api_role_privileges:${role}`);
  }
});

test('rejects PostgreSQL 17 MAINTAIN privileges for every API role', () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expectFailure((state) => { state.apiRoles.find((entry) => entry.name === role).tablePrivileges = ['MAINTAIN']; }, `api_role_privileges:${role}`);
  }
});

test('missing roles or incomplete catalog results cannot pass', () => {
  expectFailure((state) => { state.apiRoles[0].present = false; }, 'api_role_missing_or_duplicate:anon');
  expectFailure((state) => { delete state.apiRoles[0].columnPrivileges; }, 'schema_metadata_invalid');
  for (const state of [null, {}, { ...completeSchema(), indexes: null }, { ...completeSchema(), columns: [null] },
    { ...completeSchema(), policyCount: undefined }]) assert.equal(evaluateSchema(state).ok, false);
});

test('explicit DEMO preview/development environment selects only the verified runtime URL', () => {
  for (const VERCEL_ENV of ['preview', 'development']) {
    const env = { ...environment(), VERCEL_ENV };
    assert.deepEqual(validatePreviewTarget(env, DEMO), { databaseUrl: env.POSTGRES_PRISMA_URL, projectRef: DEMO });
  }
});

test('production, unknown, mixed, overridden and missing targets fail before constructing a client', async () => {
  const badEnvironments = [
    { VERCEL_ENV: 'production' }, { VERCEL_ENV: '' }, { VERCEL_ENV: 'staging' },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` },
    { POSTGRES_PRISMA_URL: `postgresql://postgres:synthetic@db.${PROD}.supabase.co:5432/postgres` },
    { POSTGRES_PRISMA_URL: 'postgresql://synthetic:do-not-print@unknown.invalid/postgres' },
    { POSTGRES_PRISMA_URL: `${environment().POSTGRES_PRISMA_URL}?host=other.invalid` },
    { POSTGRES_PRISMA_URL: '' }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_do-not-print' },
    { POSTGRES_URL_NON_POOLING: `postgresql://postgres:synthetic@db.${PROD}.supabase.co:5432/postgres` },
    { DATABASE_URL: `postgresql://postgres:do-not-print@db.${PROD}.supabase.co:5432/postgres` },
  ];
  for (const overrides of badEnvironments) {
    const { options, output, calls } = execution({ env: { ...environment(), ...overrides } });
    assert.equal(await main(options), 2);
    assert.equal(calls.constructed, 0);
    assert.doesNotMatch(output.join('\n'), /do-not-print|postgresql:\/\//);
  }
  for (const args of [[], ['--project-ref', PROD], ['--project-ref', DEMO, '--apply'], ['--project-ref', 'unknown']]) {
    const { options, calls } = execution({ args });
    assert.equal(await main(options), 2);
    assert.equal(calls.constructed, 0);
  }
});

test('complete command performs a catalog read, disconnects and limits its acceptance claim', async () => {
  const { options, output, calls } = execution();
  assert.equal(await main(options), 0);
  assert.deepEqual(calls, { constructed: 1, queries: 1, disconnected: 1 });
  assert.match(output.join('\n'), /Authenticated behavior and migration history require separate acceptance/);
});

test('missing table returns nonzero with the migration ID and closes its client', async () => {
  let disconnected = false;
  const state = completeSchema(); state.tables = []; state.columns = [];
  const { options, output } = execution({ createClient: () => ({
    async $queryRawUnsafe() { return [{ state }]; }, async $disconnect() { disconnected = true; },
  }) });
  assert.equal(await main(options), 1);
  assert.equal(disconnected, true);
  assert.match(output.join('\n'), /public_inquiries_table_missing/);
  assert.ok(output.join('\n').includes(MIGRATION_NAME));
});

test('query, constructor and disconnect errors remain sanitized and cannot report a pass', async () => {
  for (const stage of ['construct', 'query', 'disconnect']) {
    const secretError = () => { throw new Error('postgresql://user:do-not-print@private.invalid/postgres'); };
    const { options, output } = execution({ createClient: () => {
      if (stage === 'construct') secretError();
      return {
        async $queryRawUnsafe() { if (stage === 'query') secretError(); return [{ state: completeSchema() }]; },
        async $disconnect() { if (stage === 'disconnect') secretError(); },
      };
    } });
    assert.equal(await main(options), 1);
    assert.doesNotMatch(output.join('\n'), /do-not-print|private\.invalid|PASS/);
  }
});

test('missing or ambiguous metadata rows fail closed', async () => {
  for (const rows of [[], [{ state: completeSchema() }, { state: completeSchema() }], [{}]]) {
    const state = await readSchemaState({ async $queryRawUnsafe() { return rows; } });
    assert.equal(evaluateSchema(state).ok, false);
  }
});
