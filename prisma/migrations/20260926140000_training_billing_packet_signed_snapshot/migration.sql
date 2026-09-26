-- J5/J6 packets (docs/BILLING-PACKETS.md). Production had no packet rows when
-- this shipped, so nothing needs a backfill. Additive and idempotent
-- (IF NOT EXISTS, guarded constraint and REVOKE), in one transaction like
-- 20260920210000_add_advisor_session_notes.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

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
CREATE INDEX IF NOT EXISTS "training_billing_packets_organization_id_member_id_funding__idx"
  ON "training_billing_packets" ("organization_id", "member_id", "funding_attestation_key");

-- One row per recipient per send attempt. The unique key is the atomic claim;
-- claim_token is rotated on every claim/reconciliation and every final
-- transition compare-and-sets on it.
CREATE TABLE IF NOT EXISTS "training_billing_packet_sends" (
  "id"               TEXT NOT NULL,
  "packet_id"        TEXT NOT NULL,
  "attempt_no"       INTEGER NOT NULL,
  "recipient"        TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "cc"               TEXT,
  "idempotency_key"  TEXT NOT NULL,
  "status"           TEXT NOT NULL,
  "claim_token"      TEXT NOT NULL,
  "claimed_at"       TIMESTAMP(3) NOT NULL,
  "last_claimed_at"  TIMESTAMP(3) NOT NULL,
  "sent_at"          TIMESTAMP(3),
  "last_error"       TEXT,
  "reconciled_by_id" TEXT,
  "reconciled_at"    TIMESTAMP(3),
  "reconcile_note"   TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "training_billing_packet_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_billing_packet_sends_packet_id_attempt_no_recipien_key"
  ON "training_billing_packet_sends" ("packet_id", "attempt_no", "recipient");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_billing_packet_sends_packet_id_fkey') THEN
    ALTER TABLE "training_billing_packet_sends"
      ADD CONSTRAINT "training_billing_packet_sends_packet_id_fkey"
      FOREIGN KEY ("packet_id") REFERENCES "training_billing_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Holds recipient addresses and provider errors. Written and read only by the
-- server-side Prisma client (table owner) after the parent packet's admin and
-- tenant checks; tenant is inherited via packet_id. RLS on with no policies
-- (ENABLE only; FORCE is deferred repo-wide by
-- 20260514000000_defer_rls_force_authorize_system), and the Supabase browser
-- roles get no table grants.
ALTER TABLE "training_billing_packet_sends" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "training_billing_packet_sends" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "training_billing_packet_sends" FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Down (manual):
--   DROP TABLE IF EXISTS "training_billing_packet_sends";
--   DROP INDEX IF EXISTS "training_billing_packets_organization_id_member_id_funding__idx";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "funding_attestation_key";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "send_attempt";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "send_attempt_no";
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "signed_snapshot";
