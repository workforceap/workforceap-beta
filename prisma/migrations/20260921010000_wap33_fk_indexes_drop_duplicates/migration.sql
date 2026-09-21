-- WAP-33: index the uncovered foreign keys the Supabase performance advisor
-- flagged on 2026-09-10 and drop the two indexes it reported as duplicates.
--
-- Indexes only. No data is read or changed, so the migration is reversible
-- by the statements in the "Down" block at the end.
--
-- Additive and idempotent: every CREATE / DROP is IF [NOT] EXISTS, so a
-- database where an operator already created one of these by hand, or a
-- fresh replay of the whole history, both apply cleanly.
--
-- Covered FKs (Prisma model field -> column):
--   chapters.organization_id, chapters.leader_id  (Chapter.organizationId / leaderId)
--   chapter_members.user_id                        (ChapterMember.userId; the
--                                                   unique (chapter_id, user_id) covers chapter_id only)
--   chapter_meetings.chapter_id                    (ChapterMeeting.chapterId)
--   chapter_curriculum_items.course_id             (ChapterCurriculumItem.courseId; the
--                                                   unique (chapter_id, course_id) covers chapter_id only)
--   user_roles.role_id                             (UserRole.roleId; the PK (user_id, role_id) covers user_id only)
--   coursera_xapi_events.matched_user_id           (no Prisma model — the table is created at
--                                                   runtime by lib/xapi/mappings.ts, which now also
--                                                   creates this index for fresh environments)
--
-- Not touched: message_threads.counselor_user_id / staff_user_id, which the
-- ticket also names, already have `@@index` in schema.prisma
-- (message_threads_counselor_user_id_idx / message_threads_staff_user_id_idx).
--
-- Duplicates dropped (the Supabase-side `idx_*` twin of a Prisma index with an
-- identical column list, both verified in this repo):
--   idx_member_next_best_actions_member_status_priority (member_id, status, priority)
--     duplicates member_next_best_actions_member_id_status_priority_idx
--     (supabase/migrations/20260411155736 vs prisma/migrations/20260512999000)
--   idx_mentor_specialties_mentor_id (mentor_id)
--     duplicates mentor_specialties_mentor_id_idx
--     (supabase/migrations/20260329212657 vs prisma/migrations/20260512999000)
--
-- Every CREATE INDEX takes a SHARE lock on its table for the build; the tables
-- are small (the whole database was 60 MB on 2026-09-10) and the migration
-- bounds its own waiting rather than queueing behind a long read.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- ── Foreign keys on Prisma-managed tables (names match Prisma's defaults) ──

CREATE INDEX IF NOT EXISTS "chapters_organization_id_idx"
  ON "chapters"("organization_id");

CREATE INDEX IF NOT EXISTS "chapters_leader_id_idx"
  ON "chapters"("leader_id");

CREATE INDEX IF NOT EXISTS "chapter_members_user_id_idx"
  ON "chapter_members"("user_id");

CREATE INDEX IF NOT EXISTS "chapter_meetings_chapter_id_idx"
  ON "chapter_meetings"("chapter_id");

CREATE INDEX IF NOT EXISTS "chapter_curriculum_items_course_id_idx"
  ON "chapter_curriculum_items"("course_id");

CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx"
  ON "user_roles"("role_id");

-- ── coursera_xapi_events.matched_user_id ──
-- The table is created at runtime (lib/xapi/mappings.ts ensureCourseraMappingTables),
-- so a fresh replay may reach this migration before the table exists. Guard.
DO $$
BEGIN
  IF to_regclass('public.coursera_xapi_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "coursera_xapi_events_matched_user_id_idx"
      ON "coursera_xapi_events"("matched_user_id");
  END IF;
END $$;

-- ── Duplicate indexes ──

DROP INDEX IF EXISTS "idx_member_next_best_actions_member_status_priority";
DROP INDEX IF EXISTS "idx_mentor_specialties_mentor_id";

COMMIT;

-- Down (manual; indexes only, no data):
--   DROP INDEX IF EXISTS "chapters_organization_id_idx";
--   DROP INDEX IF EXISTS "chapters_leader_id_idx";
--   DROP INDEX IF EXISTS "chapter_members_user_id_idx";
--   DROP INDEX IF EXISTS "chapter_meetings_chapter_id_idx";
--   DROP INDEX IF EXISTS "chapter_curriculum_items_course_id_idx";
--   DROP INDEX IF EXISTS "user_roles_role_id_idx";
--   DROP INDEX IF EXISTS "coursera_xapi_events_matched_user_id_idx";
--   CREATE INDEX IF NOT EXISTS idx_member_next_best_actions_member_status_priority
--     ON member_next_best_actions (member_id, status, priority);
--   CREATE INDEX IF NOT EXISTS idx_mentor_specialties_mentor_id ON mentor_specialties(mentor_id);
