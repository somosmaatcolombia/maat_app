-- =====================================================
-- MAAT - Plantillas / mensajes de notificacion del mentor
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente.
--
-- Permite al mentor componer mensajes de push y enviarlos a TODOS sus clientes o
-- a un GRUPO especifico, y guardarlos como plantillas reutilizables.

CREATE TABLE IF NOT EXISTS notification_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  audience     TEXT NOT NULL DEFAULT 'all',   -- 'all' | 'group'
  group_id     UUID REFERENCES mentor_groups(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT notif_tpl_audience CHECK (
    audience IN ('all','group') AND (audience <> 'group' OR group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_notif_tpl_mentor ON notification_templates(mentor_id);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_tpl_select ON notification_templates;
CREATE POLICY notif_tpl_select ON notification_templates
  FOR SELECT USING (auth.uid() = mentor_id OR get_my_role() = 'admin');

DROP POLICY IF EXISTS notif_tpl_insert ON notification_templates;
CREATE POLICY notif_tpl_insert ON notification_templates
  FOR INSERT WITH CHECK (
    auth.uid() = mentor_id AND get_my_role() IN ('mentor','admin')
  );

DROP POLICY IF EXISTS notif_tpl_update ON notification_templates;
CREATE POLICY notif_tpl_update ON notification_templates
  FOR UPDATE USING (auth.uid() = mentor_id OR get_my_role() = 'admin')
  WITH CHECK (auth.uid() = mentor_id OR get_my_role() = 'admin');

DROP POLICY IF EXISTS notif_tpl_delete ON notification_templates;
CREATE POLICY notif_tpl_delete ON notification_templates
  FOR DELETE USING (auth.uid() = mentor_id OR get_my_role() = 'admin');

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT 'notification_templates' AS tabla, count(*) AS filas FROM notification_templates;
