-- Forward repair for databases that applied an earlier form of the member
-- external-effect claim migration. Also installs the packet insert compatibility
-- trigger if the retention migration ran before it acquired that trigger.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.member_external_effect_claims
  ADD COLUMN IF NOT EXISTS provider_idempotency_key TEXT,
  ALTER COLUMN updated_at DROP DEFAULT;

-- The first published shape admitted storage and notification only. Later
-- code needs email claims with a durable provider key. Keep existing rows;
-- never invent a key for an in-flight email whose delivery may be uncertain.
ALTER TABLE public.member_external_effect_claims
  DROP CONSTRAINT IF EXISTS member_external_effect_claims_kind_check;
ALTER TABLE public.member_external_effect_claims
  ADD CONSTRAINT member_external_effect_claims_kind_check
  CHECK (kind IN ('storage', 'notification', 'email'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.member_external_effect_claims
    WHERE kind = 'email'
      AND NULLIF(BTRIM(provider_idempotency_key), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing email claims lack a provider key; reconcile them before this migration'
      USING ERRCODE = '23514';
  END IF;
END $$;
ALTER TABLE public.member_external_effect_claims
  DROP CONSTRAINT IF EXISTS member_external_effect_claims_email_key_check;
ALTER TABLE public.member_external_effect_claims
  ADD CONSTRAINT member_external_effect_claims_email_key_check
  CHECK (kind <> 'email' OR NULLIF(BTRIM(provider_idempotency_key), '') IS NOT NULL);

ALTER TABLE public.member_external_effect_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_external_effect_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.training_billing_packets FROM PUBLIC;
REVOKE ALL ON TABLE public.training_billing_packet_sends FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.member_external_effect_claims FROM anon;
    REVOKE ALL ON TABLE public.training_billing_packets FROM anon;
    REVOKE ALL ON TABLE public.training_billing_packet_sends FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.member_external_effect_claims FROM authenticated;
    REVOKE ALL ON TABLE public.training_billing_packets FROM authenticated;
    REVOKE ALL ON TABLE public.training_billing_packet_sends FROM authenticated;
  END IF;
END $$;

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

COMMIT;
