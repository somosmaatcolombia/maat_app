-- =====================================================
-- MAAT - Cron para community-activity (reacciones en mis posts, agrupadas)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
--
-- Requiere pg_cron + pg_net YA habilitados (lo estan: los usa send-notifications).
-- Reutiliza los mismos settings que las otras funciones:
--   app.settings.supabase_url  y  app.settings.cron_secret
-- Por eso no hay que hardcodear el secret aqui.
--
-- Frecuencia: cada 3 horas. Agrupa las reacciones para no mandar un push por cada una.

-- Si el job ya existe, lo quita primero (idempotente al re-correr).
SELECT cron.unschedule('maat-community-activity')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maat-community-activity');

SELECT cron.schedule(
  'maat-community-activity',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true)
           || '/functions/v1/community-activity',
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
WHERE jobname = 'maat-community-activity';
