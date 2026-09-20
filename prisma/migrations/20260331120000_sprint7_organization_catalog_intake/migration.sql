-- Sprint 7: multi-tenant foundation (default org), program catalog, pre-screening, profile gate fields

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "custom_domain" TEXT,
    "logo" TEXT,
    "primary_color" TEXT,
    "billing_type" TEXT NOT NULL DEFAULT 'flat',
    "plan" TEXT NOT NULL DEFAULT 'nonprofit',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "overview_video_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_custom_domain_key" ON "organizations"("custom_domain") WHERE "custom_domain" IS NOT NULL;

INSERT INTO "organizations" ("id", "name", "slug", "billing_type", "plan", "active", "created_at", "updated_at")
SELECT '00000000-0000-4000-8000-000000000001', 'WorkforceAP', 'workforceap', 'flat', 'nonprofit', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "organizations" WHERE "slug" = 'workforceap');

-- organization_id on tenant-scoped tables
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

UPDATE "users" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;
UPDATE "partners" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;
UPDATE "employers" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;

UPDATE "jobs" j
SET "organization_id" = e."organization_id"
FROM "employers" e
WHERE j."employer_id" = e."id" AND j."organization_id" IS NULL;

UPDATE "jobs" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_organization_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_organization_id_fkey') THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employers_organization_id_fkey') THEN
    ALTER TABLE "employers" ADD CONSTRAINT "employers_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_organization_id_fkey') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX IF NOT EXISTS "partners_organization_id_idx" ON "partners"("organization_id");
CREATE INDEX IF NOT EXISTS "employers_organization_id_idx" ON "employers"("organization_id");
CREATE INDEX IF NOT EXISTS "jobs_organization_id_idx" ON "jobs"("organization_id");

ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "partners" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "employers" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interview_eligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interview_requested_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interview_completed_at" TIMESTAMP(3);

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "financial_aid_interest" BOOLEAN;

CREATE TABLE IF NOT EXISTS "organization_program_catalog" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "program_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL,
    "delivery_url" TEXT,
    "delivery_details" TEXT,
    "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "duration" TEXT,
    "cost" DOUBLE PRECISION,
    "cert_cost" DOUBLE PRECISION,
    "book_cost" DOUBLE PRECISION,
    "misc_cost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_program_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_program_catalog_organization_id_program_slug_key"
  ON "organization_program_catalog"("organization_id", "program_slug");

CREATE INDEX IF NOT EXISTS "organization_program_catalog_organization_id_display_order_idx"
  ON "organization_program_catalog"("organization_id", "display_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_program_catalog_organization_id_fkey') THEN
    ALTER TABLE "organization_program_catalog" ADD CONSTRAINT "organization_program_catalog_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "pre_screening_responses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employment_status" TEXT NOT NULL,
    "primary_goal" TEXT NOT NULL,
    "weekly_hours" TEXT NOT NULL,
    "barrier" TEXT NOT NULL,
    "hear_about" TEXT NOT NULL,
    "hear_about_other" TEXT,
    "workforce_assistance" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_screening_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pre_screening_responses_user_id_key" ON "pre_screening_responses"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pre_screening_responses_user_id_fkey') THEN
    ALTER TABLE "pre_screening_responses" ADD CONSTRAINT "pre_screening_responses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pre_screening_responses_organization_id_fkey') THEN
    ALTER TABLE "pre_screening_responses" ADD CONSTRAINT "pre_screening_responses_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
