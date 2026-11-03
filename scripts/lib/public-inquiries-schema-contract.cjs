/** Read-only prerequisites for the public-inquiries server-owned table. */
const MIGRATION_NAME = '20261015225832_public_inquiries';

const COLUMNS = {
  id: ['text', true], organization_id: ['text', true],
  submission_key: ['character varying(100)', true], payload_hash: ['character varying(64)', true],
  kind: ['character varying(20)', true], first_name: ['character varying(100)', true],
  last_name: ['character varying(100)', true], email: ['character varying(254)', true],
  phone: ['character varying(80)', false], topic: ['character varying(200)', true],
  message: ['character varying(10000)', true], organization_name: ['character varying(200)', false],
  interest_area: ['character varying(200)', false], role_title: ['character varying(200)', false],
  seats: ['integer', false], sms_preferred: ['boolean', true],
  notification_status: ['character varying(20)', true], notification_attempts: ['integer', true],
  notification_attempted_at: ['timestamp(3) without time zone', false],
  created_at: ['timestamp(3) without time zone', true], updated_at: ['timestamp(3) without time zone', true],
};
const API_ROLES = ['anon', 'authenticated', 'service_role'];
const DEFAULTS = {
  sms_preferred: ['false'], notification_status: ["'pending'::character varying", "'pending'::text"],
  notification_attempts: ['0'], created_at: ['CURRENT_TIMESTAMP', 'now()'],
};

// Catalogs only: no inquiry records, mutations, or migration-ledger assumptions.
// has_*_privilege includes PUBLIC and inherited grants. Checking every membership
// also conservatively catches privileges reachable through a non-inherited role.
// acldefault enumerates this server's table privileges, including PG17 MAINTAIN.
const SCHEMA_QUERY = `
WITH target AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relowner, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'public_inquiries'
), api_roles AS (
  SELECT expected.name, r.oid
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS expected(name)
  LEFT JOIN pg_roles r ON r.rolname = expected.name
), reachable_roles AS (
  SELECT a.name, r.oid FROM api_roles a JOIN pg_roles r
    ON a.oid IS NOT NULL AND pg_has_role(a.oid, r.oid, 'MEMBER')
)
SELECT jsonb_build_object(
  'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'kind', relkind, 'rls', relrowsecurity, 'forceRls', relforcerowsecurity)) FROM target), '[]'::jsonb),
  'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
    'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity, 'generated', a.attgenerated))
    FROM target t JOIN pg_attribute a ON a.attrelid = t.oid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
  'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'kind', c.contype, 'validated', c.convalidated, 'deferrable', c.condeferrable,
    'columns', COALESCE((SELECT jsonb_agg(a.attname ORDER BY k.position)
      FROM unnest(c.conkey) WITH ORDINALITY k(number, position)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.number), '[]'::jsonb),
    'referenceSchema', rn.nspname, 'referenceTable', r.relname,
    'referenceColumns', COALESCE((SELECT jsonb_agg(a.attname ORDER BY k.position)
      FROM unnest(c.confkey) WITH ORDINALITY k(number, position)
      JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.number), '[]'::jsonb),
    'onDelete', c.confdeltype, 'onUpdate', c.confupdtype))
    FROM target t JOIN pg_constraint c ON c.conrelid = t.oid
    LEFT JOIN pg_class r ON r.oid = c.confrelid LEFT JOIN pg_namespace rn ON rn.oid = r.relnamespace
    WHERE c.contype IN ('p', 'f')), '[]'::jsonb),
  'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'unique', i.indisunique, 'primary', i.indisprimary, 'valid', i.indisvalid, 'ready', i.indisready, 'method', am.amname,
    'partial', i.indpred IS NOT NULL, 'expressions', i.indexprs IS NOT NULL,
    'columns', COALESCE((SELECT jsonb_agg(a.attname ORDER BY k.position)
      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(number, position)
      LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.number
      WHERE k.position <= i.indnkeyatts), '[]'::jsonb)))
    FROM target t JOIN pg_index i ON i.indrelid = t.oid
    JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_am am ON am.oid = ic.relam), '[]'::jsonb),
  'policyCount', (SELECT count(*) FROM target t JOIN pg_policy p ON p.polrelid = t.oid),
  'publicTablePrivileges', COALESCE((SELECT jsonb_agg(DISTINCT acl.privilege_type)
    FROM target t CROSS JOIN LATERAL aclexplode(COALESCE(t.relacl, acldefault('r', t.relowner))) acl
    WHERE acl.grantee = 0), '[]'::jsonb),
  'publicColumnPrivileges', COALESCE((SELECT jsonb_agg(DISTINCT acl.privilege_type)
    FROM target t JOIN pg_attribute a ON a.attrelid = t.oid
    CROSS JOIN LATERAL aclexplode(a.attacl) acl
    WHERE a.attnum > 0 AND NOT a.attisdropped AND acl.grantee = 0), '[]'::jsonb),
  'apiRoles', (SELECT jsonb_agg(jsonb_build_object(
    'name', a.name, 'present', a.oid IS NOT NULL,
    'tablePrivileges', COALESCE((SELECT jsonb_agg(DISTINCT p.privilege_type)
      FROM reachable_roles r CROSS JOIN target t
      CROSS JOIN LATERAL aclexplode(acldefault('r', t.relowner)) p
      WHERE r.name = a.name AND has_table_privilege(r.oid, t.oid, p.privilege_type)), '[]'::jsonb),
    'columnPrivileges', COALESCE((SELECT jsonb_agg(DISTINCT p.privilege)
      FROM reachable_roles r CROSS JOIN target t
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege)
      WHERE r.name = a.name AND has_any_column_privilege(r.oid, t.oid, p.privilege)), '[]'::jsonb)
  )) FROM api_roles a)
) AS state`;

