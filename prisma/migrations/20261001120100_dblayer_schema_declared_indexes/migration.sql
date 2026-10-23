-- Data-layer audit 2026-09-22, item 2: indexes prisma/schema.prisma declares
-- (`@@index`) that production does not have.
--
-- Drift found by pushing schema.prisma into a scratch PostgreSQL and diffing
-- pg_indexes against production: 27 schema-declared indexes are missing in
-- production. Every `prisma db push` environment (the CI contract lane, local
-- dev, preview) has them, so plans tested there are not the plans production
-- runs. This creates the 21 that a query or a delete path needs; the other
-- five are covered by an equivalent or stricter production index and are
-- listed at the end.
--
-- Group A — filtered / sorted by a query in lib/ or app/api/:
--   member_events (user_id, created_at)
--     lib/member/getMemberState.ts:510 (userId + createdAt >= 90d, ORDER BY createdAt DESC)
--     lib/readiness/score.ts:185 (userId, ORDER BY createdAt DESC LIMIT 1)
--     lib/admin/studentsRosterLoad.ts:119 / analyticsOverview.ts:115 (groupBy userId, createdAt >= 30d)
--   member_events (user_id, event_name, created_at)
--     lib/member/skillMissions.ts:83 and :308 (userId + eventName IN + createdAt >= since)
--     lib/readiness/score.ts:181 / :262 (userId + eventName + createdAt)
--   message_threads (counselor_user_id), (staff_user_id)
--     lib/admin/memberMerge.ts:219 counts and repoints by counselorUserId; the
--     SET NULL rule on both columns runs `UPDATE message_threads ... WHERE
--     counselor_user_id = $1` on every staff deletion. 20260921010000_wap33
--     recorded these two as "already in schema.prisma"; they never reached production.
--   message_threads (kind, created_at)
--     lib/messages/superAdminMessageQueries.ts:144 (kind = 'member', newest first)
--   xapi_statements (actor_email, course_id), (course_id, course_item_id)
--     app/api/admin/training-progress/items/route.ts:134-136 (actorEmail + courseId + courseItemId IS NOT NULL)
--     lib/coursera/replayPendingXapi.ts:65 / app/api/admin/coursera/backfill-xapi/route.ts:88 (actorEmail)
--   xapi_statements (actor_account_name, actor_home_page)
--     lib/coursera/replayPendingXapi.ts:117 (actorAccountName)
--
-- Group B — foreign-key columns with no index. PostgreSQL runs the ON DELETE
-- action of every referencing table as `UPDATE/DELETE ... WHERE <fk> = $1`,
-- so each is a sequential scan on every hard delete of a user
-- (POST /api/admin/members/[id]/erase, lib/retention/cleanup.ts purge,
-- lib/admin/memberMerge.ts) or of a subgroup (app/api/admin/subgroups/[id]).
-- Same class as 20260921010000_wap33_fk_indexes_drop_duplicates.
--   application_ai_feedback.primary_ai_tool_result_id  -> ai_tool_results (cascade from users)
--   course_enrollments.enrolled_by_admin_id            -> users
--   coursera_canonical_course_mappings.created_by_id   -> users
--   invitations.accepted_by                            -> users
--   invitations.subgroup_id                            -> subgroups
--   jobs.approved_by                                   -> users
--   member_subgroups.assigned_by                       -> users
--   partner_outreach_logs.created_by_user_id           -> users
--   points_transactions.awarded_by                     -> users
--   portal_workflow_events.actor_user_id               -> users
--   program_change_requests.reviewed_by_id             -> users
--   subgroups.created_by                               -> users
--   users.wioa_reviewed_by_user_id                     -> users
--
-- Not created (production already has an equivalent or stricter index):
--   milestone_cascades (user_id, created_at)      -> milestone_cascades_user_created_idx (user_id, created_at DESC)
--   coursera_course_progress (organization_id, last_activity_time) -> coursera_course_progress_org_id_idx (…, DESC)
--   coursera_badge_progress (organization_id, last_activity_time)  -> coursera_badge_progress_org_id_idx (…, DESC)
--   xapi_statements (statement_hash)              -> xapi_statements_statement_hash_key (UNIQUE)
--   organizations custom_domain @unique           -> organizations_custom_domain_key partial UNIQUE WHERE NOT NULL
-- And not created for lack of any query: pre_screening_responses (organization_id).
--
-- Names and column lists are exactly what `prisma db push` generates from the
-- schema, so `prisma migrate diff` reports no drift afterwards. CREATE INDEX
-- CONCURRENTLY cannot run through `prisma migrate deploy` (the migration
-- executes inside one transaction), so these are plain CREATE INDEX with a
-- lock timeout; the largest table involved is member_events (7,686 rows,
-- 2.9 MB on 2026-09-22), the whole database is under 70 MB.
-- Additive and idempotent (IF NOT EXISTS).

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

