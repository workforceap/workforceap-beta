-- Nullable, no backfill/table rewrite. Existing applications are captured only
-- when authorized staff explicitly request their report.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "applications" ADD COLUMN "application_report_snapshot" JSONB;
-- A saved filing copy must not change when profile/screening/status changes.
CREATE FUNCTION protect_application_report_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.application_report_snapshot IS NOT NULL
     AND NEW.application_report_snapshot IS DISTINCT FROM OLD.application_report_snapshot THEN
    RAISE EXCEPTION 'Saved application reports cannot be replaced' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER application_report_snapshot_immutable
BEFORE UPDATE OF application_report_snapshot ON applications
FOR EACH ROW EXECUTE FUNCTION protect_application_report_snapshot();
COMMIT;
