-- J5/J6 packets (docs/BILLING-PACKETS.md). Production had no packet rows when
-- this shipped, so nothing needs a backfill.
--
-- signed_snapshot: everything the signed PDFs and send recipients come from,
-- frozen at signing. Nullable: NULL marks a legacy row signed before it existed.
ALTER TABLE "training_billing_packets" ADD COLUMN IF NOT EXISTS "signed_snapshot" JSONB;
-- Current send attempt and the inputs frozen when it started (from, branding, cc).
ALTER TABLE "training_billing_packets" ADD COLUMN IF NOT EXISTS "send_attempt_no" INTEGER;
ALTER TABLE "training_billing_packets" ADD COLUMN IF NOT EXISTS "send_attempt" JSONB;

-- "<funding basis>:<normalized reference>" from the staff attestation. Sign
-- time refuses a second signed/sent packet for the same member and key, under
-- a transaction-scoped advisory lock (no unique index: a cohort contract may
-- legitimately cover several members).
ALTER TABLE "training_billing_packets" ADD COLUMN IF NOT EXISTS "funding_attestation_key" TEXT;
CREATE INDEX IF NOT EXISTS "training_billing_packets_org_member_funding_key_idx"
  ON "training_billing_packets" ("organization_id", "member_id", "funding_attestation_key");

-- One row per recipient per send attempt. The unique key is the atomic claim.
CREATE TABLE IF NOT EXISTS "training_billing_packet_sends" (
  "id"               TEXT NOT NULL,
  "packet_id"        TEXT NOT NULL,
  "attempt_no"       INTEGER NOT NULL,
  "recipient"        TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "cc"               TEXT,
  "idempotency_key"  TEXT NOT NULL,
  "status"           TEXT NOT NULL,
  "claimed_at"       TIMESTAMP(3) NOT NULL,
  "last_claimed_at"  TIMESTAMP(3) NOT NULL,
  "sent_at"          TIMESTAMP(3),
  "last_error"       TEXT,
  "reconciled_by_id" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "training_billing_packet_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_billing_packet_sends_packet_id_attempt_no_recipient_key"
  ON "training_billing_packet_sends" ("packet_id", "attempt_no", "recipient");

ALTER TABLE "training_billing_packet_sends"
  ADD CONSTRAINT "training_billing_packet_sends_packet_id_fkey"
  FOREIGN KEY ("packet_id") REFERENCES "training_billing_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Down (manual):
--   DROP TABLE IF EXISTS "training_billing_packet_sends";
--   DROP INDEX IF EXISTS "training_billing_packets_org_member_funding_key_idx";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "funding_attestation_key";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "send_attempt";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "send_attempt_no";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "signed_snapshot";
