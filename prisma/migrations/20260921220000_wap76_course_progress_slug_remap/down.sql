-- Rollback for 20260921220000_wap76_course_progress_slug_remap.
--
-- Prisma has no `migrate down`, so this is run by hand:
--
--   psql "$POSTGRES_URL_NON_POOLING" \
--     -v ON_ERROR_STOP=1 \
--     -f prisma/migrations/20260921220000_wap76_course_progress_slug_remap/down.sql
--
-- It replays wap_migration_backup.wap76_course_slug_remap newest entry first:
--
--   'renamed'  the destination row goes back onto its synthetic key;
--   'merged'   the destination row is restored field-for-field from
--              target_row and the row that was folded into it is re-inserted
--              verbatim from source_row, with its original id.
--
-- WHAT "RESTORE" MEANS, EXACTLY
-- ----------------------------
-- Immediately after the migration this reproduces the preimage exactly, which
-- is what tests/migrations/wap76-course-slug-remap.mjs asserts. It is NOT a
-- time machine. The 'merged' branch journals both whole rows, so it restores
-- their values as well as their keys. The 'renamed' branch journals only the
-- slug pair, because nothing else changed: if a member has earned progress on
-- the destination key since the migration ran, the rollback moves that row
-- back to the synthetic key carrying its NEW values, which re-hides the
-- progress earned in between. Roll back promptly or not at all.
--
-- Where a key is already occupied -- new activity landed on the old synthetic
-- key, or on the destination -- the rollback leaves the existing row alone
-- rather than failing or overwriting it. Both branches therefore skip instead
-- of raising a duplicate-key error on (user_id, program_slug, course_slug).
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
      -- Bare DO NOTHING, not ON CONFLICT (id): the row carries its original
      -- id, but the constraint that actually bites is the natural unique on
      -- (user_id, program_slug, course_slug) when new activity has landed on
      -- the synthetic key since the migration ran. This covers both.
      INSERT INTO public.course_progress
      SELECT * FROM jsonb_populate_record(NULL::public.course_progress, entry.source_row)
      ON CONFLICT DO NOTHING;
    END IF;

    DELETE FROM wap_migration_backup.wap76_course_slug_remap WHERE id = entry.id;
  END LOOP;
END
$wap76_down$;
