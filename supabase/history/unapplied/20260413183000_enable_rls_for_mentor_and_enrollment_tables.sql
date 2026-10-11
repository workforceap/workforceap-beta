-- Enable RLS for newly added mentor/member tables and enrollment data
ALTER TABLE mentor_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_next_best_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- mentors: authenticated users can see active mentors; mentors can see/update their own profile
DROP POLICY IF EXISTS "mentors_select_active" ON mentors;
CREATE POLICY "mentors_select_active" ON mentors
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND is_active = true
  );

DROP POLICY IF EXISTS "mentors_select_own" ON mentors;
CREATE POLICY "mentors_select_own" ON mentors
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "mentors_update_own" ON mentors;
CREATE POLICY "mentors_update_own" ON mentors
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- mentor_specialties: authenticated users can read specialties for visible mentors;
-- mentors can manage specialties tied to their own profile
DROP POLICY IF EXISTS "mentor_specialties_select_visible" ON mentor_specialties;
CREATE POLICY "mentor_specialties_select_visible" ON mentor_specialties
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM mentors m
      WHERE m.id = mentor_specialties.mentor_id
        AND (m.is_active = true OR m.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "mentor_specialties_insert_own" ON mentor_specialties;
CREATE POLICY "mentor_specialties_insert_own" ON mentor_specialties
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_specialties.mentor_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mentor_specialties_update_own" ON mentor_specialties;
CREATE POLICY "mentor_specialties_update_own" ON mentor_specialties
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_specialties.mentor_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_specialties.mentor_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mentor_specialties_delete_own" ON mentor_specialties;
CREATE POLICY "mentor_specialties_delete_own" ON mentor_specialties
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_specialties.mentor_id
        AND m.user_id = auth.uid()
    )
  );

-- mentor_sessions: members can manage their own sessions; mentors can access sessions assigned to them
DROP POLICY IF EXISTS "mentor_sessions_select_participant" ON mentor_sessions;
CREATE POLICY "mentor_sessions_select_participant" ON mentor_sessions
  FOR SELECT USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_sessions.mentor_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mentor_sessions_insert_participant" ON mentor_sessions;
CREATE POLICY "mentor_sessions_insert_participant" ON mentor_sessions
  FOR INSERT WITH CHECK (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_sessions.mentor_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mentor_sessions_update_participant" ON mentor_sessions;
CREATE POLICY "mentor_sessions_update_participant" ON mentor_sessions
  FOR UPDATE USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_sessions.mentor_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_sessions.mentor_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mentor_sessions_delete_participant" ON mentor_sessions;
CREATE POLICY "mentor_sessions_delete_participant" ON mentor_sessions
  FOR DELETE USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM mentors m
      WHERE m.id = mentor_sessions.mentor_id
        AND m.user_id = auth.uid()
    )
  );

-- member_next_best_actions: members can CRUD only their own actions
DROP POLICY IF EXISTS "member_next_best_actions_select_own" ON member_next_best_actions;
CREATE POLICY "member_next_best_actions_select_own" ON member_next_best_actions
  FOR SELECT USING (member_id = auth.uid());

DROP POLICY IF EXISTS "member_next_best_actions_insert_own" ON member_next_best_actions;
CREATE POLICY "member_next_best_actions_insert_own" ON member_next_best_actions
  FOR INSERT WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "member_next_best_actions_update_own" ON member_next_best_actions;
CREATE POLICY "member_next_best_actions_update_own" ON member_next_best_actions
  FOR UPDATE USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "member_next_best_actions_delete_own" ON member_next_best_actions;
CREATE POLICY "member_next_best_actions_delete_own" ON member_next_best_actions
  FOR DELETE USING (member_id = auth.uid());

-- course_enrollments: members can read/update only their own enrollment row
DROP POLICY IF EXISTS "course_enrollments_select_own" ON course_enrollments;
CREATE POLICY "course_enrollments_select_own" ON course_enrollments
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "course_enrollments_update_own" ON course_enrollments;
CREATE POLICY "course_enrollments_update_own" ON course_enrollments
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
