ALTER TABLE "at_risk_alerts"
    ADD COLUMN IF NOT EXISTS "notified_counselor_at" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "escalated_at" TIMESTAMPTZ;