-- Additive. One cumulative Coursera learning-hours reading per learner, course
-- and Central-time day, so the student sign-in timesheet can show daily study
-- minutes (the difference between consecutive days). No existing table changes.
-- Service-role access only: RLS on with no policies, like coursera_course_progress.
BEGIN;
SELECT pg_advisory_xact_lock(611251200);
CREATE TABLE "coursera_learning_hours_snapshots" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "external_email" TEXT NOT NULL CHECK ("external_email" = lower("external_email") AND btrim("external_email") <> ''),
  "coursera_course_id" TEXT NOT NULL CHECK (btrim("coursera_course_id") <> ''),
  "snapshot_date" DATE NOT NULL,
  "learning_hours" DECIMAL(8,2) NOT NULL CHECK ("learning_hours" >= 0),
  "source" TEXT NOT NULL,
  "first_captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "coursera_learning_hours_snapshots_org_email_course_day_key"
  ON "coursera_learning_hours_snapshots"("organization_id", "external_email", "coursera_course_id", "snapshot_date");
CREATE INDEX "coursera_learning_hours_snapshots_user_id_snapshot_date_idx"
  ON "coursera_learning_hours_snapshots"("user_id", "snapshot_date");
CREATE INDEX "coursera_learning_hours_snapshots_organization_id_snapshot_date_idx"
  ON "coursera_learning_hours_snapshots"("organization_id", "snapshot_date");
ALTER TABLE "coursera_learning_hours_snapshots" ENABLE ROW LEVEL SECURITY;
COMMIT;
