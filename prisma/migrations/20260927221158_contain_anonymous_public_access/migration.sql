-- WAP-12, phase 1: contain anonymous access to existing public objects.
-- This does not contain authenticated DEMO access while 98 public tables have
-- RLS off. Disable the DEMO Data API or repair RLS/grants separately.
-- Authenticated realtime uses public.messages/message_threads. Their grants and
-- policies need a separate authorization review, so this does not revoke
-- authenticated grants or FORCE RLS.
BEGIN;

DROP POLICY IF EXISTS public_wioa_screenings_insert_public
  ON public.public_wioa_screenings;

-- Preserve the current browser-chat SELECT capability even if it came from a
-- PUBLIC grant. Fail rather than create new access where it did not exist.
DO $migration$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.messages', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.message_threads', 'SELECT')
  THEN
    RAISE EXCEPTION 'WAP-12 authenticated messaging SELECT missing before containment';
  END IF;
END
$migration$;
GRANT SELECT ON TABLE public.messages, public.message_threads TO authenticated;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

-- Table-level REVOKE does not remove column grants.
DO $migration$
DECLARE relation RECORD;
BEGIN
  FOR relation IN
    SELECT c.oid::regclass AS name, string_agg(quote_ident(a.attname), ', ') AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.oid
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %s FROM anon, PUBLIC',
      relation.columns, relation.name);
  END LOOP;
END
$migration$;

-- Preserve effective authenticated/service_role EXECUTE where it previously
-- came only from PUBLIC. Never grant access to helpers already restricted to
-- the backend. ROUTINE includes functions, aggregates, and procedures.
DO $migration$
DECLARE routine RECORD; target_role TEXT;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['authenticated', 'service_role']
  LOOP
    FOR routine IN
      SELECT p.oid::regprocedure AS name FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND has_function_privilege(target_role, p.oid, 'EXECUTE')
    LOOP
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO %I', routine.name, target_role);
    END LOOP;
  END LOOP;
END
$migration$;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM anon, PUBLIC;

-- Prisma creates application objects as postgres. Global defaults must also
-- remove PUBLIC EXECUTE: per-schema defaults cannot override that implicit grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON ROUTINES FROM anon, PUBLIC;

-- Managed supabase_admin defaults are a separate rollout prerequisite; do not
-- silently skip permission failures or alter a managed role in an app migration.
ALTER FUNCTION public.preserve_coursera_curriculum_course_mapping()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.preserve_course_enrollment_curriculum_version()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.xapi_statement_ingest_org_check()
  SET search_path = pg_catalog, public;

-- Fail atomically if inherited grants or unexpected ACLs defeat containment.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
      (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) ELSE false END
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S' THEN
      has_sequence_privilege('anon', c.oid, 'SELECT,UPDATE,USAGE') ELSE false END
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'WAP-12 anonymous public privileges remain; containment rolled back';
  END IF;

  -- Browser chat subscribes as authenticated to both tables. Do not land a
  -- containment change that silently removes the SELECT grants it requires.
  IF NOT has_table_privilege('authenticated', 'public.messages', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.message_threads', 'SELECT')
  THEN
    RAISE EXCEPTION 'WAP-12 authenticated messaging SELECT lost; containment rolled back';
  END IF;
END
$migration$;

COMMIT;
