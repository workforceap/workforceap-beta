-- Rollback for 20260921220000_wap76_course_progress_slug_remap.
--
-- Prisma has no `migrate down`, so this is run by hand:
--
--   psql "$POSTGRES_URL_NON_POOLING" \
--     -v ON_ERROR_STOP=1 \
--     -f prisma/migrations/20260921220000_wap76_course_progress_slug_remap/down.sql
--
-- It replays wap_migration_backup.wap76_course_slug_remap newest entry first
-- and restores the exact preimage:
--
--   'renamed'  the destination row goes back onto its synthetic key;
--   'merged'   the destination row is restored field-for-field from
--              target_row and the row that was folded into it is re-inserted
--              verbatim from source_row, with its original id.
--
-- Idempotent: it consumes the journal as it goes, so a second run finds
-- nothing to do. It never invents a row -- only rows this migration itself
-- journaled are restored.

DO $wap76_down$
DECLARE
  entry record;
BEGIN
  IF to_regclass('wap_migration_backup.wap76_course_slug_remap') IS NULL THEN
    RAISE NOTICE 'wap76 journal is absent; nothing to roll back.';
    RETURN;
  END IF;

  FOR entry IN
    SELECT * FROM wap_migration_backup.wap76_course_slug_remap ORDER BY id DESC
  LOOP
    IF entry.action = 'renamed' THEN
      UPDATE public.course_progress
      SET course_slug = entry.from_course_slug
      WHERE user_id = entry.user_id
        AND program_slug = entry.program_slug
        AND course_slug = entry.to_course_slug;
    ELSE
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
      FROM jsonb_populate_record(NULL::public.course_progress, entry.target_row) AS pre
      WHERE cp.id = pre.id;

      -- Put the folded-in row back, with its original id.
      INSERT INTO public.course_progress
      SELECT * FROM jsonb_populate_record(NULL::public.course_progress, entry.source_row)
      ON CONFLICT (id) DO NOTHING;
    END IF;

    DELETE FROM wap_migration_backup.wap76_course_slug_remap WHERE id = entry.id;
  END LOOP;
END
$wap76_down$;
