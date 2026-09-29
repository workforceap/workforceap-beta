-- The designated signer's approved signature image (billing_signer_signature_assets,
-- migration 20260927230000) is a PNG kept in the same private `billing-finance`
-- bucket, under signature/{organization_id}/{signer_user_id}/{sha256}.png. The bucket
-- provisioned by 20260927232204_billing_finance_private_bucket accepts PDFs only,
-- so Storage would reject that PNG and every J5/J6 signature would fail closed.
--
-- This adds image/png to the bucket's MIME allowlist and changes nothing else: the
-- bucket stays private with the same 10 MiB limit, and no Storage policy or browser
-- grant is created. The database CHECKs on billing_signer_signature_assets keep the
-- PNG's bucket and key exact, and the server is the only writer (service role).
--
-- Order: this migration follows 20260927232204. It refuses to run against a bucket
-- that is missing or is not in exactly the state that migration leaves it in.

DO $$
DECLARE
  existing_bucket RECORD;
  current_types text[];
  pdf_only CONSTANT text[] := ARRAY['application/pdf']::text[];
  pdf_and_png CONSTANT text[] := ARRAY['application/pdf', 'image/png']::text[];
BEGIN
  -- The same review gate as the bucket migration: Storage RLS on, and no Storage
  -- policy of any kind, so the bucket stays reachable by the server only.
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

  -- Serialize a possible concurrent rerun before reading the bucket.
  PERFORM pg_advisory_xact_lock(20260928140000::bigint);

  SELECT id, name, public, file_size_limit, allowed_mime_types
    INTO existing_bucket
    FROM storage.buckets
    WHERE id = 'billing-finance'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing-finance bucket is missing: apply 20260927232204_billing_finance_private_bucket first';
  END IF;

  IF existing_bucket.name IS DISTINCT FROM 'billing-finance'
     OR existing_bucket.public IS DISTINCT FROM false
     OR existing_bucket.file_size_limit IS DISTINCT FROM 10485760 THEN
    RAISE EXCEPTION 'billing-finance bucket exists with conflicting privacy or upload settings';
  END IF;

  current_types := ARRAY(
    SELECT mime FROM unnest(existing_bucket.allowed_mime_types) AS u(mime)
    ORDER BY mime
  );

  -- Already allows exactly PDF and PNG: nothing to do (a rerun).
  IF current_types IS NOT DISTINCT FROM pdf_and_png THEN
    RETURN;
  END IF;

  -- Any other allowlist is not the state the bucket migration leaves: do not guess.
  IF current_types IS DISTINCT FROM pdf_only THEN
    RAISE EXCEPTION 'billing-finance bucket has unexpected allowed MIME types';
  END IF;

  UPDATE storage.buckets
     SET allowed_mime_types = pdf_and_png
   WHERE id = 'billing-finance';
END $$;

-- Rollback is intentionally manual: it is safe only while no signature image has
-- been uploaded. Set allowed_mime_types back to ARRAY['application/pdf'] after
-- confirming the signature/ prefix holds no object that still has to be read.
