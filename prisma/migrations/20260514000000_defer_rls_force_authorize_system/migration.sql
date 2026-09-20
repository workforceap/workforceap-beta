-- ===========================================================================
-- Defer FORCE ROW LEVEL SECURITY + authorize 'system' role in RLS helpers
-- ===========================================================================
-- Addresses Codex P1s on PR #1185 against the GUC RLS rollout from
-- 20260513040000_add_rls_policies (master commit 12ab4e10):
--
--   1. r3238590386: "Do not force RLS before GUC coverage"
--      The prior migration ran `ALTER TABLE x FORCE ROW LEVEL SECURITY` on 46
--      tables, but no app routes / server components currently wrap their
--      Prisma calls with `runWithGucContext`. Master's middleware falls back
--      to an anonymous GUC when no scope exists, so on a connection role
--      that does NOT bypass RLS, ordinary authenticated pages (/dashboard,
--      /admin, etc.) would be denied by the per-table policies.
--
--      Currently masked in production because the Supabase postgres role
--      bypasses RLS — but the moment a stricter connection role is used, the
--      app breaks. We defer the FORCE until request-entry coverage lands.
--
--   2. r3238590392: "Authorize the system cron role under RLS"
--      `withCronLogging` (master commit 12ab4e10) wraps cron handlers in
--      `runWithGucContext(SYSTEM_GUC_CONTEXT, ...)` which sets
--      `app.current_role = 'system'`. But the helper functions in the prior
--      RLS migration only treat `admin` / `super_admin` as privileged —
--      `system` is not authorized by any policy. Every cron that touches
--      a P0 table (Coursera sync, at-risk, our new milestone-cascade ones,
--      etc.) would fail on an RLS-enforced connection.
--
-- Both issues are latent today (the bypass-role masks them) but fix them now
-- so the GUC enforcement work in flight isn't blocked by a sequence of
-- crons silently breaking.
--
-- This migration is forward-only and idempotent (CREATE OR REPLACE for
-- functions, NO FORCE is a no-op on already-not-forced tables).

-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 1: Authorize 'system' role across RLS helper functions.
--
-- 'system' is the cron / background-service role set by withCronLogging.
-- It needs blanket access — these jobs read and write member-scoped data
-- across the whole tenancy. We short-circuit each per-row helper to TRUE
-- when the role is 'system', so existing per-table policies that use these
-- helpers grant access automatically without rewriting every USING clause.
--
-- We do NOT make 'system' a super_admin equivalent — `is_current_super_admin`
-- stays restricted. Super-admin has admin-UI semantics that don't belong to
-- background jobs.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_current_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- 'system' included so cron-side calls that ask "is the caller privileged"
  -- get TRUE without the caller having to be human admin.
  RETURN get_current_role() IN ('admin', 'super_admin', 'system');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_counselor_for_member(check_member_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  cu TEXT;
BEGIN
  IF get_current_role() = 'system' THEN RETURN TRUE; END IF;
  cu := get_current_user_id();
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM counselor_assignments ca
    JOIN counselors c ON ca.counselor_id = c.id
    WHERE ca.member_id = check_member_id
      AND c.user_id = cu
      AND ca.active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_for_member_data(check_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  co TEXT;
BEGIN
  IF get_current_role() = 'system' THEN RETURN TRUE; END IF;
  co := get_current_org_id();
  IF is_current_super_admin() THEN RETURN TRUE; END IF;
  IF is_current_admin() AND co IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM users u WHERE u.id = check_user_id AND u.organization_id = co
    );
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_access_org_row(check_org_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  co TEXT;
BEGIN
  IF get_current_role() = 'system' THEN RETURN TRUE; END IF;
  co := get_current_org_id();
  IF is_current_super_admin() THEN RETURN TRUE; END IF;
  IF is_current_admin() AND co IS NOT NULL AND co = check_org_id THEN RETURN TRUE; END IF;
  RETURN co IS NOT NULL AND co = check_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_employer(check_employer_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  cu TEXT;
BEGIN
  IF get_current_role() = 'system' THEN RETURN TRUE; END IF;
  cu := get_current_user_id();
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM employers e WHERE e.id = check_employer_id AND e.user_id = cu
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_partner(check_partner_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  cu TEXT;
  cp TEXT;
BEGIN
  IF get_current_role() = 'system' THEN RETURN TRUE; END IF;
  cu := get_current_user_id();
  cp := COALESCE(current_setting('app.current_partner_id', true), NULL);
  IF cp IS NOT NULL AND cp = check_partner_id THEN RETURN TRUE; END IF;
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM partner_users pu WHERE pu.partner_id = check_partner_id AND pu.user_id = cu
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 2: Defer FORCE ROW LEVEL SECURITY on the 46 P0 tables.
--
-- The original migration FORCED RLS on every member-scoped table. With
-- request-entry GUC coverage incomplete, forcing the policies would deny
-- reads on the dashboard, admin pages, etc. for a connection role that
-- doesn't bypass RLS.
--
-- The policies themselves remain in place — they'll be evaluated whenever
-- RLS is active (e.g. for a non-superuser Supabase role). The FORCE flag
-- controls whether the TABLE OWNER role is also subject to the policies;
-- removing it restores the pre-migration "owner bypass" semantics that the
-- app currently relies on.
--
-- Re-enabling FORCE is a follow-up after `runWithGucContext` wraps every
-- request entry point (server components, route handlers, server actions).
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE applications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE job_applications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE readiness_checklist NO FORCE ROW LEVEL SECURITY;
ALTER TABLE benefit_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE program_change_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE learning_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE goals NO FORCE ROW LEVEL SECURITY;
ALTER TABLE resource_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE member_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE weekly_recaps NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pathway_step_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE training_access_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_results NO FORCE ROW LEVEL SECURITY;
ALTER TABLE application_ai_feedback NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_certifications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE course_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE member_program_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pre_screening_responses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pre_screening_drafts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE counselor_assignments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE counselor_notes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE placement_records NO FORCE ROW LEVEL SECURITY;
ALTER TABLE placed_outcomes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals NO FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_outreach_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE message_threads NO FORCE ROW LEVEL SECURITY;
ALTER TABLE messages NO FORCE ROW LEVEL SECURITY;
ALTER TABLE job_posting_applications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE application_messages NO FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_workflow_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_job_matches NO FORCE ROW LEVEL SECURITY;
ALTER TABLE member_next_best_actions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE member_points NO FORCE ROW LEVEL SECURITY;
ALTER TABLE points_transactions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE at_risk_alerts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE placement_surveys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE testimonials NO FORCE ROW LEVEL SECURITY;
ALTER TABLE coursera_course_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE coursera_badge_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE coursera_skillset_progress NO FORCE ROW LEVEL SECURITY;
ALTER TABLE coursera_identity_mappings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE xapi_statements NO FORCE ROW LEVEL SECURITY;
ALTER TABLE mentor_sessions NO FORCE ROW LEVEL SECURITY;

-- ─── Rollback / re-enable (manual, after GUC coverage lands) ────────────────
-- Once every request entry point wraps Prisma in `runWithGucContext` and the
-- middleware-anonymous-fallback path is removed, re-FORCE the tables. Until
-- then, leave them un-forced.
