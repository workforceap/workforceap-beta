-- WAP-36 phase 2 prep: persist aggregated CSP violation reports.
--
-- `/api/csp-report` (the Report-Only sink from phase 1) so far only logged one
-- `csp.violation` line per batch. This table keeps an hourly aggregate of the
-- same PII-free facts so the soak can be triaged in `/admin/csp-report` before
-- the enforce flip (docs/SECURITY-HARDENING.md §13): one row per
-- (hour_bucket, directive, blocked_host, document_path, disposition) with a
-- `count` the sink increments via INSERT ... ON CONFLICT (Prisma upsert on
-- the unique key). Never a raw URL, query string, script sample, user agent,
-- IP address or user id — `document_path` is the already-redacted route path
-- (`/admin/members/:id`) from lib/security/cspReport.ts.
--
-- Platform-wide on purpose: there is no organization_id / tenant column. The
-- CSP policy is set once per deployment in middleware.ts, so a violation is a
-- fact about the deployment, not about any organization's data.
--
-- RLS: enabled, and a SELECT policy for the `super_admin` GUC role (the same
-- helper the 20260513040000 policies use) so a forced-RLS future only exposes
-- the rows to the super-admin viewer. No INSERT/UPDATE policy: the sink runs
-- without a session and writes as the table owner, like the other log-like
-- tables (`email_failure_snapshots`: "RLS on, no policies"). The policy is
-- created only when the helper function exists so a fresh `db push`
-- environment (no RLS migration replayed) still applies cleanly.
--
-- Retention: lib/retention/config.ts purges rows whose hour_bucket is older
-- than CSP_VIOLATION_BUCKET_RETENTION_DAYS (30) in the daily data_cleanup cron.
--
-- Additive and idempotent: IF NOT EXISTS everywhere. Reversible by the "Down"
-- block at the end.

CREATE TABLE IF NOT EXISTS "csp_violation_buckets" (
  "id" TEXT NOT NULL,
  "hour_bucket" TIMESTAMPTZ(6) NOT NULL,
  "directive" TEXT NOT NULL,
  "blocked_host" TEXT,
  "document_path" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "csp_violation_buckets_pkey" PRIMARY KEY ("id")
);

-- The upsert key. Explicit short name (`map:` in schema.prisma) because the
-- Prisma default would exceed PostgreSQL's 63-character identifier limit.
CREATE UNIQUE INDEX IF NOT EXISTS "csp_violation_buckets_bucket_key"
  ON "csp_violation_buckets"("hour_bucket", "directive", "blocked_host", "document_path", "disposition");

-- Viewer window (last 24h / 7d) and retention purge both range on hour_bucket.
CREATE INDEX IF NOT EXISTS "csp_violation_buckets_hour_bucket_idx"
  ON "csp_violation_buckets"("hour_bucket");

ALTER TABLE "csp_violation_buckets" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regproc('public.is_current_super_admin') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'csp_violation_buckets'
         AND policyname = 'csp_violation_buckets_select_super_admin'
     ) THEN
    CREATE POLICY "csp_violation_buckets_select_super_admin"
      ON "csp_violation_buckets" FOR SELECT
      USING (is_current_super_admin());
  END IF;
END $$;

-- Down (manual; aggregate counts only, nothing else references the table):
--   DROP POLICY IF EXISTS "csp_violation_buckets_select_super_admin" ON "csp_violation_buckets";
--   DROP INDEX IF EXISTS "csp_violation_buckets_hour_bucket_idx";
--   DROP INDEX IF EXISTS "csp_violation_buckets_bucket_key";
--   DROP TABLE IF EXISTS "csp_violation_buckets";
