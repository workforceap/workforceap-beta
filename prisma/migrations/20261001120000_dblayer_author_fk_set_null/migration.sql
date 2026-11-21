-- Data-layer audit 2026-09-22, item 1: staff-author foreign keys that
-- production has as NOT NULL + ON DELETE CASCADE while prisma/schema.prisma
-- declares them nullable + `onDelete: SetNull`.
--
-- Drift found by pushing schema.prisma into a scratch PostgreSQL and diffing
-- pg_constraint / information_schema.columns against production:
--
--   table.column                             schema.prisma          production
--   counselor_notes.author_id                String?  SetNull       NOT NULL  CASCADE
--   messages.author_id                       String?  SetNull       NOT NULL  CASCADE
--   application_messages.author_id           String?  SetNull       NOT NULL  CASCADE
--   partner_outreach_logs.created_by_user_id String?  SetNull       NOT NULL  CASCADE
--
-- The migrations that created the columns (20260318400000_pipeline_tracker,
-- 20260329120000_member_counselor_chat, 20260407120000_application_messaging,
-- 20260323180000_portal_expansion_outreach) hand-wrote NOT NULL + CASCADE and
-- no later migration changed them, so the checked-in schema, the generated
-- Prisma types (`authorId: string | null`) and the `db push` databases the
-- contract lane tests against all disagree with production.
--
-- Effect of the drift: hard-deleting a counselor / staff / partner user
-- (POST /api/admin/members/[id]/erase, or the 30-day purge in
-- lib/retention/cleanup.ts, which comments "Cascades run at the database
-- level from here") deletes every note they wrote about members, every chat
-- message they sent, every employer application message and every outreach
-- log they created. The schema's intent is to keep those rows and null the
-- author, exactly as `audit_events.actor_user_id` (20260920141800) and
-- `users.wioa_reviewed_by_user_id` already behave.
--
-- Production counts (read-only, 2026-09-22 03:xx UTC, api.supabase.com query):
--   SELECT 'counselor_notes', count(*),
--          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = author_id AND u.deleted_at IS NOT NULL))
--     FROM counselor_notes  -- 0 rows, 0 by soft-deleted authors
--   messages: 25 rows, 0 by soft-deleted authors
--   application_messages: 1 row, 0 by soft-deleted authors
--   partner_outreach_logs: 0 rows, 0 by soft-deleted authors
-- No row changes: DROP NOT NULL is a catalog-only change, the re-created
-- foreign keys validate the same rows the old ones did, and no NULL is
-- written until a user is actually deleted.
--
-- Not changed here, deliberately (owner decision, see the PR body):
--   counselor_notes.member_id is also NOT NULL + CASCADE in production while
--   the schema says SetNull. Cascading a member's notes on GDPR erasure is
--   arguably the safer behaviour (the note text is about the member), so that
--   column keeps production's rule until the owner rules.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD, DROP NOT NULL is a no-op on a
-- nullable column. Tables are tiny (largest: messages, 25 rows); the lock
-- timeout keeps the migration from queueing behind a long read.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "counselor_notes" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "counselor_notes" DROP CONSTRAINT IF EXISTS "counselor_notes_author_id_fkey";
ALTER TABLE "counselor_notes"
  ADD CONSTRAINT "counselor_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_author_id_fkey";
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "application_messages" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "application_messages" DROP CONSTRAINT IF EXISTS "application_messages_author_id_fkey";
ALTER TABLE "application_messages"
  ADD CONSTRAINT "application_messages_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_outreach_logs" ALTER COLUMN "created_by_user_id" DROP NOT NULL;
ALTER TABLE "partner_outreach_logs" DROP CONSTRAINT IF EXISTS "partner_outreach_logs_created_by_user_id_fkey";
ALTER TABLE "partner_outreach_logs"
  ADD CONSTRAINT "partner_outreach_logs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

-- Down (manual; restores production's pre-migration rule). SET NOT NULL fails
-- if a user was deleted in between and left a NULL author; decide per row
-- (delete the orphaned rows, or leave the column nullable) before running it.
--   BEGIN;
--   ALTER TABLE "counselor_notes" DROP CONSTRAINT IF EXISTS "counselor_notes_author_id_fkey";
--   ALTER TABLE "counselor_notes" ADD CONSTRAINT "counselor_notes_author_id_fkey"
--     FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "counselor_notes" ALTER COLUMN "author_id" SET NOT NULL;
--   ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_author_id_fkey";
--   ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey"
--     FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "messages" ALTER COLUMN "author_id" SET NOT NULL;
--   ALTER TABLE "application_messages" DROP CONSTRAINT IF EXISTS "application_messages_author_id_fkey";
--   ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_author_id_fkey"
--     FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "application_messages" ALTER COLUMN "author_id" SET NOT NULL;
--   ALTER TABLE "partner_outreach_logs" DROP CONSTRAINT IF EXISTS "partner_outreach_logs_created_by_user_id_fkey";
--   ALTER TABLE "partner_outreach_logs" ADD CONSTRAINT "partner_outreach_logs_created_by_user_id_fkey"
--     FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "partner_outreach_logs" ALTER COLUMN "created_by_user_id" SET NOT NULL;
--   COMMIT;
