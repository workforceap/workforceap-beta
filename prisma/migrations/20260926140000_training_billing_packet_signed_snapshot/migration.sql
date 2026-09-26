-- J5/J6 packets: freeze provider/member/program identity, pricing source and
-- the signer's recorded funding approval at signing, so a signed PDF never
-- re-renders from later edits. Nullable: rows signed before this column fall
-- back to live values (production had none when this shipped).
ALTER TABLE "training_billing_packets" ADD COLUMN IF NOT EXISTS "signed_snapshot" JSONB;

-- Down (manual):
--   ALTER TABLE "training_billing_packets" DROP COLUMN IF EXISTS "signed_snapshot";
