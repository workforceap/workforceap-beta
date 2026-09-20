-- Add `users.last_coursera_auto_sync_at` so the dashboard auto-sync trigger
-- (POST /api/member/coursera/auto-sync) can de-dupe per-user. The dashboard
-- home fires the auto-sync as a fail-soft background promise on first visit;
-- this column lets it skip the call entirely on subsequent renders so we
-- don't pummel B4B's quota with one request per page load.
--
-- Idempotent: uses IF NOT EXISTS so a re-run on a partially-applied DB
-- (e.g. a previous deploy that crashed mid-migration) is safe. Pattern
-- mirrors prisma/migrations/20260508120000_multi_course_enrollment.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_coursera_auto_sync_at" TIMESTAMP(3);

-- Helper index so a future "find users who haven't auto-synced in N days"
-- backfill / cron can scan cheaply. Not unique — many users will share
-- a NULL until their first dashboard hit.
CREATE INDEX IF NOT EXISTS "users_last_coursera_auto_sync_at_idx"
  ON "users" ("last_coursera_auto_sync_at");

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "users_last_coursera_auto_sync_at_idx";
-- ALTER TABLE "users" DROP COLUMN IF EXISTS "last_coursera_auto_sync_at";
