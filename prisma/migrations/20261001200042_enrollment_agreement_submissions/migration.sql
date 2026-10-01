-- Private student agreement revisions; no existing enrollments or billing dates change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Persistent fences span storage calls as well as SQL. Never expire/reclaim an
-- upload fence by elapsed time: an ambiguous upload needs hash reconciliation.
CREATE TABLE "enrollment_agreement_operation_locks" (
  "member_id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "state" TEXT NOT NULL CHECK ("state" IN ('upload', 'erasure', 'account_restore')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enrollment_agreement_operation_locks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "enrollment_agreement_operation_locks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "enrollment_agreement_operation_locks_organization_id_idx" ON "enrollment_agreement_operation_locks"("organization_id");
ALTER TABLE "enrollment_agreement_operation_locks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "enrollment_agreement_operation_locks" FROM PUBLIC;
CREATE TABLE "enrollment_agreement_submissions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "template_version" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" VARCHAR(1000),
  CONSTRAINT "enrollment_agreement_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollment_agreement_status_check" CHECK ("status" IN ('pending', 'verified', 'needs_correction')),
  CONSTRAINT "enrollment_agreement_template_check" CHECK ("template_version" IN ('2026-09-30', 'previous')),
  CONSTRAINT "enrollment_agreement_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 4128768),
  CONSTRAINT "enrollment_agreement_hash_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "enrollment_agreement_review_check" CHECK (
    ("status" = 'pending' AND "reviewed_at" IS NULL AND "reviewed_by_user_id" IS NULL AND "review_note" IS NULL)
    OR ("status" <> 'pending' AND "reviewed_at" IS NOT NULL)
  ),
  CONSTRAINT "enrollment_agreement_no_self_review" CHECK ("reviewed_by_user_id" IS NULL OR "reviewed_by_user_id" <> "member_id"),
  CONSTRAINT "enrollment_agreement_correction_check" CHECK ("status" <> 'needs_correction' OR coalesce(length(btrim("review_note")) > 0, false)),
  CONSTRAINT "enrollment_agreement_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "enrollment_agreement_submissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "enrollment_agreement_submissions_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "enrollment_agreement_submissions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "enrollment_agreement_submissions_storage_path_key" ON "enrollment_agreement_submissions"("storage_path");
CREATE UNIQUE INDEX "enrollment_agreement_one_current_per_member" ON "enrollment_agreement_submissions"("member_id") WHERE "is_current";
CREATE INDEX "enrollment_agreement_submissions_organization_id_status_is__idx" ON "enrollment_agreement_submissions"("organization_id", "status", "is_current");
CREATE INDEX "enrollment_agreement_submissions_member_id_uploaded_at_idx" ON "enrollment_agreement_submissions"("member_id", "uploaded_at" DESC);
CREATE INDEX "enrollment_agreement_submissions_uploaded_by_user_id_idx" ON "enrollment_agreement_submissions"("uploaded_by_user_id");
CREATE INDEX "enrollment_agreement_submissions_reviewed_by_user_id_idx" ON "enrollment_agreement_submissions"("reviewed_by_user_id");

-- Access is server-only through authenticated, tenant-scoped routes. Do not add
-- browser grants or permissive RLS policies; Prisma's table-owner connection is
-- intentionally the only application data path.
ALTER TABLE "enrollment_agreement_submissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "enrollment_agreement_submissions" FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.enrollment_agreement_submissions FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON TABLE public.enrollment_agreement_operation_locks FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

-- Defense in depth against an existing broad member-files Storage policy.
-- Only this prefix is affected. Server service-role access still uses the
-- authenticated application routes; no public bucket/URL or JWT path is added.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE $policy$CREATE POLICY enrollment_agreements_server_only
      ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id <> 'member-files' OR name NOT LIKE 'enrollment-agreements/%')
      WITH CHECK (bucket_id <> 'member-files' OR name NOT LIKE 'enrollment-agreements/%')$policy$;
  END IF;
END $$;

CREATE FUNCTION public.enrollment_agreement_guard_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.member_id AND organization_id = NEW.organization_id AND deleted_at IS NULL)
      OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.uploaded_by_user_id AND organization_id = NEW.organization_id AND deleted_at IS NULL)
      OR NEW.status <> 'pending' OR NOT NEW.is_current THEN
      RAISE EXCEPTION 'Invalid enrollment agreement ownership or initial state' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF ROW(NEW.id, NEW.organization_id, NEW.member_id, NEW.storage_path, NEW.sha256, NEW.size_bytes, NEW.template_version, NEW.uploaded_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.member_id, OLD.storage_path, OLD.sha256, OLD.size_bytes, OLD.template_version, OLD.uploaded_at)
      OR (NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id AND NEW.uploaded_by_user_id IS NOT NULL)
      OR (NOT OLD.is_current AND NEW.is_current) THEN
      RAISE EXCEPTION 'Enrollment agreement evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.status, NEW.reviewed_at, NEW.review_note) IS DISTINCT FROM ROW(OLD.status, OLD.reviewed_at, OLD.review_note)
      OR (NEW.reviewed_by_user_id IS DISTINCT FROM OLD.reviewed_by_user_id AND NEW.reviewed_by_user_id IS NOT NULL) THEN
      IF OLD.status <> 'pending' OR NOT OLD.is_current OR NOT NEW.is_current OR NEW.status = 'pending'
        OR NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_by_user_id = NEW.member_id
        OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.reviewed_by_user_id AND organization_id = NEW.organization_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Invalid enrollment agreement review' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enrollment_agreement_guard_revision() FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.enrollment_agreement_guard_revision() FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
CREATE TRIGGER enrollment_agreement_immutable_revision BEFORE INSERT OR UPDATE ON public.enrollment_agreement_submissions
FOR EACH ROW EXECUTE FUNCTION public.enrollment_agreement_guard_revision();
COMMIT;
