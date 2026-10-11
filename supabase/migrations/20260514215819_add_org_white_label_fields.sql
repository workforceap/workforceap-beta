ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "accent_color" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscription_tier" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscription_status" TEXT NOT NULL DEFAULT 'trial';