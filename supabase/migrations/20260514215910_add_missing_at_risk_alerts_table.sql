CREATE TABLE IF NOT EXISTS "at_risk_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "counselor_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "notified_counselor_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "at_risk_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "at_risk_alerts_user_id_created_at_idx" ON "at_risk_alerts" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "at_risk_alerts_status_score_idx" ON "at_risk_alerts" ("status", "score");
CREATE INDEX IF NOT EXISTS "at_risk_alerts_counselor_id_idx" ON "at_risk_alerts" ("counselor_id");