-- WAP-178: create the `advisor_session_notes` table.
--
-- `AdvisorSessionNote` (prisma/schema.prisma) has been in the schema, and
-- read/written by app/api/counselor/members/[memberId]/session-notes/route.ts
-- and AdvisorSessionNotesPanel.tsx, with NO migration anywhere in
-- prisma/migrations. The table is absent from production, so every call to
-- that route raises a missing-relation error.
--
-- Additive and idempotent: IF NOT EXISTS on the table and both indexes, and
-- the two foreign keys are guarded, so this is safe to apply to an
-- environment where the table was created out of band (e.g. `prisma db push`)
-- as well as to a fresh replay of the whole history.
--
-- Mirrors the Prisma model field for field. Column types follow
-- `counselor_notes` (20260318400000_pipeline_tracker), the sibling model with
-- the same shape and the same two CASCADE foreign keys onto `users`.
--
-- Both FKs take a lock on `users`, which is hot, so the migration bounds its
-- own waiting rather than queueing an ACCESS EXCLUSIVE lock behind a long
-- read for the length of a Vercel build.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "advisor_session_notes" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisor_session_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "advisor_session_notes_member_id_idx"
  ON "advisor_session_notes"("member_id");
CREATE INDEX IF NOT EXISTS "advisor_session_notes_author_id_idx"
  ON "advisor_session_notes"("author_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'advisor_session_notes_member_id_fkey'
  ) THEN
    ALTER TABLE "advisor_session_notes"
      ADD CONSTRAINT "advisor_session_notes_member_id_fkey"
      FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'advisor_session_notes_author_id_fkey'
  ) THEN
    ALTER TABLE "advisor_session_notes"
      ADD CONSTRAINT "advisor_session_notes_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS, mirroring counselor_notes (20260513040000_add_rls_policies:177,541-557):
-- sensitive — counselors + admins only; members cannot read. ENABLE only; FORCE
-- is deferred repo-wide by 20260514000000_defer_rls_force_authorize_system.
ALTER TABLE "advisor_session_notes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advisor_session_notes_select_counselor" ON "advisor_session_notes";
CREATE POLICY "advisor_session_notes_select_counselor" ON "advisor_session_notes" FOR SELECT USING (
  member_id IS NOT NULL AND is_counselor_for_member(member_id)
);
DROP POLICY IF EXISTS "advisor_session_notes_select_admin" ON "advisor_session_notes";
CREATE POLICY "advisor_session_notes_select_admin" ON "advisor_session_notes" FOR SELECT USING (
  member_id IS NOT NULL AND is_admin_for_member_data(member_id)
);
DROP POLICY IF EXISTS "advisor_session_notes_modify_author" ON "advisor_session_notes";
CREATE POLICY "advisor_session_notes_modify_author" ON "advisor_session_notes" FOR ALL USING (author_id = get_current_user_id()) WITH CHECK (author_id = get_current_user_id());
DROP POLICY IF EXISTS "advisor_session_notes_insert_counselor" ON "advisor_session_notes";
CREATE POLICY "advisor_session_notes_insert_counselor" ON "advisor_session_notes" FOR INSERT WITH CHECK (
  author_id = get_current_user_id()
  AND (is_counselor_for_member(member_id) OR is_admin_for_member_data(member_id))
);

COMMIT;
