-- CreateTable: coursera_skillset_progress
-- Snapshot of Coursera Enterprise skillset progress for a member, written by
-- the /api/cron/coursera-sync active-pull cron. One row per (user_id, skillset_id).
CREATE TABLE IF NOT EXISTS "coursera_skillset_progress" (
    "id"             TEXT NOT NULL,
    "user_id"        TEXT NOT NULL,
    "skillset_id"    TEXT NOT NULL,
    "skillset_name"  TEXT NOT NULL,
    "progress_pct"   INTEGER NOT NULL,
    "program_id"     TEXT NOT NULL,
    "program_slug"   TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coursera_skillset_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one row per member+skillset
CREATE UNIQUE INDEX IF NOT EXISTS "coursera_skillset_progress_user_id_skillset_id_key"
    ON "coursera_skillset_progress" ("user_id", "skillset_id");

-- CreateIndex: program-scoped reads (admin readout, dashboards)
CREATE INDEX IF NOT EXISTS "coursera_skillset_progress_program_id_idx"
    ON "coursera_skillset_progress" ("program_id");

-- AddForeignKey: cascade on user delete to keep table tidy
ALTER TABLE "coursera_skillset_progress"
    ADD CONSTRAINT "coursera_skillset_progress_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
