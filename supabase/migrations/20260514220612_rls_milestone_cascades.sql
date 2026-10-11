ALTER TABLE milestone_cascades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "milestone_cascades_select_own" ON milestone_cascades;
CREATE POLICY "milestone_cascades_select_own" ON milestone_cascades FOR SELECT USING (user_id = get_current_user_id());
DROP POLICY IF EXISTS "milestone_cascades_select_admin" ON milestone_cascades;
CREATE POLICY "milestone_cascades_select_admin" ON milestone_cascades FOR SELECT USING (is_admin_for_member_data(user_id));
DROP POLICY IF EXISTS "milestone_cascades_select_counselor" ON milestone_cascades;
CREATE POLICY "milestone_cascades_select_counselor" ON milestone_cascades FOR SELECT USING (is_counselor_for_member(user_id));
DROP POLICY IF EXISTS "milestone_cascades_select_system" ON milestone_cascades;
CREATE POLICY "milestone_cascades_select_system" ON milestone_cascades FOR SELECT USING (current_setting('app.current_role', true) = 'system');

DROP POLICY IF EXISTS "milestone_cascades_insert_admin" ON milestone_cascades;
CREATE POLICY "milestone_cascades_insert_admin" ON milestone_cascades FOR INSERT WITH CHECK (is_admin_for_member_data(user_id));
DROP POLICY IF EXISTS "milestone_cascades_insert_system" ON milestone_cascades;
CREATE POLICY "milestone_cascades_insert_system" ON milestone_cascades FOR INSERT WITH CHECK (current_setting('app.current_role', true) = 'system');

DROP POLICY IF EXISTS "milestone_cascades_update_admin" ON milestone_cascades;
CREATE POLICY "milestone_cascades_update_admin" ON milestone_cascades FOR UPDATE USING (is_admin_for_member_data(user_id)) WITH CHECK (is_admin_for_member_data(user_id));
DROP POLICY IF EXISTS "milestone_cascades_update_system" ON milestone_cascades;
CREATE POLICY "milestone_cascades_update_system" ON milestone_cascades FOR UPDATE USING (current_setting('app.current_role', true) = 'system') WITH CHECK (current_setting('app.current_role', true) = 'system');

DROP POLICY IF EXISTS "milestone_cascades_delete_admin" ON milestone_cascades;
CREATE POLICY "milestone_cascades_delete_admin" ON milestone_cascades FOR DELETE USING (is_admin_for_member_data(user_id));