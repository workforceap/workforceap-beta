CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS TEXT AS $$
BEGIN RETURN COALESCE(current_setting('app.current_user_id', true), NULL);
EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_org_id() RETURNS TEXT AS $$
BEGIN RETURN COALESCE(current_setting('app.current_org_id', true), NULL);
EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_role() RETURNS TEXT AS $$
BEGIN RETURN COALESCE(current_setting('app.current_role', true), NULL);
EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_admin() RETURNS BOOLEAN AS $$
BEGIN RETURN get_current_role() IN ('admin', 'super_admin'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_super_admin() RETURNS BOOLEAN AS $$
BEGIN RETURN get_current_role() = 'super_admin'; END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_counselor_for_member(check_member_id TEXT) RETURNS BOOLEAN AS $$
DECLARE cu TEXT;
BEGIN
  cu := get_current_user_id();
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM counselor_assignments ca JOIN counselors c ON ca.counselor_id = c.id WHERE ca.member_id = check_member_id AND c.user_id = cu AND ca.active = true);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_for_member_data(check_user_id TEXT) RETURNS BOOLEAN AS $$
DECLARE co TEXT;
BEGIN
  co := get_current_org_id();
  IF is_current_super_admin() THEN RETURN TRUE; END IF;
  IF is_current_admin() AND co IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM users u WHERE u.id = check_user_id AND u.organization_id = co);
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_access_org_row(check_org_id TEXT) RETURNS BOOLEAN AS $$
DECLARE co TEXT;
BEGIN
  co := get_current_org_id();
  IF is_current_super_admin() THEN RETURN TRUE; END IF;
  IF is_current_admin() AND co IS NOT NULL AND co = check_org_id THEN RETURN TRUE; END IF;
  IF co IS NOT NULL AND co = check_org_id THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_employer(check_employer_id TEXT) RETURNS BOOLEAN AS $$
DECLARE cu TEXT;
BEGIN
  cu := get_current_user_id();
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM employers e WHERE e.id = check_employer_id AND e.user_id = cu);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_current_partner(check_partner_id TEXT) RETURNS BOOLEAN AS $$
DECLARE cu TEXT; cp TEXT;
BEGIN
  cu := get_current_user_id();
  cp := COALESCE(current_setting('app.current_partner_id', true), NULL);
  IF cp IS NOT NULL AND cp = check_partner_id THEN RETURN TRUE; END IF;
  IF cu IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM partner_users pu WHERE pu.partner_id = check_partner_id AND pu.user_id = cu);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','profiles','applications','job_applications','readiness_checklist','benefit_requests','program_change_requests',
    'learning_progress','goals','resource_progress','member_events','weekly_recaps','pathway_step_progress','training_access_requests',
    'ai_tool_results','application_ai_feedback','user_certifications','course_progress','member_program_progress',
    'pre_screening_responses','pre_screening_drafts','placement_records','placed_outcomes','counselor_notes','counselor_assignments',
    'partner_referrals','partner_outreach_logs','message_threads','messages','job_posting_applications','application_messages',
    'portal_workflow_events','ai_job_matches','member_next_best_actions','member_points','points_transactions','at_risk_alerts',
    'placement_surveys','testimonials','coursera_course_progress','coursera_badge_progress','coursera_skillset_progress',
    'coursera_identity_mappings','xapi_statements','employers','employer_hiring_intents','jobs','partners','partner_users',
    'counselors','subgroups','member_subgroups','subgroup_leaders','invitations','courses','organization_program_catalog',
    'employer_screening_packs','coursera_canonical_course_mappings','organizations','user_roles','resources','audit_logs'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    ELSE
      RAISE NOTICE 'Skipping RLS enable on missing table: %', t;
    END IF;
  END LOOP;
END $$;