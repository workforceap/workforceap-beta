-- Preserve signed J5/J6 packets (and their send history) when an account is
-- hard-deleted. All packet rows are signed at creation. This is a hold until
-- the financial-record retention period and disposal process are approved.
-- It does not anonymize the signed snapshot, which retains the issued name
-- and recipient addresses by design.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_billing_packets_member_id_fkey'
      AND conrelid = 'public.training_billing_packets'::regclass
      AND confrelid = 'public.users'::regclass
      AND confdeltype = 'r'
  ) THEN
    ALTER TABLE public.training_billing_packets
      DROP CONSTRAINT IF EXISTS training_billing_packets_member_id_fkey;
    ALTER TABLE public.training_billing_packets
      ADD CONSTRAINT training_billing_packets_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES public.users(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
