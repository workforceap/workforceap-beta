-- Curated job board ↔ application tracker
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "curated_job_id" TEXT;
CREATE INDEX IF NOT EXISTS "job_applications_curated_job_id_idx" ON "job_applications"("curated_job_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_curated_job_id_fkey'
  ) THEN
    ALTER TABLE "job_applications"
      ADD CONSTRAINT "job_applications_curated_job_id_fkey"
      FOREIGN KEY ("curated_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Program change requests
DO $$ BEGIN
  CREATE TYPE "ProgramChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "program_change_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_program_slug" TEXT,
    "requested_program_slug" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ProgramChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "program_change_requests_user_id_idx" ON "program_change_requests"("user_id");
CREATE INDEX IF NOT EXISTS "program_change_requests_status_idx" ON "program_change_requests"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_change_requests_user_id_fkey'
  ) THEN
    ALTER TABLE "program_change_requests" ADD CONSTRAINT "program_change_requests_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_change_requests_reviewed_by_id_fkey'
  ) THEN
    ALTER TABLE "program_change_requests" ADD CONSTRAINT "program_change_requests_reviewed_by_id_fkey"
      FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
