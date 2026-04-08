-- Fix: Allow clients to READ their own session notes
-- Fix: Add UPDATE policy for mentors
-- Execute in Supabase Dashboard > SQL Editor

DROP POLICY IF EXISTS session_notes_select ON session_notes;
CREATE POLICY session_notes_select ON session_notes
  FOR SELECT USING (
    auth.uid() = mentor_id
    OR auth.uid() = client_id
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS session_notes_update ON session_notes;
CREATE POLICY session_notes_update ON session_notes
  FOR UPDATE USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);
