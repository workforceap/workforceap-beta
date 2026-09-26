-- J5/J6 account-deletion barrier. Set before Storage cleanup, under the
-- member lifecycle advisory lock. A pending value blocks signing and send
-- claims; it survives a partial Storage failure so an admin can retry safely.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_deletion_pending_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS billing_deletion_operation_id UUID,
  ADD COLUMN IF NOT EXISTS billing_deletion_completed_at TIMESTAMP(3);

-- Browser roles can update their own users row in some deployments. Prevent
-- a direct Data API write from clearing or forging the server-only barrier.
CREATE OR REPLACE FUNCTION public.protect_billing_deletion_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.billing_deletion_pending_at IS DISTINCT FROM OLD.billing_deletion_pending_at
       OR NEW.billing_deletion_operation_id IS DISTINCT FROM OLD.billing_deletion_operation_id
       OR NEW.billing_deletion_completed_at IS DISTINCT FROM OLD.billing_deletion_completed_at) THEN
    RAISE EXCEPTION 'billing deletion state is server managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_billing_deletion_pending() FROM PUBLIC;
DROP TRIGGER IF EXISTS protect_billing_deletion_pending ON public.users;
CREATE TRIGGER protect_billing_deletion_pending
  BEFORE UPDATE OF billing_deletion_pending_at, billing_deletion_operation_id, billing_deletion_completed_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_billing_deletion_pending();

COMMIT;
