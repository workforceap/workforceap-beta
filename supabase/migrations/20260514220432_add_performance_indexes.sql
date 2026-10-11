CREATE INDEX IF NOT EXISTS "xapi_statements_processed_created_at_idx" ON "xapi_statements" ("processed", "created_at");
CREATE INDEX IF NOT EXISTS "goals_user_id_created_at_idx" ON "goals" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "job_applications_user_id_created_at_idx" ON "job_applications" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "job_applications_user_id_status_created_at_idx" ON "job_applications" ("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ai_tool_results_user_id_created_at_idx" ON "ai_tool_results" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "counselor_assignments_member_id_active_assigned_at_idx" ON "counselor_assignments" ("member_id", "active", "assigned_at" DESC);
CREATE INDEX IF NOT EXISTS "messages_author_id_created_at_idx" ON "messages" ("author_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "course_progress_user_id_course_id_completed_at_idx" ON "course_progress" ("user_id", "course_id", "completed_at");