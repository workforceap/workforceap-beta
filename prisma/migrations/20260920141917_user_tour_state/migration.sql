-- Guided tours, wave 1 (engine + state). Additive: one row per user per tour
-- key. Nothing reads this table for auto-start yet; legacy tour_completed_at
-- columns stay in place and are read as COMPLETED v1 by GET /api/tours/state.
CREATE TABLE IF NOT EXISTS "user_tour_states" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tour_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "last_step" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_tour_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_tour_states_status_check" CHECK ("status" IN ('STARTED', 'COMPLETED', 'DISMISSED')),
  CONSTRAINT "user_tour_states_version_check" CHECK ("version" >= 1),
  CONSTRAINT "user_tour_states_last_step_check" CHECK ("last_step" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_tour_states_user_id_tour_key_key" ON "user_tour_states"("user_id", "tour_key");
CREATE INDEX IF NOT EXISTS "user_tour_states_user_id_idx" ON "user_tour_states"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_tour_states_user_id_fkey') THEN
    ALTER TABLE "user_tour_states"
      ADD CONSTRAINT "user_tour_states_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
