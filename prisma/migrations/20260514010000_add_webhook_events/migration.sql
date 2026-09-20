-- Adds the `webhook_events` table that backs the Prisma `WebhookEvent`
-- model. This PR (#1188) added the model + a retention page/API that
-- calls `prisma.webhookEvent.findMany`, but no CREATE TABLE migration
-- was committed. Without this migration, deploying via
-- `prisma migrate deploy` produces a generated client that exposes the
-- delegate while the table is absent — the retention page 500s with a
-- missing-relation error.
--
-- Mirrors the Prisma model field-for-field. Idempotent (IF NOT EXISTS
-- on the table and all five indexes) so it's safe to apply in any env.

CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event_type" TEXT,
    "event_id" TEXT,
    "payload_size" INTEGER NOT NULL,
    "processing_time_ms" INTEGER,
    "status" TEXT NOT NULL,
    "http_status_code" INTEGER,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_events_source_idx"
  ON "webhook_events" ("source");

CREATE INDEX IF NOT EXISTS "webhook_events_status_idx"
  ON "webhook_events" ("status");

CREATE INDEX IF NOT EXISTS "webhook_events_created_at_idx"
  ON "webhook_events" ("created_at");

CREATE INDEX IF NOT EXISTS "webhook_events_next_retry_at_idx"
  ON "webhook_events" ("next_retry_at");

CREATE INDEX IF NOT EXISTS "webhook_events_event_id_idx"
  ON "webhook_events" ("event_id");

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS "webhook_events";
