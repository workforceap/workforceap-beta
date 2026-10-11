
-- Idempotent CREATE for courses table
-- The original prisma migration `20260427001500_add_course_coursera_links` was logged
-- as finished but referenced "Organization" (capitalized) which doesn't exist;
-- the actual table is `organizations`. This recreates with correct FK.
CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL,
  program_slug text NOT NULL,
  course_slug text NOT NULL,
  name text NOT NULL,
  estimated_hours integer,
  coursera_course_id text,
  coursera_slug text,
  coursera_url_type text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS courses_organization_id_program_slug_display_order_idx
  ON courses (organization_id, program_slug, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS courses_organization_id_program_slug_course_slug_key
  ON courses (organization_id, program_slug, course_slug);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_organization_id_fkey') THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
