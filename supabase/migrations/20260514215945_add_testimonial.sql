DO $$ BEGIN
    CREATE TYPE "testimonial_source" AS ENUM ('SURVEY', 'MANUAL', 'INTERVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "testimonial_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "testimonials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "program_id" TEXT,
    "placement_id" TEXT,
    "source" "testimonial_source" NOT NULL DEFAULT 'SURVEY',
    "status" "testimonial_status" NOT NULL DEFAULT 'PENDING',
    "photo_url" TEXT,
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "testimonials"
        ADD CONSTRAINT "testimonials_member_id_fkey"
        FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "testimonials"
        ADD CONSTRAINT "testimonials_reviewed_by_fkey"
        FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "testimonials_member_id_idx" ON "testimonials"("member_id");
CREATE INDEX IF NOT EXISTS "testimonials_status_idx" ON "testimonials"("status");
CREATE INDEX IF NOT EXISTS "testimonials_source_idx" ON "testimonials"("source");
CREATE INDEX IF NOT EXISTS "testimonials_reviewed_by_idx" ON "testimonials"("reviewed_by");
CREATE INDEX IF NOT EXISTS "testimonials_deleted_at_idx" ON "testimonials"("deleted_at");
CREATE INDEX IF NOT EXISTS "testimonials_created_at_idx" ON "testimonials"("created_at");