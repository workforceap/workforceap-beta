-- WAP-185: aggregate-only inventory. No DML, payload values or identities.
-- Authorized read lane only. Skip optional-table SELECTs when catalog says absent.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
FROM (VALUES ('enrollment_agreement_submissions'), ('billing_cases'),
             ('billing_artifacts')) AS tables(name);

SELECT 'workflow_diagnostics' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE workflow = 'email_send' AND status IN ('error', 'errored', 'failed')) AS failure_rows,
  count(*) FILTER (WHERE metadata ? 'templateParams') AS rows_with_replay_params,
  count(*) FILTER (WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days') AS older_than_default_source_window
FROM public.workflow_diagnostics;
SELECT 'email_failure_snapshots' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE metadata ? 'templateParams') AS rows_with_replay_params,
  count(*) FILTER (WHERE diagnostic_created_at < CURRENT_TIMESTAMP - INTERVAL '365 days') AS original_failure_older_than_year,
  count(*) FILTER (WHERE snapshot_at < CURRENT_TIMESTAMP - INTERVAL '365 days') AS beyond_existing_copy_window
FROM public.email_failure_snapshots;
SELECT 'applications' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE notes IS NOT NULL) AS rows_with_notes
FROM public.applications;
SELECT 'apply_eligibility_screenings' AS record_class, count(*) AS rows FROM public.apply_eligibility_screenings;
SELECT 'pre_screening_drafts' AS record_class, count(*) AS rows FROM public.pre_screening_drafts;
SELECT 'audit_logs' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE actor_email_snapshot IS NOT NULL) AS rows_with_actor_email
FROM public.audit_logs;
SELECT 'audit_events' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE ip IS NOT NULL OR ua IS NOT NULL) AS rows_with_request_context
FROM public.audit_events;
SELECT 'wioa_review_snapshots' AS record_class, count(*) AS rows FROM public.wioa_review_snapshots;
-- Optional tables: skip each SELECT if absent; no schema initialization.
SELECT 'enrollment_agreement_submissions' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE member_id IS NULL) AS detached_rows
FROM public.enrollment_agreement_submissions;
SELECT 'billing_cases' AS record_class, count(*) AS rows,
  count(*) FILTER (WHERE member_id IS NULL) AS detached_rows
FROM public.billing_cases;
SELECT 'billing_artifacts' AS record_class, count(*) AS rows,
  coalesce(sum(byte_length), 0) AS referenced_pdf_bytes
FROM public.billing_artifacts;
ROLLBACK;
