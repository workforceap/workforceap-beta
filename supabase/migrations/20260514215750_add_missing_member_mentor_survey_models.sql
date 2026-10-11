CREATE TABLE IF NOT EXISTS "placement_surveys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "placement_id" TEXT NOT NULL REFERENCES "placement_records"("id") ON DELETE CASCADE,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "job_satisfaction" INTEGER,
    "training_relevance" INTEGER,
    "support_quality" INTEGER,
    "what_helped_most" TEXT,
    "what_could_improve" TEXT,
    "still_employed" BOOLEAN,
    "current_salary" INTEGER,
    "allow_testimonial" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "placement_surveys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "placement_surveys_user_id_key" ON "placement_surveys" ("user_id");
CREATE INDEX IF NOT EXISTS "placement_surveys_sent_at_idx" ON "placement_surveys" ("sent_at");
CREATE INDEX IF NOT EXISTS "placement_surveys_placement_id_idx" ON "placement_surveys" ("placement_id");

CREATE TABLE IF NOT EXISTS "member_next_best_actions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cta_label" TEXT NOT NULL,
    "cta_href" TEXT NOT NULL,
    "icon" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "member_next_best_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "member_next_best_actions_member_id_status_priority_idx" ON "member_next_best_actions" ("member_id", "status", "priority");

CREATE TABLE IF NOT EXISTS "mentor_specialties" (
    "id" TEXT NOT NULL,
    "mentor_id" TEXT NOT NULL REFERENCES "mentors"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    CONSTRAINT "mentor_specialties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mentor_specialties_mentor_id_idx" ON "mentor_specialties" ("mentor_id");