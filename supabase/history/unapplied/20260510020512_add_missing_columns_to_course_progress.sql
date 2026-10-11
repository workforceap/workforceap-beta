-- Add missing columns to course_progress table that exist in Prisma schema but not in production DB
-- progressPct (Int @default(0)) mapped to progress_pct
-- statementCount (Int @default(0)) mapped to statement_count
ALTER TABLE IF EXISTS course_progress
ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS statement_count INTEGER NOT NULL DEFAULT 0;
