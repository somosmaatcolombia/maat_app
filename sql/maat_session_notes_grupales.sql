-- =====================================================
-- MAAT - Notas de sesion grupales (Sprint B)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente.
--
-- Agrega group_id a session_notes para identificar las notas que el mentor
-- envia en bloque a todo un grupo (broadcast). Las notas 1:1 dejan group_id NULL.

ALTER TABLE session_notes
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES mentor_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_notes_group
  ON session_notes(group_id) WHERE group_id IS NOT NULL;

-- Verificacion: la columna existe
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'session_notes' AND column_name = 'group_id';
