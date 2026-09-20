-- Portal tooltip tour completion (Sprint 8c)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_completed_at" TIMESTAMP(3);
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "tour_completed_at" TIMESTAMP(3);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "tour_completed_at" TIMESTAMP(3);
