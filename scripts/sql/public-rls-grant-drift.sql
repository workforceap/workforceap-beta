-- WAP-72 public-schema RLS and browser-grant drift check. READ ONLY.
--
-- One SELECT over system catalogs; it reads no table rows. Run it through
-- scripts/check-public-rls-grants.mjs, which wraps it in BEGIN READ ONLY, or
-- paste it into a read-only SQL session. Intended for the database owner.
--
-- Columns: severity, check_name, role_name, relation, detail.
--   error: rls_disabled, table_privilege, column_privilege, sequence_privilege
--   warn:  default_privilege (future objects created by that role)
--   info:  relations_checked
-- Allowed by design (WAP-72): authenticated SELECT on public.messages and
-- public.message_threads (Realtime), and authenticated UPDATE on the four
-- message_threads receipt columns.
-- Relations owned by an extension are not checked.
WITH managed AS (
  SELECT c.oid, c.relkind, c.relrowsecurity,
         format('%I.%I', n.nspname, c.relname) AS relation
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend AS d
        WHERE d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
     )
),
browser AS (
  SELECT r.oid, r.rolname FROM pg_catalog.pg_roles AS r
   WHERE r.rolname IN ('anon', 'authenticated')
),
messaging AS (
  SELECT unnest(ARRAY['public.messages', 'public.message_threads']) AS relation
),
findings AS (
  SELECT 'error' AS severity, 'rls_disabled' AS check_name, '-' AS role_name,
         m.relation, 'row level security is off' AS detail
    FROM managed AS m
   WHERE m.relkind IN ('r', 'p') AND NOT m.relrowsecurity

  UNION ALL
  SELECT 'error', 'table_privilege', b.rolname, m.relation,
         string_agg(p.privilege, ', ' ORDER BY p.ord)
    FROM managed AS m
   CROSS JOIN browser AS b
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
         WITH ORDINALITY AS p(privilege, ord)
   WHERE m.relkind <> 'S'
     AND pg_catalog.has_table_privilege(b.oid, m.oid, p.privilege)
     AND NOT (b.rolname = 'authenticated' AND p.privilege = 'SELECT'
              AND m.relation IN (SELECT relation FROM messaging))
   GROUP BY b.rolname, m.relation

  UNION ALL
  SELECT 'error', 'column_privilege', b.rolname, m.relation,
         string_agg(format('%s(%s)', p.privilege, a.attname), ', ' ORDER BY p.ord, a.attnum)
    FROM managed AS m
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = m.oid AND a.attnum > 0 AND NOT a.attisdropped
   CROSS JOIN browser AS b
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'])
         WITH ORDINALITY AS p(privilege, ord)
   WHERE m.relkind <> 'S'
     AND pg_catalog.has_column_privilege(b.oid, m.oid, a.attnum, p.privilege)
     AND NOT pg_catalog.has_table_privilege(b.oid, m.oid, p.privilege)
     AND NOT (b.rolname = 'authenticated' AND p.privilege = 'UPDATE'
              AND m.relation = 'public.message_threads'
              AND a.attname IN ('member_last_read_at', 'counselor_last_read_at',
                                'portal_user_last_read_at', 'staff_last_read_at'))
   GROUP BY b.rolname, m.relation

  UNION ALL
  SELECT 'error', 'sequence_privilege', b.rolname, m.relation,
         string_agg(p.privilege, ', ' ORDER BY p.ord)
    FROM managed AS m
   CROSS JOIN browser AS b
   CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) WITH ORDINALITY AS p(privilege, ord)
   WHERE m.relkind = 'S'
     AND pg_catalog.has_sequence_privilege(b.oid, m.oid, p.privilege)
   GROUP BY b.rolname, m.relation

  UNION ALL
  SELECT 'warn', 'default_privilege',
         CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
         format('%s objects created by %s in %s',
                CASE d.defaclobjtype WHEN 'r' THEN 'table' ELSE 'sequence' END,
                pg_catalog.pg_get_userbyid(d.defaclrole),
                COALESCE(n.nspname, 'all schemas')),
         string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type)
    FROM pg_catalog.pg_default_acl AS d
    LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
   CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS x
   WHERE (d.defaclnamespace = 0 OR n.nspname = 'public')
     AND d.defaclobjtype IN ('r', 'S')
     AND (x.grantee = 0 OR x.grantee IN (SELECT oid FROM browser))
   GROUP BY x.grantee, d.defaclobjtype, d.defaclrole, n.nspname

  UNION ALL
  SELECT 'info', 'relations_checked', '-', '-', count(*)::text FROM managed
)
SELECT severity, check_name, role_name, relation, detail
  FROM findings
 ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
          check_name, relation, role_name;
