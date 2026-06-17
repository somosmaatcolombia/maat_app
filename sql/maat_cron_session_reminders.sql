-- =====================================================
-- MAAT - Cron para session-reminders (recordatorios de sesiones)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
--
-- Requiere pg_cron + pg_net YA habilitados (lo estan: los usa send-notifications).
-- Reutiliza los mismos settings que send-maat-notifications:
--   app.settings.supabase_url  y  app.settings.cron_secret
-- Por eso no hay que hardcodear el secret aqui.
--
-- Frecuencia: cada 15 min, para que el recordatorio de "15 minutos antes" dispare.
--
-- NOTA: no usamos bloques /* ... */ porque el cron '*/15 ...' contiene la
--       secuencia */ y romperia el comentario.

-- Si el job ya existe, lo quita primero (idempotente al re-correr).
SELECT cron.unschedule('maat-session-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maat-session-reminders');

SELECT cron.schedule(
  'maat-session-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true)
           || '/functions/v1/session-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =====================================================
-- VERIFICACION
-- =====================================================
-- El job quedo programado y activo (debe devolver 1 fila):
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'maat-session-reminders';

-- (Opcional) Confirmar que los settings existen (deben venir con valor):
-- SELECT current_setting('app.settings.supabase_url', true) AS url,
--        left(current_setting('app.settings.cron_secret', true), 4) || '...' AS secret_prefix;
