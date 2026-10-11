CREATE TABLE IF NOT EXISTS "milestone_cascades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "milestone_type" TEXT NOT NULL,
    "milestone_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_draft',
    "program_slug" TEXT,
    "context_snapshot" JSONB NOT NULL,
    "source_event_id" TEXT,
    "counselor_brief" TEXT,
    "drafts" JSONB,
    "draft_model" TEXT,
    "draft_prompt_version" TEXT,
    "drafted_at" TIMESTAMPTZ,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMPTZ,
    "dismissed_at" TIMESTAMPTZ,
    "dismissed_reason" TEXT,
    "sent_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "milestone_cascades_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "milestone_cascades_status_check" CHECK (
      "status" IN ('pending_draft','awaiting_approval','approved','sent','dismissed','expired')
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS "milestone_cascades_idempotency" ON "milestone_cascades" ("user_id", "milestone_type", "milestone_ref");
CREATE INDEX IF NOT EXISTS "milestone_cascades_status_expires_idx" ON "milestone_cascades" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "milestone_cascades_user_created_idx" ON "milestone_cascades" ("user_id", "created_at" DESC);