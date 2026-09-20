-- Email send log (email delivery audit 2026-09-20, PR3). One row per provider
-- send attempt keyed by a dedupe key, carrying the provider's message id so the
-- Resend webhook can record delivered / bounced / complained against it.
-- Additive: nothing reads this table until lib/email/send.ts writes it.
CREATE TABLE IF NOT EXISTS "email_send_logs" (
  "id" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "template_key" TEXT,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "provider_message_id" TEXT,
  "idempotency_key" TEXT,
  "recipient_hash" TEXT,
  "recipient_domain" TEXT,
  "recipient_count" INTEGER NOT NULL DEFAULT 1,
  "subject" TEXT,
  "user_id" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "skip_reason" TEXT,
  "failure_reason" TEXT,
  "failure_class" TEXT,
  "last_event" TEXT,
  "last_event_at" TIMESTAMP(3),
  "bounce_type" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_send_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_send_logs_status_check" CHECK ("status" IN ('skipped', 'sending', 'sent', 'failed')),
  CONSTRAINT "email_send_logs_recipient_count_check" CHECK ("recipient_count" >= 1),
  CONSTRAINT "email_send_logs_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_send_logs_dedupe_key_key" ON "email_send_logs"("dedupe_key");
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_logs_provider_message_id_key" ON "email_send_logs"("provider_message_id");
CREATE INDEX IF NOT EXISTS "email_send_logs_status_created_at_idx" ON "email_send_logs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "email_send_logs_template_key_created_at_idx" ON "email_send_logs"("template_key", "created_at");
CREATE INDEX IF NOT EXISTS "email_send_logs_user_id_idx" ON "email_send_logs"("user_id");
CREATE INDEX IF NOT EXISTS "email_send_logs_recipient_hash_created_at_idx" ON "email_send_logs"("recipient_hash", "created_at");
CREATE INDEX IF NOT EXISTS "email_send_logs_last_event_last_event_at_idx" ON "email_send_logs"("last_event", "last_event_at");
CREATE INDEX IF NOT EXISTS "email_send_logs_created_at_idx" ON "email_send_logs"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_send_logs_user_id_fkey') THEN
    ALTER TABLE "email_send_logs"
      ADD CONSTRAINT "email_send_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Operational log written only through the server-side Prisma client. RLS is
-- enabled with no policies so no other role can read recipient hashes or
-- subjects; the service connection is the table owner and is not restricted.
ALTER TABLE "email_send_logs" ENABLE ROW LEVEL SECURITY;
