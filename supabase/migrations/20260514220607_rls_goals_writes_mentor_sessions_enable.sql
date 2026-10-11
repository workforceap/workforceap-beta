DROP POLICY IF EXISTS "goals_insert_own" ON goals;
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (user_id = get_current_user_id());
DROP POLICY IF EXISTS "goals_insert_admin" ON goals;
CREATE POLICY "goals_insert_admin" ON goals FOR INSERT WITH CHECK (is_admin_for_member_data(user_id));
DROP POLICY IF EXISTS "goals_insert_counselor" ON goals;
CREATE POLICY "goals_insert_counselor" ON goals FOR INSERT WITH CHECK (is_counselor_for_member(user_id));
DROP POLICY IF EXISTS "goals_update_own" ON goals;
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
DROP POLICY IF EXISTS "goals_update_admin" ON goals;
CREATE POLICY "goals_update_admin" ON goals FOR UPDATE USING (is_admin_for_member_data(user_id)) WITH CHECK (is_admin_for_member_data(user_id));
DROP POLICY IF EXISTS "goals_update_counselor" ON goals;
CREATE POLICY "goals_update_counselor" ON goals FOR UPDATE USING (is_counselor_for_member(user_id)) WITH CHECK (is_counselor_for_member(user_id));
DROP POLICY IF EXISTS "goals_delete_own" ON goals;
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (user_id = get_current_user_id());
DROP POLICY IF EXISTS "goals_delete_admin" ON goals;
CREATE POLICY "goals_delete_admin" ON goals FOR DELETE USING (is_admin_for_member_data(user_id));

ALTER TABLE mentor_sessions ENABLE ROW LEVEL SECURITY;