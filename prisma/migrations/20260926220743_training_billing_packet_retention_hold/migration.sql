-- Preserve issued J5/J6 packets (and send history) when an account is erased,
-- without keeping the account or its unrelated child data past retention.
-- The immutable subject_member_id supports tenant-scoped archive lookup after
-- member_id is nulled. The signed snapshot still retains the issued name and
-- recipient addresses; its retention/disposal policy needs separate approval.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.training_billing_packets
  ADD COLUMN IF NOT EXISTS subject_member_id TEXT;
UPDATE public.training_billing_packets
  SET subject_member_id = member_id
  WHERE subject_member_id IS NULL;
ALTER TABLE public.training_billing_packets
  ALTER COLUMN subject_member_id SET NOT NULL,
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.training_billing_packets
  DROP CONSTRAINT IF EXISTS training_billing_packets_member_id_fkey;
ALTER TABLE public.training_billing_packets
  ADD CONSTRAINT training_billing_packets_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS training_billing_packets_org_subject_created_idx
  ON public.training_billing_packets (organization_id, subject_member_id, created_at DESC);

COMMIT;
