-- =====================================================
-- MAAT - Mensaje personal de la manana (opcional, por cliente)
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente.
-- =====================================================
-- Permite que cada cliente escriba SU propio texto para la notificacion
-- matutina. Si esta vacio, el motor usa la plantilla del mentor o el default.
-- Las horas (notif_morning_hour / notif_evening_hour) y el switch
-- (notif_enabled) ya existen desde maat_auto_notifications.sql.
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notif_custom_morning TEXT;

-- Verificacion
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='profiles' AND column_name='notif_custom_morning';
