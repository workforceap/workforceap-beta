-- Reserve the private attendance archive namespace (`attendance/...` in the
-- private `member-files` bucket) for the server. No table, bucket, grant or
-- permissive policy is created, and no existing policy is changed.
--
-- Draft for review on a disposable local Supabase stack. Not applied anywhere.
-- Design record: docs/attendance/storage-remedy-proposal.md
--
-- Role coverage: every policy targets PUBLIC, so it binds anon, authenticated
-- AND any other role that is (or later becomes) a member of them or holds a
-- Storage grant. service_role and the table owner bypass RLS by design; the
-- preflight below proves service_role really has BYPASSRLS, because the server
-- is the only intended writer and must not be denied by this policy.
--
-- Listing leaks: Storage also exposes object names through storage.prefixes
-- (directory listing / search_v2) and the multipart-upload tables. Each is
-- covered by the same restrictive predicate when present, and the migration
-- fails (never skips) if one is present without RLS or if any listing function
-- is SECURITY DEFINER, which would read those tables as its owner and bypass
-- the policies.
--
-- Only the exact lower-case `attendance` namespace is reserved. The server
-- writes lower-case canonical keys only (lib/attendance/storageKey.ts), so an
-- `Attendance/...` object is a different, never-read name.
--
-- Rollback (only while no attendance object exists; otherwise keep the policy
-- and disable the application entry points):
--   DROP POLICY attendance_server_only ON storage.objects;
--   DROP POLICY attendance_server_only ON storage.prefixes;                   -- if created
--   DROP POLICY attendance_server_only ON storage.s3_multipart_uploads;       -- if created
--   DROP POLICY attendance_server_only ON storage.s3_multipart_uploads_parts; -- if created

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Preflight: every failure aborts the whole migration.
DO $$
DECLARE
  rec RECORD;
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'attendance_server_only: storage.objects/buckets missing; verify the approved Supabase target';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'attendance_server_only: RLS is disabled on storage.objects';
  END IF;

  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) <> 2 THEN
    RAISE EXCEPTION 'attendance_server_only: expected Supabase roles anon and authenticated are missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'attendance_server_only: service_role is missing or lacks BYPASSRLS; the server would be denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'member-files' AND public = false) THEN
    RAISE EXCEPTION 'attendance_server_only: member-files bucket must exist and be private';
  END IF;

  -- Duplicate policy names are never replaced automatically.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'attendance_server_only'
  ) THEN
    RAISE EXCEPTION 'attendance_server_only: a policy with this name already exists; inspect pg_policies';
  END IF;

  -- Name-bearing companion tables must have RLS when they exist.
  FOR rec IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relkind IN ('r', 'p')
      AND c.relname IN ('prefixes', 's3_multipart_uploads', 's3_multipart_uploads_parts')
  LOOP
    IF NOT rec.relrowsecurity THEN
      RAISE EXCEPTION 'attendance_server_only: RLS is disabled on storage.%', rec.relname;
    END IF;
  END LOOP;

  -- A SECURITY DEFINER listing function runs as its owner and ignores the
  -- policies, so it could list attendance names. Supabase Storage itself ships
  -- SECURITY DEFINER prefix-maintenance helpers and triggers (Storage API
  -- 1.29.0 .. 1.88.0, verified on real stacks). They write storage.prefixes and
  -- return void/boolean/trigger, never object names, so they are allowed, but
  -- only by exact name + argument list + return type + owner. Any other match
  -- (new name, changed signature, other owner) still aborts the migration.
  FOR rec IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage' AND p.prosecdef
      AND (p.proname LIKE 'search%' OR p.proname LIKE 'list\_%' OR p.proname LIKE '%prefix%')
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
          ('add_prefixes',           '_bucket_id text, _name text',     'void'),
          ('delete_prefix',          '_bucket_id text, _name text',     'boolean'),
          ('delete_leaf_prefixes',   'bucket_ids text[], names text[]', 'void'),
          ('lock_top_prefixes',      'bucket_ids text[], names text[]', 'void'),
          ('prefixes_delete_cleanup', '',                               'trigger'),
          ('objects_delete_cleanup',  '',                               'trigger'),
          ('objects_update_cleanup',  '',                               'trigger')
        ) AS ok(proname, args, rettype)
        WHERE ok.proname = p.proname
          AND ok.args = pg_get_function_identity_arguments(p.oid)
          AND ok.rettype = p.prorettype::regtype::text
          AND pg_get_userbyid(p.proowner) = 'supabase_storage_admin'
      )
  LOOP
    RAISE EXCEPTION 'attendance_server_only: storage.%(%) owned by % is SECURITY DEFINER, not a known Supabase Storage helper, and can bypass the policy; review before migrating', rec.proname, rec.args, rec.owner;
  END LOOP;
END $$;

CREATE POLICY attendance_server_only
  ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'))
  WITH CHECK (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'));

DO $$
BEGIN
  IF to_regclass('storage.prefixes') IS NOT NULL THEN
    EXECUTE $policy$CREATE POLICY attendance_server_only
      ON storage.prefixes AS RESTRICTIVE FOR ALL TO PUBLIC
      USING (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'))
      WITH CHECK (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'))$policy$;
  ELSE
    RAISE NOTICE 'attendance_server_only: storage.prefixes not present on this Storage version; nothing to protect there';
  END IF;

  IF to_regclass('storage.s3_multipart_uploads') IS NOT NULL THEN
    EXECUTE $policy$CREATE POLICY attendance_server_only
      ON storage.s3_multipart_uploads AS RESTRICTIVE FOR ALL TO PUBLIC
      USING (bucket_id <> 'member-files' OR (key <> 'attendance' AND key NOT LIKE 'attendance/%'))
      WITH CHECK (bucket_id <> 'member-files' OR (key <> 'attendance' AND key NOT LIKE 'attendance/%'))$policy$;
  ELSE
    RAISE NOTICE 'attendance_server_only: storage.s3_multipart_uploads not present; nothing to protect there';
  END IF;

  IF to_regclass('storage.s3_multipart_uploads_parts') IS NOT NULL THEN
    EXECUTE $policy$CREATE POLICY attendance_server_only
      ON storage.s3_multipart_uploads_parts AS RESTRICTIVE FOR ALL TO PUBLIC
      USING (bucket_id <> 'member-files' OR (key <> 'attendance' AND key NOT LIKE 'attendance/%'))
      WITH CHECK (bucket_id <> 'member-files' OR (key <> 'attendance' AND key NOT LIKE 'attendance/%'))$policy$;
  ELSE
    RAISE NOTICE 'attendance_server_only: storage.s3_multipart_uploads_parts not present; nothing to protect there';
  END IF;
END $$;
