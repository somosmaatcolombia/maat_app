-- =====================================================
-- MAAT — Fixes de prioridad alta
-- Ejecutar en Supabase SQL Editor (Dashboard)
-- Fecha: 2026-03-17
-- SEGURO re-ejecutar (idempotente)
-- =====================================================

-- =====================================================
-- FIX 1: UNIQUE(user_id, date) en calibrations
-- Previene calibraciones duplicadas el mismo día.
-- Sin este constraint, dos pestañas abiertas pueden
-- insertar doble calibración.
-- =====================================================

-- Primero: limpiar duplicados existentes (conservar el más reciente)
DELETE FROM calibrations
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, date) id
  FROM calibrations
  ORDER BY user_id, date, created_at DESC
);

-- Agregar constraint (IF NOT EXISTS — idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'calibrations'
      AND constraint_name = 'calibrations_user_date_unique'
  ) THEN
    ALTER TABLE calibrations
      ADD CONSTRAINT calibrations_user_date_unique UNIQUE (user_id, date);
  END IF;
END $$;

-- =====================================================
-- FIX 2: Activar pg_cron + pg_net para push notifications
-- pg_cron permite programar tareas periódicas en PostgreSQL.
-- pg_net permite hacer HTTP requests desde SQL.
-- =====================================================

-- Paso 1: Habilitar extensiones
-- NOTA: pg_cron y pg_net deben estar habilitados primero
-- desde Supabase Dashboard → Database → Extensions.
-- Buscar "pg_cron" y "pg_net", activar ambos.
-- Luego ejecutar este SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Paso 2: Programar send-notifications cada hora en punto
-- Usa pg_net para invocar la Edge Function via HTTP POST
-- El CRON_SECRET debe estar configurado en Supabase Secrets
SELECT cron.schedule(
  'send-maat-notifications',        -- nombre del job
  '0 * * * *',                      -- cada hora en punto
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true)
           || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =====================================================
-- ALTERNATIVA: Si current_setting no tiene los valores,
-- usa esta versión con URL y secret hardcodeados.
-- Descomenta SOLO si la versión de arriba falla.
-- =====================================================
/*
SELECT cron.schedule(
  'send-maat-notifications',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pcclptmojjzqmfmzftot.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer TU_CRON_SECRET_AQUI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
*/

-- =====================================================
-- VERIFICACION
-- =====================================================

-- Verificar constraint UNIQUE en calibrations
SELECT 'calibrations_user_date_unique' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END AS status
FROM information_schema.table_constraints
WHERE table_name = 'calibrations'
  AND constraint_name = 'calibrations_user_date_unique';

-- Verificar que pg_cron está activo
SELECT 'pg_cron extension' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NOT INSTALLED' END AS status
FROM pg_extension WHERE extname = 'pg_cron';

-- Verificar que pg_net está activo
SELECT 'pg_net extension' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NOT INSTALLED' END AS status
FROM pg_extension WHERE extname = 'pg_net';

-- Verificar job programado
SELECT 'cron job scheduled' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK — ' || schedule ELSE 'NOT FOUND' END AS status
FROM cron.job
WHERE jobname = 'send-maat-notifications'
GROUP BY schedule;
