-- =====================================================
-- MAAT — Fixes de prioridad baja
-- Ejecutar en Supabase SQL Editor (Dashboard)
-- Fecha: 2026-03-17
-- SEGURO re-ejecutar (idempotente)
-- =====================================================

-- =====================================================
-- FIX 1: Tabla chat_messages — persistir historial
-- del Coach IA en el servidor (multi-dispositivo)
-- =====================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  messages      JSONB DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
CREATE POLICY chat_messages_update ON chat_messages
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON chat_messages;
CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- FIX 2: Habilitar Realtime en session_notes
-- Para que el cliente reciba notificaciones en vivo
-- cuando el mentor escribe una nota de sesión
-- =====================================================
-- NOTA: Realtime debe habilitarse desde:
-- Supabase Dashboard → Database → Replication
-- Buscar tabla "session_notes" y activar realtime.
-- O ejecutar este SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE session_notes;

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT 'chat_messages table' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END AS status
FROM information_schema.tables
WHERE table_name = 'chat_messages' AND table_schema = 'public';

SELECT 'chat_messages RLS' AS check_item,
  CASE WHEN COUNT(*) >= 3 THEN 'OK' ELSE 'MISSING (' || COUNT(*) || ' policies)' END AS status
FROM pg_policies WHERE tablename = 'chat_messages';

SELECT 'session_notes realtime' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NOT ENABLED' END AS status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'session_notes';
