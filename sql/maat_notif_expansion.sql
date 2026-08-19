-- =====================================================
-- MAAT - Expansion de notificaciones
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente. Requiere maat_notification_templates.sql + maat_auto_notifications.sql
-- + maat_comunimaat.sql + las tablas de sesiones (mentor_sessions).
-- =====================================================
-- Agrega el soporte de BD para 3 notificaciones nuevas/ajustadas:
--   push_inactive          -> re-enganche por ausencia (2/5/9 dias)
--   push_community_prompt   -> invitacion a postear en ComuniMAAT (semanal)
--   push_session_prep       -> preparacion 1 dia antes de la sesion + pendientes
--   push_community_activity -> reacciones en mis posts (agrupadas)
-- =====================================================

-- -----------------------------------------------------
-- 1. Slots editables nuevos (texto configurable desde el portal del mentor)
--    Se amplia el CHECK para permitir las ranuras nuevas. Las plantillas se
--    crean solas cuando el mentor las edita; si no, el motor usa su DEFAULT.
-- -----------------------------------------------------
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notif_tpl_slot_chk;
ALTER TABLE notification_templates ADD CONSTRAINT notif_tpl_slot_chk
  CHECK (slot IS NULL OR slot IN (
    'morning','evening','coherence','weekly',
    'inactive','community_prompt','session_prep'
  ));

-- -----------------------------------------------------
-- 2. Comunidad: marca de "reaccion ya notificada" (para agrupar / batch)
--    NULL = pendiente de avisar al dueno del post.
-- -----------------------------------------------------
ALTER TABLE community_reactions ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_creact_unnotified
  ON community_reactions(post_id) WHERE notified_at IS NULL;

-- -----------------------------------------------------
-- 3. Sesiones: marca de "prep de 1 dia antes ya enviado"
--    (separado de reminders_sent, que rastrea los offsets del recordatorio).
-- -----------------------------------------------------
ALTER TABLE mentor_sessions ADD COLUMN IF NOT EXISTS prep_sent BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------
-- 4. Verificacion
-- -----------------------------------------------------
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conname = 'notif_tpl_slot_chk';

SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name='community_reactions' AND column_name='notified_at')
   OR (table_name='mentor_sessions'     AND column_name='prep_sent')
ORDER BY table_name;
