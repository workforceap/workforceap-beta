-- Guarded WAP-76 rollback (WAP-186). Operator-only, never part of deployment.
-- Supersedes the historical down.sql without changing applied migration files.
-- Execute with psql -X -v ON_ERROR_STOP=1 -f scripts/db/rollback-wap76-course-slug-remap.sql
-- after the existing-database recovery preflight in docs/DATABASE-RECOVERY.md.
-- Immediate unchanged merged rows restore exactly. Changed/missing destinations
-- and occupied source keys are left untouched, with their journal retained and
-- a NOTICE identifying the entry requiring manual reconciliation. Renamed rows
-- retain their current values when moved back; that still hides newer progress
-- under the old key. This is not a general data restore or a deployment command.

DO $wap76_down$
DECLARE
  entry record;
  src public.course_progress%ROWTYPE;
  pre public.course_progress%ROWTYPE;
  expected public.course_progress%ROWTYPE;
  merged_completed boolean;
BEGIN
  IF to_regclass('wap_migration_backup.wap76_course_slug_remap') IS NULL THEN
    RAISE NOTICE 'wap76 journal is absent; nothing to roll back.';
    RETURN;
  END IF;

  -- Serialize the comparison and restoration against writers, including inserts.
  LOCK TABLE public.course_progress IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE wap_migration_backup.wap76_course_slug_remap IN SHARE ROW EXCLUSIVE MODE;

  FOR entry IN
    SELECT * FROM wap_migration_backup.wap76_course_slug_remap ORDER BY id DESC
  LOOP
    IF entry.action = 'renamed' THEN
      UPDATE public.course_progress AS cp
      SET course_slug = entry.from_course_slug
      WHERE cp.user_id = entry.user_id
        AND cp.program_slug = entry.program_slug
        AND cp.course_slug = entry.to_course_slug
        -- The natural unique is (user_id, program_slug, course_slug). If new
        -- activity has re-occupied the synthetic key, moving this row back
        -- would raise 23505; leave both rows as they are instead.
        AND NOT EXISTS (
          SELECT 1 FROM public.course_progress AS taken
          WHERE taken.user_id = entry.user_id
            AND taken.program_slug = entry.program_slug
            AND taken.course_slug = entry.from_course_slug
        );
      IF NOT FOUND THEN
        RAISE NOTICE 'wap76 journal % retained: renamed key missing or occupied', entry.id;
        CONTINUE;
      END IF;
    ELSE
      SELECT * INTO src FROM jsonb_populate_record(NULL::public.course_progress, entry.source_row);
      SELECT * INTO pre FROM jsonb_populate_record(NULL::public.course_progress, entry.target_row);
      expected := pre;
      merged_completed := src.status = 'COMPLETED' OR pre.status = 'COMPLETED';
      expected.status := CASE WHEN merged_completed THEN 'COMPLETED'::public.course_progress_status
                             WHEN src.status = 'IN_PROGRESS' OR pre.status = 'IN_PROGRESS' THEN 'IN_PROGRESS'::public.course_progress_status
                             ELSE 'NOT_STARTED'::public.course_progress_status END;
      expected.percent_complete := CASE WHEN merged_completed THEN 100 ELSE GREATEST(src.percent_complete, pre.percent_complete) END;
      expected.progress_pct := CASE WHEN merged_completed THEN 100 ELSE GREATEST(src.progress_pct, pre.progress_pct) END;
      expected.score_scaled := GREATEST(src.score_scaled, pre.score_scaled);
      expected.score_raw := GREATEST(src.score_raw, pre.score_raw);
      expected.started_at := LEAST(src.started_at, pre.started_at);
      expected.completed_at := CASE WHEN merged_completed THEN GREATEST(src.completed_at, pre.completed_at) ELSE NULL END;
      expected.last_activity_at := GREATEST(src.last_activity_at, pre.last_activity_at);
      expected.statement_count := src.statement_count + pre.statement_count;
      expected.course_id := COALESCE(pre.course_id, src.course_id);

      -- A whole-row comparison catches changed progress even when timestamps
      -- were not advanced. Identity/key changes and occupied source keys also
      -- require manual reconciliation; never consume their recovery journal.
      IF NOT EXISTS (SELECT 1 FROM public.course_progress cp WHERE to_jsonb(cp) = to_jsonb(expected))
         OR EXISTS (SELECT 1 FROM public.course_progress cp WHERE cp.id = src.id
                    OR (cp.user_id = src.user_id AND cp.program_slug = src.program_slug AND cp.course_slug = src.course_slug)) THEN
        RAISE NOTICE 'wap76 journal % retained: merged row changed, missing, or source occupied', entry.id;
        CONTINUE;
      END IF;

      -- Restore the destination row to its pre-merge values.
      UPDATE public.course_progress AS cp
      SET status           = pre.status,
          percent_complete = pre.percent_complete,
          progress_pct     = pre.progress_pct,
          score_scaled     = pre.score_scaled,
          score_raw        = pre.score_raw,
          started_at       = pre.started_at,
          completed_at     = pre.completed_at,
          last_activity_at = pre.last_activity_at,
          statement_count  = pre.statement_count,
          course_id        = pre.course_id
      WHERE cp.id = pre.id;

      -- The table lock and source-key check make restoration atomic. An
      -- unexpected constraint failure aborts this DO block and retains the journal.
      INSERT INTO public.course_progress
      SELECT * FROM jsonb_populate_record(NULL::public.course_progress, entry.source_row);
    END IF;

    DELETE FROM wap_migration_backup.wap76_course_slug_remap WHERE id = entry.id;
  END LOOP;
END
$wap76_down$;
