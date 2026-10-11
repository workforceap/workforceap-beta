-- Add progress_pct column to course_progress table
-- This aligns with the Prisma schema where progressPct (Int @default(0)) is mapped to progress_pct
ALTER TABLE IF EXISTS course_progress
ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0;
