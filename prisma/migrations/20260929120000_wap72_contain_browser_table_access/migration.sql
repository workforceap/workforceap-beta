-- WAP-72: contain direct browser-role access to public tables.
--
-- The application reads and writes domain data through Prisma as the table
-- owner. Browsers use Supabase only for Auth, Storage and Realtime. The single
-- browser table dependency is Realtime postgres_changes on public.messages and
-- public.message_threads as `authenticated`, which needs SELECT plus RLS.
-- The 20260909224000 receipt-column UPDATE grant is kept when it is effective.
--
-- For every public relation that no extension owns, this migration:
--   * enables (never forces) row level security on tables;
--   * keeps service_role's effective privileges as explicit grants;
--   * revokes table, column and sequence privileges from PUBLIC, anon and
--     authenticated, including TRUNCATE, REFERENCES and TRIGGER;
--   * restores only authenticated SELECT on the two messaging tables;
--   * stops future tables and sequences created by the migration role from
--     granting anything to PUBLIC, anon or authenticated.
-- It fails, and rolls back every change, when a precondition is not met or
-- when any browser privilege survives (for example, through an inherited
-- role). Routines, schema USAGE and storage are out of scope (see WAP-12).
BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE wap72_managed ON COMMIT DROP AS
SELECT c.oid AS relid, c.relkind
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
   AND NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_depend AS d
      WHERE d.classid = 'pg_catalog.pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
   );

-- Preconditions.
DO $wap72$
DECLARE
  problem text;
BEGIN
  SELECT string_agg(required.rolname, ', ') INTO problem
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS required(rolname)
   WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS r WHERE r.rolname = required.rolname);
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: required roles are missing: %', problem;
  END IF;

  -- REVOKE by a non-owner only warns, so require ownership up front.
  SELECT string_agg(m.relid::regclass::text, ', ' ORDER BY m.relid::regclass::text) INTO problem
    FROM wap72_managed AS m
    JOIN pg_catalog.pg_class AS c ON c.oid = m.relid
   WHERE NOT pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE');
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: relations not owned by migration role %: %', current_user, problem;
  END IF;

  IF to_regclass('public.messages') IS NULL OR to_regclass('public.message_threads') IS NULL THEN
    RAISE EXCEPTION 'WAP-72: public.messages or public.message_threads is missing';
  END IF;

  -- Keep existing Realtime access; never create browser access that was absent.
  IF NOT has_table_privilege('authenticated', 'public.messages', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.message_threads', 'SELECT') THEN
    RAISE EXCEPTION 'WAP-72: authenticated messaging SELECT is missing before containment';
  END IF;

  -- Enabling RLS on the messaging tables is only safe with their policies.
  SELECT string_agg(format('%s on public.%s', required.policyname, required.tablename), ', ')
    INTO problem
    FROM (VALUES
      ('messages', 'messages_select_thread_participant'),
      ('message_threads', 'message_threads_select_participant'),
      ('message_threads', 'message_threads_update_participant')
    ) AS required(tablename, policyname)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_policies AS p
      WHERE p.schemaname = 'public'
        AND p.tablename = required.tablename
        AND p.policyname = required.policyname
   );
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: messaging policy missing: %', problem;
  END IF;
END
$wap72$;

-- Snapshot what must survive: service_role privileges and receipt UPDATE.
CREATE TEMP TABLE wap72_service_before ON COMMIT DROP AS
SELECT m.relid, m.relkind, p.privilege
  FROM wap72_managed AS m
 CROSS JOIN LATERAL unnest(
   CASE WHEN m.relkind = 'S' THEN ARRAY['USAGE', 'SELECT', 'UPDATE']
        ELSE ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] END
 ) AS p(privilege)
 WHERE CASE WHEN m.relkind = 'S' THEN has_sequence_privilege('service_role', m.relid, p.privilege)
            ELSE has_table_privilege('service_role', m.relid, p.privilege) END;

CREATE TEMP TABLE wap72_receipts_before ON COMMIT DROP AS
SELECT receipt.attname
  FROM unnest(ARRAY[
    'member_last_read_at', 'counselor_last_read_at',
    'portal_user_last_read_at', 'staff_last_read_at'
  ]) AS receipt(attname)
 WHERE EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'public.message_threads'::regclass
      AND a.attname = receipt.attname
      AND NOT a.attisdropped
 )
   AND has_column_privilege('authenticated', 'public.message_threads', receipt.attname, 'UPDATE');

DO $wap72$
DECLARE
  rel record;
  columns text;
