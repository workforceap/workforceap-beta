CREATE TABLE IF NOT EXISTS "cron_executions" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "records_processed" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cron_executions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cron_executions_job_name_created_at_idx" ON "cron_executions"("job_name", "created_at");
CREATE INDEX IF NOT EXISTS "cron_executions_status_created_at_idx" ON "cron_executions"("status", "created_at");
CREATE INDEX IF NOT EXISTS "cron_executions_started_at_idx" ON "cron_executions"("started_at");