-- Run against the explicitly approved preview target as the exact deployment
-- role BEFORE prisma migrate deploy. Read-only: never fixes grants or policies.
-- This checks authority/configuration, not future lock availability.
BEGIN READ ONLY;
DO $$
DECLARE
  objects_owner oid;
  objects_rls boolean;
BEGIN
  SELECT relowner, relrowsecurity INTO objects_owner, objects_rls
    FROM pg_class WHERE oid = to_regclass('storage.objects');
  IF objects_owner IS NULL THEN
    RAISE EXCEPTION 'Enrollment preflight: storage.objects is missing; verify the approved Supabase target before migration';
  END IF;
  IF NOT objects_rls THEN
    RAISE EXCEPTION 'Enrollment preflight: storage.objects RLS is disabled; stop and resolve the storage security configuration';
  END IF;
  IF NOT (pg_has_role(current_user, objects_owner, 'USAGE')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)) THEN
    RAISE EXCEPTION 'Enrollment preflight: this deployment role cannot manage storage.objects policies; obtain approved table-owner migration authority before running Prisma';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) <> 2 THEN
    RAISE EXCEPTION 'Enrollment preflight: expected Supabase browser roles are missing; verify the approved target';
  END IF;
END $$;
ROLLBACK;
