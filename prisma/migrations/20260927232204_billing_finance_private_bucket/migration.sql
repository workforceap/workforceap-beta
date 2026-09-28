-- Signed J5/J6 documents and board vouchers are financial records. Keep them
-- outside member self-service buckets, whose user-erasure paths can remove
-- objects. Only the server-side Storage client may access this private bucket.
--
-- 10 MiB per object accommodates scanned, signed voucher PDFs while bounding
-- uploads. The current artifact schema and exact-byte archive accept PDFs only.
-- No Storage policy or browser grant is created by this migration.

DO $$
DECLARE
  existing_bucket RECORD;
  expected_mime_types CONSTANT text[] := ARRAY['application/pdf']::text[];
BEGIN
  -- Supabase private buckets still rely on Storage RLS for API operations.
  -- Current projects have RLS enabled and no Storage policies. If that drifts,
  -- every policy (including one for a role inherited by browser roles) needs
  -- explicit review before financial documents can be introduced.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'buckets'
      AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'billing-finance requires RLS on storage.buckets and storage.objects';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename IN ('buckets', 'objects')
  ) THEN
    RAISE EXCEPTION 'billing-finance requires review of existing Storage policies';
  END IF;

  -- Serialize a possible concurrent rerun before checking for the bucket.
  PERFORM pg_advisory_xact_lock(20260927232204::bigint);

  SELECT id, name, public, file_size_limit, allowed_mime_types
    INTO existing_bucket
    FROM storage.buckets
    WHERE id = 'billing-finance'
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO storage.buckets
      (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('billing-finance', 'billing-finance', false, 10485760, expected_mime_types);
  ELSIF existing_bucket.name IS DISTINCT FROM 'billing-finance'
     OR existing_bucket.public IS DISTINCT FROM false
     OR existing_bucket.file_size_limit IS DISTINCT FROM 10485760
     OR ARRAY(
          SELECT mime FROM unnest(existing_bucket.allowed_mime_types) AS u(mime)
          ORDER BY mime
        ) IS DISTINCT FROM expected_mime_types THEN
    RAISE EXCEPTION 'billing-finance bucket exists with conflicting privacy or upload settings';
  END IF;
END $$;

-- Rollback is intentionally manual: confirm all retained billing objects have
-- been migrated and their retention obligations met before deleting a bucket.
