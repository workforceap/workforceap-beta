-- Data-layer audit 2026-09-22, item 3: columns prisma/schema.prisma declares
-- NOT NULL (so the generated types and every reader assume a value) that
-- production still has nullable.
--
-- Drift found by pushing schema.prisma into a scratch PostgreSQL and diffing
-- information_schema.columns against production.
--
-- SAFETY (2026-10-01): every SET NOT NULL below is now preceded by an
-- idempotent backfill that fills the column's own default into any pre-existing
-- NULL row. `ALTER COLUMN ... SET DEFAULT` changes only the catalog — unlike
-- `ADD COLUMN ... DEFAULT`, it does NOT rewrite existing rows — so without the
-- backfill a single NULL row would raise SQLSTATE 23502, abort this
-- transaction and fail the production deploy (the build runs
-- `prisma migrate deploy`; see the PR body). The backfill makes the constraint
-- satisfiable whatever the current data is, so the counts below are the
-- author's 2026-09-22 observation and are no longer what makes this safe.
--
--   column                                schema.prisma            production           NULL rows
--   users.notifications_reminders         Boolean @default(true)   nullable, default t  0 of 136
--   users.notifications_updates           Boolean @default(true)   nullable, default t  0 of 136
--   profiles.role                         String  @default("member") nullable, default   0 of 136
--   placement_records.start_date_verified Boolean @default(false)  nullable, NO default 0 of 1
--
-- Production counts (read-only, 2026-09-22, api.supabase.com query):
--   SELECT (SELECT count(*) FROM users WHERE notifications_reminders IS NULL),
--          (SELECT count(*) FROM users WHERE notifications_updates IS NULL),
--          (SELECT count(*) FROM profiles WHERE role IS NULL),
--          (SELECT count(*) FROM placement_records WHERE start_date_verified IS NULL);
--   -- 0, 0, 0, 0
--
-- Why it matters: `profiles.role` feeds lib/auth/roleAccess.ts and the
-- `profiles_update_own` RLS policy compares `role = (SELECT p.role ...)`, which
-- is never true for a NULL role. `placement_records.start_date_verified` is
-- written by a raw INSERT in app/api/counselor/placements/route.ts that omits
-- the column, so production had no default to fall back on and Prisma readers
-- typed as `boolean` could see `null`. The DEFAULT is added first so that
-- insert keeps working, then the backfill fills any row that insert already
-- left NULL, then the constraint is applied.
--
-- Not changed here, deliberately (owner decisions, see the PR body):
--   organizations.subscription_tier — schema says NOT NULL DEFAULT 'starter',
--     production's single row has NULL; needs a data backfill first.
--   blog_posts.author_name / created_at / published / updated_at — nullable
--     in production, and blog_posts.id is `uuid` there versus `text` in the
--     schema; the table needs one reconciliation, not a partial one.
--
-- SET NOT NULL takes a brief ACCESS EXCLUSIVE lock and scans the table; the
-- tables are small (136 / 136 / 1 rows when the author measured them; row
-- counts are not re-measured here). Idempotent and re-runnable: SET NOT NULL
-- and SET DEFAULT on a column already in that state are no-ops, and each
-- backfill UPDATE matches zero rows on a second run. The backfill only fills
-- NULLs with the column's declared default; it never overwrites a real value.
-- tests/migrations/not-null-requires-backfill.mjs fails if a SET NOT NULL is
-- ever added here without its matching backfill.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "users" ALTER COLUMN "notifications_reminders" SET DEFAULT true;
UPDATE "users" SET "notifications_reminders" = true WHERE "notifications_reminders" IS NULL;
ALTER TABLE "users" ALTER COLUMN "notifications_reminders" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "notifications_updates" SET DEFAULT true;
UPDATE "users" SET "notifications_updates" = true WHERE "notifications_updates" IS NULL;
ALTER TABLE "users" ALTER COLUMN "notifications_updates" SET NOT NULL;

ALTER TABLE "profiles" ALTER COLUMN "role" SET DEFAULT 'member';
UPDATE "profiles" SET "role" = 'member' WHERE "role" IS NULL;
ALTER TABLE "profiles" ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "placement_records" ALTER COLUMN "start_date_verified" SET DEFAULT false;
UPDATE "placement_records" SET "start_date_verified" = false WHERE "start_date_verified" IS NULL;
ALTER TABLE "placement_records" ALTER COLUMN "start_date_verified" SET NOT NULL;

COMMIT;

-- Down (manual; restores production's pre-migration state):
--   BEGIN;
--   ALTER TABLE "users" ALTER COLUMN "notifications_reminders" DROP NOT NULL;
--   ALTER TABLE "users" ALTER COLUMN "notifications_updates" DROP NOT NULL;
--   ALTER TABLE "profiles" ALTER COLUMN "role" DROP NOT NULL;
--   ALTER TABLE "placement_records" ALTER COLUMN "start_date_verified" DROP NOT NULL;
--   ALTER TABLE "placement_records" ALTER COLUMN "start_date_verified" DROP DEFAULT;
--   COMMIT;
