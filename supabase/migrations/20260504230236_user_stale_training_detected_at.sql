ALTER TABLE "users" ADD COLUMN "stale_training_detected_at" TIMESTAMP(3);

CREATE INDEX "users_stale_training_detected_at_idx" ON "users"("stale_training_detected_at");