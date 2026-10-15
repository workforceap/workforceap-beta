-- Additive: retain previous results on the member, outside diagnostic retention.
ALTER TABLE users
  ADD COLUMN assessment_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN assessment_retake_requested_at TIMESTAMP(3),
  ADD COLUMN assessment_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Both historical reset writers are included. Repeated archives of the same
-- dated result count once; undated results remain distinct to avoid free chances.
WITH legacy AS (
  SELECT d.id, d.created_at, d.method, d.metadata,
    COALESCE(d.entity_id, d.metadata->>'memberId', d.metadata->>'userId') AS member_id,
    COALESCE(NULLIF(d.metadata->>'completedAt', ''), d.id) AS attempt_key
  FROM workflow_diagnostics d WHERE d.workflow = 'member_assessment_history'
), distinct_attempts AS (
  SELECT DISTINCT ON (member_id, attempt_key) *
  FROM legacy WHERE member_id IS NOT NULL ORDER BY member_id, attempt_key, created_at
), histories AS (
  SELECT member_id, count(*)::integer AS attempts,
    jsonb_agg(jsonb_build_object(
      'score', metadata->'previousScore', 'scorePct', metadata->'previousScorePct',
      'answers', metadata->'previousAnswers', 'programInterest', metadata->'previousProgramInterest',
      'completedAt', metadata->>'completedAt', 'requestedAt', created_at,
      'allowedBy', metadata->>'allowedBy', 'legacyDiagnosticId', id,
      'legacyMetadata', metadata, 'legacyMethod', method
    ) ORDER BY created_at) AS history,
    array_agg(metadata->>'completedAt') AS completed_dates,
    max(created_at) FILTER (WHERE method IN ('admin_allowed_retake', 'counselor_allowed_retake')) AS staff_request
  FROM distinct_attempts GROUP BY member_id
)
UPDATE users u SET
  assessment_attempt_count = h.attempts + CASE WHEN u.assessment_completed AND NOT (
    COALESCE(to_char(u.assessment_completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = ANY(h.completed_dates), false)
  ) THEN 1 ELSE 0 END,
  assessment_history = h.history,
  assessment_retake_requested_at = CASE
    WHEN NOT u.assessment_completed AND h.attempts = 1 THEN h.staff_request ELSE NULL END
FROM histories h WHERE h.member_id = u.id;

UPDATE users SET assessment_attempt_count = 1
WHERE assessment_completed AND assessment_attempt_count = 0;

-- A former reset may have cleared an already exhausted member's official
-- result. Restore the latest known completion so the portal does not demand
-- an impossible third attempt. Missing historical values remain NULL.
UPDATE users SET
  assessment_completed = true,
  assessment_score = CASE WHEN jsonb_typeof(assessment_history->-1->'score') = 'number'
    THEN (assessment_history->-1->>'score')::integer ELSE NULL END,
  assessment_score_pct = CASE WHEN jsonb_typeof(assessment_history->-1->'scorePct') = 'number'
    THEN (assessment_history->-1->>'scorePct')::integer ELSE NULL END,
  assessment_answers = assessment_history->-1->'answers',
  program_interest = COALESCE(assessment_history->-1->>'programInterest', program_interest),
  assessment_completed_at = NULLIF(assessment_history->-1->>'completedAt', '')::timestamp
WHERE NOT assessment_completed AND assessment_attempt_count >= 2
  AND jsonb_array_length(assessment_history) > 0;

ALTER TABLE users ADD CONSTRAINT users_assessment_attempt_count_nonnegative
  CHECK (assessment_attempt_count >= 0);
-- Historical counts above two remain evidence; new submission writers cap at two.

-- These fields are server-owned. Existing table-wide UPDATE grants/RLS must
-- not let a browser mint attempts or staff authorizations through the Data API.
CREATE FUNCTION guard_assessment_attempt_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     OR current_setting('role', true) IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.assessment_attempt_count <> 0 OR NEW.assessment_retake_requested_at IS NOT NULL
         OR NEW.assessment_history <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Assessment attempt fields are server-owned' USING ERRCODE = '42501';
      END IF;
    ELSIF ROW(NEW.assessment_attempt_count, NEW.assessment_retake_requested_at, NEW.assessment_history)
       IS DISTINCT FROM ROW(OLD.assessment_attempt_count, OLD.assessment_retake_requested_at, OLD.assessment_history) THEN
      RAISE EXCEPTION 'Assessment attempt fields are server-owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION guard_assessment_attempt_fields() FROM PUBLIC;
CREATE TRIGGER users_guard_assessment_attempt_fields
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION guard_assessment_attempt_fields();
