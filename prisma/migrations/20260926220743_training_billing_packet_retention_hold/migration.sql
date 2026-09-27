-- Preserve issued J5/J6 packets (and send history) when a member or signer
-- account is erased, without keeping those accounts or unrelated child data.
-- Historical IDs support scoped archive and audit after both live FKs detach.
-- The signed snapshot still retains issued names and recipient addresses;
-- its retention/disposal policy needs separate approval.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.training_billing_packets
  ADD COLUMN IF NOT EXISTS subject_member_id TEXT,
  ADD COLUMN IF NOT EXISTS signed_by_subject_id TEXT;

-- Vercel applies migrations while the preceding application revision is still
-- serving. Its packet-create route supplies member_id and signed_by_id but not
-- these new historical columns. Fill them before enforcing NOT NULL so packet
-- signing remains available throughout the build and deployment overlap.
CREATE OR REPLACE FUNCTION public.backfill_billing_packet_subject_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  NEW.subject_member_id := COALESCE(NEW.subject_member_id, NEW.member_id);
  NEW.signed_by_subject_id := COALESCE(NEW.signed_by_subject_id, NEW.signed_by_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.backfill_billing_packet_subject_ids() FROM PUBLIC;
DROP TRIGGER IF EXISTS backfill_billing_packet_subject_ids ON public.training_billing_packets;
CREATE TRIGGER backfill_billing_packet_subject_ids
  BEFORE INSERT ON public.training_billing_packets
  FOR EACH ROW EXECUTE FUNCTION public.backfill_billing_packet_subject_ids();

UPDATE public.training_billing_packets
  SET subject_member_id = COALESCE(subject_member_id, member_id),
      signed_by_subject_id = COALESCE(signed_by_subject_id, signed_by_id)
  WHERE subject_member_id IS NULL OR signed_by_subject_id IS NULL;
ALTER TABLE public.training_billing_packets
  ALTER COLUMN subject_member_id SET NOT NULL,
  ALTER COLUMN signed_by_subject_id SET NOT NULL,
  ALTER COLUMN member_id DROP NOT NULL,
  ALTER COLUMN signed_by_id DROP NOT NULL;

ALTER TABLE public.training_billing_packets
  DROP CONSTRAINT IF EXISTS training_billing_packets_member_id_fkey;
ALTER TABLE public.training_billing_packets
  ADD CONSTRAINT training_billing_packets_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.training_billing_packets
  DROP CONSTRAINT IF EXISTS training_billing_packets_signed_by_id_fkey;
ALTER TABLE public.training_billing_packets
  ADD CONSTRAINT training_billing_packets_signed_by_id_fkey
  FOREIGN KEY (signed_by_id) REFERENCES public.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS training_billing_packets_org_subject_created_idx
  ON public.training_billing_packets (organization_id, subject_member_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.protect_billing_packet_subject_ids()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subject_member_id IS DISTINCT FROM OLD.subject_member_id
     OR NEW.signed_by_subject_id IS DISTINCT FROM OLD.signed_by_subject_id THEN
    RAISE EXCEPTION 'billing packet historical identities are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_billing_packet_subject_ids() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_billing_packet_subject_ids ON public.training_billing_packets;
CREATE TRIGGER protect_billing_packet_subject_ids
  BEFORE UPDATE OF subject_member_id, signed_by_subject_id ON public.training_billing_packets
  FOR EACH ROW EXECUTE FUNCTION public.protect_billing_packet_subject_ids();

COMMIT;
