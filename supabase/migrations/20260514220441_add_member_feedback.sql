CREATE TABLE IF NOT EXISTS "member_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "member_feedback_user_id_idx" ON "member_feedback"("user_id");
CREATE INDEX IF NOT EXISTS "member_feedback_type_idx" ON "member_feedback"("type");
CREATE INDEX IF NOT EXISTS "member_feedback_rating_idx" ON "member_feedback"("rating");
CREATE INDEX IF NOT EXISTS "member_feedback_created_at_idx" ON "member_feedback"("created_at");
DO $$ BEGIN
    ALTER TABLE "member_feedback" ADD CONSTRAINT "member_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;