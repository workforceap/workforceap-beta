CREATE TABLE IF NOT EXISTS "coursera_identity_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "coursera_email" TEXT,
    "actor_identifier" TEXT,
    "actor_home_page" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "coursera_identity_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coursera_identity_mappings_identity_check" CHECK (
      "coursera_email" IS NOT NULL OR "actor_identifier" IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "coursera_identity_mappings_email_key"
  ON "coursera_identity_mappings" (LOWER("coursera_email"))
  WHERE "coursera_email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "coursera_identity_mappings_actor_key"
  ON "coursera_identity_mappings" ("actor_identifier", COALESCE("actor_home_page", ''))
  WHERE "actor_identifier" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "coursera_identity_mappings_user_id_idx"
  ON "coursera_identity_mappings" ("user_id");

CREATE INDEX IF NOT EXISTS "coursera_identity_mappings_actor_identifier_actor_home_page_idx"
  ON "coursera_identity_mappings" ("actor_identifier", "actor_home_page");