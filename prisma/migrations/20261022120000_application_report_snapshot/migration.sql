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
  IF NEW.application_report_snapshot IS NOT NULL THEN
    -- Serialize capture with deletion so a late report write cannot restore
    -- personal details after the deletion trigger has already cleared them.
    PERFORM 1 FROM users WHERE id = NEW.user_id AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Application reports require an active member' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.application_report_snapshot IS NOT NULL
     AND NEW.application_report_snapshot IS DISTINCT FROM OLD.application_report_snapshot
     AND NOT (
       NEW.application_report_snapshot IS NULL
       AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id AND deleted_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'Saved application reports cannot be replaced' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER application_report_snapshot_immutable
BEFORE INSERT OR UPDATE OF application_report_snapshot ON applications
FOR EACH ROW EXECUTE FUNCTION protect_application_report_snapshot();

-- Account anonymization already clears contact/profile information. Do not
-- leave a duplicate of those details in a newly introduced filing snapshot.
-- This trigger also covers deletion paths outside the shared anonymizer.
CREATE FUNCTION clear_deleted_member_application_reports() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE applications SET application_report_snapshot = NULL
  WHERE user_id = NEW.id AND application_report_snapshot IS NOT NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clear_deleted_member_application_reports
AFTER UPDATE OF deleted_at ON users
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_deleted_member_application_reports();
COMMIT;