async function readSchemaState(prisma) {
  const rows = await prisma.$queryRawUnsafe(SCHEMA_QUERY);
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  return rows[0]?.state ?? null;
}

function sameColumns(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function evaluateSchema(state) {
  const result = (errors) => ({ ok: errors.length === 0, migration: MIGRATION_NAME, errors: [...new Set(errors)] });
  const arrayKeys = ['tables', 'columns', 'constraints', 'indexes', 'publicTablePrivileges', 'publicColumnPrivileges', 'apiRoles'];
  if (!state || typeof state !== 'object' || arrayKeys.some((key) => !Array.isArray(state[key])) ||
      !Number.isSafeInteger(state.policyCount) || state.policyCount < 0 ||
      ['tables', 'columns', 'constraints', 'indexes', 'apiRoles'].some((key) =>
        state[key].some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry)))) {
    return result(['schema_metadata_invalid']);
  }
  if (state.tables.length === 0) return result(['public_inquiries_table_missing']);
  const errors = [];
  if (state.tables.length !== 1 || state.tables[0].kind !== 'r') errors.push('public_inquiries_table_kind');
  if (state.tables[0].rls !== true || state.tables[0].forceRls !== false) errors.push('public_inquiries_rls_contract');
  if (state.policyCount !== 0) errors.push('unexpected_public_inquiries_policy');
  for (const [name, [type, notNull]] of Object.entries(COLUMNS)) {
    const matches = state.columns.filter((column) => column.name === name);
    if (matches.length !== 1) errors.push(`column_missing_or_duplicate:${name}`);
    else if (matches[0].type !== type || matches[0].notNull !== notNull ||
      matches[0].identity !== '' || matches[0].generated !== '') errors.push(`column_contract:${name}`);
    if (matches.length === 1 && DEFAULTS[name] && !DEFAULTS[name].includes(matches[0].default)) errors.push(`column_default:${name}`);
  }
  if (state.columns.some((column) => !Object.hasOwn(COLUMNS, column.name) &&
    column.notNull === true && column.default == null && !column.identity && !column.generated)) {
    errors.push('unexpected_required_column');
  }
  if (!state.constraints.some((constraint) => constraint.kind === 'p' && constraint.validated === true &&
    constraint.deferrable === false && sameColumns(constraint.columns, ['id'])) ||
    !state.indexes.some((index) => index.primary === true && index.unique === true && index.valid === true &&
      index.ready === true && index.partial === false && index.expressions === false && index.method === 'btree' &&
      sameColumns(index.columns, ['id']))) errors.push('primary_key_contract');
  if (!state.constraints.some((constraint) => constraint.kind === 'f' && constraint.validated === true &&
    constraint.deferrable === false && sameColumns(constraint.columns, ['organization_id']) &&
    constraint.referenceSchema === 'public' && constraint.referenceTable === 'organizations' &&
    sameColumns(constraint.referenceColumns, ['id']) && constraint.onDelete === 'c' && constraint.onUpdate === 'c')) {
    errors.push('organization_foreign_key_contract');
  }
  for (const [name, columns, unique] of [
    ['tenant_submission_unique', ['organization_id', 'submission_key'], true],
    ['tenant_received_index', ['organization_id', 'created_at'], false],
    ['retention_index', ['created_at'], false],
  ]) {
    if (!state.indexes.some((index) => index.valid === true && index.ready === true && index.method === 'btree' &&
      index.partial === false && index.expressions === false && index.unique === unique && sameColumns(index.columns, columns))) {
      errors.push(name);
    }
  }
  if (state.publicTablePrivileges.length || state.publicColumnPrivileges.length) errors.push('public_privileges_present');
  for (const name of API_ROLES) {
    const roles = state.apiRoles.filter((role) => role.name === name);
    if (roles.length !== 1 || roles[0].present !== true) errors.push(`api_role_missing_or_duplicate:${name}`);
    else if (!Array.isArray(roles[0].tablePrivileges) || !Array.isArray(roles[0].columnPrivileges)) errors.push('schema_metadata_invalid');
    else if (roles[0].tablePrivileges.length || roles[0].columnPrivileges.length) errors.push(`api_role_privileges:${name}`);
  }
  return result(errors);
}

module.exports = { MIGRATION_NAME, readSchemaState, evaluateSchema };
