-- =====================================================
-- MAAT - Notificaciones automaticas con texto editable (ritual)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente. Requiere que ya exista notification_templates
-- (sql/maat_notification_templates.sql).
--
-- Conecta el motor automatico (manana/noche/coherencia/semanal) con plantillas
-- EDITABLES desde el portal: cada "ranura" (slot) tiene una plantilla activa cuyo
-- texto el mentor cambia cuando quiera, sin tocar codigo.

-- 1. Slots en las plantillas
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS slot      TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- slot valido: NULL (plantilla manual) o una de las 4 ranuras del ritual
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notif_tpl_slot_chk;
ALTER TABLE notification_templates ADD CONSTRAINT notif_tpl_slot_chk
  CHECK (slot IS NULL OR slot IN ('morning','evening','coherence','weekly'));

-- Una sola plantilla por (mentor, slot): el editor del portal hace upsert sobre esto
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tpl_mentor_slot
  ON notification_templates(mentor_id, slot) WHERE slot IS NOT NULL;

-- 2. Horas del ritual + switch general (preferencia por cliente)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_morning_hour INTEGER DEFAULT 8;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_evening_hour INTEGER DEFAULT 20;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_enabled      BOOLEAN DEFAULT true;

-- Migrar la preferencia de hora existente a la hora de la manana
UPDATE profiles
   SET notif_morning_hour = COALESCE(notification_hour, 8)
 WHERE notif_morning_hour IS NULL
    OR notif_morning_hour = 8;   -- solo si quedo en el default, respeta lo ya migrado

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='notification_templates' AND column_name IN ('slot','is_active')
ORDER BY column_name;

SELECT column_name, column_default FROM information_schema.columns
WHERE table_name='profiles'
  AND column_name IN ('notif_morning_hour','notif_evening_hour','notif_enabled')
ORDER BY column_name;
