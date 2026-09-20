-- Preserved copy of `email_send` failure rows from workflow_diagnostics, whose
-- 90-day retention purge (07:30 UTC daily) removes more of the only record of
-- the 2026 failed outbound emails every day. Additive: nothing else changes.
-- Rows are copied by scripts/snapshot-email-failures.ts, idempotent on
-- source_diagnostic_id. No foreign keys, so the evidence outlives the actor
-- and the source row. RLS on, no policies: service-role access only.
CREATE TABLE IF NOT EXISTS "email_failure_snapshots" (
  "id" TEXT NOT NULL,
  "source_diagnostic_id" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "summary" TEXT NOT NULL,
  "provider" TEXT,
  "method" TEXT,
  "fallback_path" TEXT,
  "failure_reason" TEXT,
  "metadata" JSONB,
  "template_key" TEXT,
  "error_class" TEXT NOT NULL,
  "retryable" BOOLEAN NOT NULL,
  "recipient_hash" TEXT,
  "recipient_domain" TEXT,
  "diagnostic_created_at" TIMESTAMP(3) NOT NULL,
  "snapshot_run" TEXT NOT NULL,
  "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_failure_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_failure_snapshots_source_diagnostic_id_key"
  ON "email_failure_snapshots"("source_diagnostic_id");
CREATE INDEX IF NOT EXISTS "email_failure_snapshots_diagnostic_created_at_idx"
  ON "email_failure_snapshots"("diagnostic_created_at");
CREATE INDEX IF NOT EXISTS "email_failure_snapshots_template_key_diagnostic_created_at_idx"
  ON "email_failure_snapshots"("template_key", "diagnostic_created_at");
CREATE INDEX IF NOT EXISTS "email_failure_snapshots_snapshot_at_idx"
  ON "email_failure_snapshots"("snapshot_at");

ALTER TABLE "email_failure_snapshots" ENABLE ROW LEVEL SECURITY;
