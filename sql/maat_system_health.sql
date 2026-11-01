-- =====================================================
-- MAAT - Salud del sistema: vigilante de crons y push (RUNBOOK #24)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot). Idempotente.
--
-- Que crea:
--   1. system_alerts            registro de alertas (solo la funcion health-watch escribe; mentor/admin leen)
--   2. _system_health_raw()     foto del sistema: tareas pg_cron + respuestas HTTP (net._http_response) + push enviados
--                               (solo service_role: la usa la funcion health-watch)
--   3. admin_system_health()    la misma foto + alertas recientes, para la tarjeta "Salud del sistema" de /panel/
--                               (solo mentor/admin)
--   4. cron 'maat-health-watch' cada hora (minuto 25) que llama a la funcion health-watch
--
-- Requiere pg_cron + pg_net (ya habilitados) y los mismos settings de las otras funciones:
--   app.settings.supabase_url  y  app.settings.cron_secret
-- Despliegue de la funcion:  supabase functions deploy health-watch --no-verify-jwt --project-ref pcclptmojjzqmfmzftot

-- 1. Registro de alertas ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  emailed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON public.system_alerts (created_at DESC);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_alerts_staff_read ON public.system_alerts;
CREATE POLICY system_alerts_staff_read ON public.system_alerts
  FOR SELECT USING (COALESCE(get_my_role(), '') IN ('mentor', 'admin'));
-- Sin politicas de escritura: solo service_role (la funcion) inserta.
REVOKE ALL ON public.system_alerts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.system_alerts FROM authenticated;
GRANT SELECT ON public.system_alerts TO authenticated;

-- 2. Foto del sistema (privada) ---------------------------------------------
CREATE OR REPLACE FUNCTION public._system_health_raw()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jobs jsonb;
  v_http jsonb;
  v_push jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
           'last_run', r.start_time, 'last_status', r.status
         ) ORDER BY j.jobid), '[]'::jsonb)
    INTO v_jobs
    FROM cron.job j
    LEFT JOIN LATERAL (
      SELECT d.start_time, d.status
        FROM cron.job_run_details d
       WHERE d.jobid = j.jobid
       ORDER BY d.start_time DESC
       LIMIT 1
    ) r ON true;

  -- Un cron "exitoso" solo significa que la llamada salio; el resultado real (200/401/500) queda aqui.
  SELECT jsonb_build_object(
           'total_6h',  (SELECT count(*) FROM net._http_response
                          WHERE created > now() - interval '6 hours'),
           'errors_6h', (SELECT count(*) FROM net._http_response
                          WHERE created > now() - interval '6 hours'
                            AND (status_code >= 400 OR COALESCE(timed_out, false) OR error_msg IS NOT NULL)),
           'last_error', (SELECT jsonb_build_object('at', created, 'status', status_code,
                                                    'msg', left(COALESCE(error_msg, content), 160))
                            FROM net._http_response
                           WHERE created > now() - interval '6 hours'
                             AND (status_code >= 400 OR COALESCE(timed_out, false) OR error_msg IS NOT NULL)
                           ORDER BY created DESC
                           LIMIT 1)
         )
    INTO v_http;

  SELECT jsonb_build_object(
           'sent_24h',      count(*) FILTER (WHERE sent_at > now() - interval '24 hours'),
           'last_sent_at',  max(sent_at),
           'sent_prev_30d', count(*) FILTER (WHERE sent_at > now() - interval '30 days'
                                               AND sent_at <= now() - interval '48 hours')
         )
    INTO v_push
    FROM public.notification_log
   WHERE type LIKE 'push\_%';

  RETURN jsonb_build_object('now', now(), 'jobs', v_jobs, 'http', v_http, 'push', v_push);
END;
$$;
REVOKE ALL ON FUNCTION public._system_health_raw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._system_health_raw() TO service_role;

-- 3. Version para el panel (solo mentor/admin) ---------------------------
CREATE OR REPLACE FUNCTION public.admin_system_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(get_my_role(), '') NOT IN ('mentor', 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._system_health_raw() || jsonb_build_object(
    'alerts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', a.kind, 'created_at', a.created_at, 'detail', a.detail)
                       ORDER BY a.created_at DESC)
        FROM (SELECT * FROM public.system_alerts
               WHERE created_at > now() - interval '7 days'
               ORDER BY created_at DESC LIMIT 5) a
    ), '[]'::jsonb),
    'alerts_24h', (SELECT count(*) FROM public.system_alerts WHERE created_at > now() - interval '24 hours')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_system_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_system_health() TO authenticated;

-- 4. Cron del vigilante (cada hora, minuto 25) ---------------------------
SELECT cron.unschedule('maat-health-watch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maat-health-watch');

SELECT cron.schedule(
  'maat-health-watch',
  '25 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/health-watch',
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
-- 1) El cron quedo activo (1 fila):
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'maat-health-watch';
-- 2) La foto se lee sin errores (devuelve un JSON con jobs / http / push):
SELECT public._system_health_raw();