-- Group A
CREATE INDEX IF NOT EXISTS "member_events_user_id_created_at_idx"
  ON "member_events"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "member_events_user_id_event_name_created_at_idx"
  ON "member_events"("user_id", "event_name", "created_at");
CREATE INDEX IF NOT EXISTS "message_threads_counselor_user_id_idx"
  ON "message_threads"("counselor_user_id");
CREATE INDEX IF NOT EXISTS "message_threads_staff_user_id_idx"
  ON "message_threads"("staff_user_id");
CREATE INDEX IF NOT EXISTS "message_threads_kind_created_at_idx"
  ON "message_threads"("kind", "created_at");
CREATE INDEX IF NOT EXISTS "xapi_statements_actor_email_course_id_idx"
  ON "xapi_statements"("actor_email", "course_id");
CREATE INDEX IF NOT EXISTS "xapi_statements_course_id_course_item_id_idx"
  ON "xapi_statements"("course_id", "course_item_id");
CREATE INDEX IF NOT EXISTS "xapi_statements_actor_account_name_actor_home_page_idx"
  ON "xapi_statements"("actor_account_name", "actor_home_page");

-- Group B
CREATE INDEX IF NOT EXISTS "application_ai_feedback_primary_ai_tool_result_id_idx"
  ON "application_ai_feedback"("primary_ai_tool_result_id");
CREATE INDEX IF NOT EXISTS "course_enrollments_enrolled_by_admin_id_idx"
  ON "course_enrollments"("enrolled_by_admin_id");
CREATE INDEX IF NOT EXISTS "coursera_canonical_course_mappings_created_by_id_idx"
  ON "coursera_canonical_course_mappings"("created_by_id");
CREATE INDEX IF NOT EXISTS "invitations_accepted_by_idx"
  ON "invitations"("accepted_by");
CREATE INDEX IF NOT EXISTS "invitations_subgroup_id_idx"
  ON "invitations"("subgroup_id");
CREATE INDEX IF NOT EXISTS "jobs_approved_by_idx"
  ON "jobs"("approved_by");
CREATE INDEX IF NOT EXISTS "member_subgroups_assigned_by_idx"
  ON "member_subgroups"("assigned_by");
CREATE INDEX IF NOT EXISTS "partner_outreach_logs_created_by_user_id_idx"
  ON "partner_outreach_logs"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "points_transactions_awarded_by_idx"
  ON "points_transactions"("awarded_by");
CREATE INDEX IF NOT EXISTS "portal_workflow_events_actor_user_id_idx"
  ON "portal_workflow_events"("actor_user_id");
CREATE INDEX IF NOT EXISTS "program_change_requests_reviewed_by_id_idx"
  ON "program_change_requests"("reviewed_by_id");
CREATE INDEX IF NOT EXISTS "subgroups_created_by_idx"
  ON "subgroups"("created_by");
CREATE INDEX IF NOT EXISTS "users_wioa_reviewed_by_user_id_idx"
  ON "users"("wioa_reviewed_by_user_id");

COMMIT;

-- Down (manual): DROP INDEX IF EXISTS for each name above, e.g.
--   DROP INDEX IF EXISTS "member_events_user_id_created_at_idx";
-- Dropping them re-creates the drift against schema.prisma; nothing else depends on them.