BEGIN
  FOR rel IN
    SELECT m.relid, m.relkind FROM wap72_managed AS m
      JOIN pg_catalog.pg_class AS c ON c.oid = m.relid
     WHERE m.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', rel.relid::regclass);
  END LOOP;

  -- Make service_role access explicit before PUBLIC grants are removed.
  FOR rel IN
    SELECT s.relid, s.relkind, string_agg(s.privilege, ', ') AS privileges
      FROM wap72_service_before AS s GROUP BY s.relid, s.relkind
  LOOP
    EXECUTE format('GRANT %s ON %s %s TO service_role', rel.privileges,
      CASE WHEN rel.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, rel.relid::regclass);
  END LOOP;

  FOR rel IN SELECT m.relid, m.relkind FROM wap72_managed AS m LOOP
    IF rel.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
        rel.relid::regclass);
      CONTINUE;
    END IF;

    -- Revoking a table privilege also revokes that privilege on every
    -- column; the column postcondition below verifies it.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated',
      rel.relid::regclass);
  END LOOP;

  GRANT SELECT ON TABLE public.messages, public.message_threads TO authenticated;

  SELECT string_agg(format('%I', r.attname), ', ') INTO columns FROM wap72_receipts_before AS r;
  IF columns IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.message_threads TO authenticated', columns);
  END IF;
END
$wap72$;

-- Future Prisma tables are created by this migration role. Per-schema defaults
-- cannot remove a global default grant, so change both.
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Postconditions: fail atomically if any effective browser privilege remains.
DO $wap72$
DECLARE
  problem text;
BEGIN
  SELECT string_agg(m.relid::regclass::text, ', ') INTO problem
    FROM wap72_managed AS m JOIN pg_catalog.pg_class AS c ON c.oid = m.relid
   WHERE m.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: RLS still disabled on %', problem;
  END IF;

  SELECT string_agg(DISTINCT format('%s %s on %s', b.rolname, p.privilege, m.relid::regclass), '; ')
    INTO problem
    FROM wap72_managed AS m
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS b(rolname)
   CROSS JOIN LATERAL unnest(
     CASE WHEN m.relkind = 'S' THEN ARRAY['USAGE', 'SELECT', 'UPDATE']
          ELSE ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] END
   ) AS p(privilege)
   WHERE CASE WHEN m.relkind = 'S' THEN has_sequence_privilege(b.rolname, m.relid, p.privilege)
              ELSE has_table_privilege(b.rolname, m.relid, p.privilege) END
     AND NOT (b.rolname = 'authenticated' AND p.privilege = 'SELECT'
              AND m.relid IN ('public.messages'::regclass, 'public.message_threads'::regclass));
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: effective browser privilege remains: %', problem;
  END IF;

  SELECT string_agg(DISTINCT format('%s %s(%s) on %s', b.rolname, p.privilege, a.attname, m.relid::regclass), '; ')
    INTO problem
    FROM wap72_managed AS m
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = m.relid AND a.attnum > 0 AND NOT a.attisdropped
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS b(rolname)
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(privilege)
   WHERE m.relkind <> 'S'
     AND has_column_privilege(b.rolname, m.relid, a.attnum, p.privilege)
     AND NOT (b.rolname = 'authenticated' AND p.privilege = 'SELECT'
              AND m.relid IN ('public.messages'::regclass, 'public.message_threads'::regclass))
     AND NOT (b.rolname = 'authenticated' AND p.privilege = 'UPDATE'
              AND m.relid = 'public.message_threads'::regclass
              AND a.attname IN (SELECT r.attname FROM wap72_receipts_before AS r));
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: effective browser column privilege remains: %', problem;
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.messages', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.message_threads', 'SELECT')
    OR EXISTS (
      SELECT 1 FROM wap72_receipts_before AS r
       WHERE NOT has_column_privilege('authenticated', 'public.message_threads', r.attname, 'UPDATE')
    ) THEN
    RAISE EXCEPTION 'WAP-72: authenticated messaging access was lost';
  END IF;

  SELECT string_agg(format('%s %s', s.privilege, s.relid::regclass), ', ') INTO problem
    FROM wap72_service_before AS s
   WHERE NOT CASE WHEN s.relkind = 'S' THEN has_sequence_privilege('service_role', s.relid, s.privilege)
                  ELSE has_table_privilege('service_role', s.relid, s.privilege) END;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'WAP-72: service_role privilege was lost: %', problem;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_default_acl AS d
     CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS x
     WHERE d.defaclrole = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user)
       AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
       AND d.defaclobjtype IN ('r', 'S')
       AND (x.grantee = 0 OR x.grantee IN (
         SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname IN ('anon', 'authenticated')))
  ) THEN
    RAISE EXCEPTION 'WAP-72: default privileges for % still grant browser roles', current_user;
  END IF;
END
$wap72$;

COMMIT;
