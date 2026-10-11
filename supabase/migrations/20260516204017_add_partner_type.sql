ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "partner_type" TEXT NOT NULL DEFAULT 'community';

CREATE INDEX IF NOT EXISTS "partners_partner_type_idx"
  ON "partners" ("partner_type");