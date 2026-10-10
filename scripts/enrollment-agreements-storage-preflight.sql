-- Run against the explicitly approved preview target as the exact deployment
-- role BEFORE prisma migrate deploy. Read-only: never fixes grants or policies.
-- This checks authority/configuration, not future lock availability.
BEGIN READ ONLY;
DO $$
DECLARE
  objects_owner oid;
  objects_rls boolean;
  policy_authority boolean;
  configured_policy_grants text;
  policy_grants jsonb;
BEGIN
  SELECT relowner, relrowsecurity INTO objects_owner, objects_rls
    FROM pg_class WHERE oid = to_regclass('storage.objects');
  IF objects_owner IS NULL THEN
    RAISE EXCEPTION 'Enrollment preflight: storage.objects is missing; verify the approved Supabase target before migration';
  END IF;
  IF NOT objects_rls THEN
    RAISE EXCEPTION 'Enrollment preflight: storage.objects RLS is disabled; stop and resolve the storage security configuration';
  END IF;
  policy_authority := pg_has_role(current_user, objects_owner, 'USAGE')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper);
  IF NOT policy_authority THEN
    -- Hosted Supabase delegates policy DDL through its loaded supautils library
    -- without granting ownership of managed Storage tables. A user can invent a
    -- custom GUC, so current_setting alone is not evidence of that authority:
    -- require the library's registered, reload-only parameter and a preload.
    SELECT setting INTO configured_policy_grants FROM pg_catalog.pg_settings
      WHERE name = 'supautils.policy_grants' AND context = 'sighup' AND vartype = 'string';
    IF configured_policy_grants IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_settings
      WHERE name IN ('shared_preload_libraries', 'session_preload_libraries')
        AND setting ~ '(^|,)[[:space:]]*"?supautils"?[[:space:]]*(,|$)'
    ) THEN
      BEGIN
        policy_grants := configured_policy_grants::jsonb;
        IF jsonb_typeof(policy_grants) = 'object'
          AND jsonb_typeof(policy_grants -> current_user::text) = 'array' THEN
          policy_authority := (policy_grants -> current_user::text) @> '["storage.objects"]'::jsonb
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(policy_grants -> current_user::text) AS grant_entry(value)
              WHERE jsonb_typeof(value) <> 'string'
            );
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        policy_authority := false;
      END;
    END IF;
  END IF;
  IF NOT coalesce(policy_authority, false) THEN
    RAISE EXCEPTION 'Enrollment preflight: this deployment role cannot manage storage.objects policies; obtain approved Storage policy-management authority before running Prisma';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) <> 2 THEN
    RAISE EXCEPTION 'Enrollment preflight: expected Supabase browser roles are missing; verify the approved target';
  END IF;
END $$;
ROLLBACK;
