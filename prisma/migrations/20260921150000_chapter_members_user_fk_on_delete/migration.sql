-- WAP-169 follow-up: chapter_members.user_id was ON DELETE RESTRICT (the Prisma
-- relation carried no `onDelete`, and 20260711173000_add_chapter_tables wrote
-- RESTRICT explicitly). A member who had joined a chapter therefore could not be
-- hard-deleted: the 30-day retention purge (lib/retention/cleanup.ts) reported
-- the account as held by `chapter_members_user_id_fkey` and only anonymised it,
-- and POST /api/admin/members/[id]/erase failed the same way on `user.delete`.
--
-- A chapter membership is meaningless without the member (`user_id` is NOT NULL
-- and half of the (chapter_id, user_id) unique key), so the row goes with the
-- account: ON DELETE CASCADE, like the other per-member tables that hang off
-- `users`. `chapters.leader_id` already SET NULLs and is untouched. No rows are
-- rewritten, RLS is untouched, and re-applying is a no-op (DROP IF EXISTS).
ALTER TABLE "chapter_members" DROP CONSTRAINT IF EXISTS "chapter_members_user_id_fkey";
ALTER TABLE "chapter_members"
  ADD CONSTRAINT "chapter_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Down (manual; restores the RESTRICT rule from 20260711173000):
--   ALTER TABLE "chapter_members" DROP CONSTRAINT IF EXISTS "chapter_members_user_id_fkey";
--   ALTER TABLE "chapter_members"
--     ADD CONSTRAINT "chapter_members_user_id_fkey"
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
