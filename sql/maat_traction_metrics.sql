-- =====================================================
-- MAAT - Metricas de Traccion (para dashboard inversion)
-- Ejecutar en Supabase Dashboard > SQL Editor
-- =====================================================
-- Funciones SECURITY DEFINER que devuelven SOLO agregados.
-- Gated: solo mentores/admins reciben datos (else NULL).
-- =====================================================

-- 1) KPIs escalares de traccion
CREATE OR REPLACE FUNCTION get_traction_metrics()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN is_mentor_or_admin(auth.uid()) THEN (
    WITH clients AS (
      SELECT id, created_at, current_week, graduated
      FROM profiles WHERE role='client'
    ),
    cal_agg AS (
      SELECT user_id, MIN(created_at) AS first_cal
      FROM calibrations GROUP BY user_id
    ),
    consist AS (
      SELECT user_id, COUNT(DISTINCT date) AS d7
      FROM calibrations
      WHERE created_at >= now() - interval '7 days'
      GROUP BY user_id
    )
    SELECT json_build_object(
      'total_clients',    (SELECT COUNT(*) FROM clients),
      'graduated',        (SELECT COUNT(*) FROM clients WHERE graduated),
      'active_today',     (SELECT COUNT(DISTINCT user_id) FROM calibrations WHERE created_at >= date_trunc('day',now())),
      'active_7d',        (SELECT COUNT(DISTINCT user_id) FROM calibrations WHERE created_at >= now()-interval '7 days'),
      'active_30d',       (SELECT COUNT(DISTINCT user_id) FROM calibrations WHERE created_at >= now()-interval '30 days'),
      'new_7d',           (SELECT COUNT(*) FROM clients WHERE created_at >= now()-interval '7 days'),
      'new_30d',          (SELECT COUNT(*) FROM clients WHERE created_at >= now()-interval '30 days'),
      'cal_total',        (SELECT COUNT(*) FROM calibrations),
      'cal_7d',           (SELECT COUNT(*) FROM calibrations WHERE created_at >= now()-interval '7 days'),
      -- North Star: usuarios con >=4 dias calibrados en los ultimos 7
      'consistent_users', (SELECT COUNT(*) FROM consist WHERE d7>=4),
      -- Activacion
      'activated',        (SELECT COUNT(*) FROM cal_agg),
      'never_activated',  (SELECT COUNT(*) FROM clients c WHERE NOT EXISTS (SELECT 1 FROM cal_agg ca WHERE ca.user_id=c.id)),
      -- Activacion temprana: calibraron dentro de 7 dias del registro
      'activated_7d',     (SELECT COUNT(*) FROM clients c JOIN cal_agg ca ON ca.user_id=c.id WHERE ca.first_cal <= c.created_at + interval '7 days'),
      -- Profundidad de uso
      'coach_users',      (SELECT COUNT(DISTINCT user_id) FROM chat_messages),
      'belief_users',     (SELECT COUNT(DISTINCT user_id) FROM beliefs)
    )
  ) ELSE NULL END;
$$;

GRANT EXECUTE ON FUNCTION get_traction_metrics() TO authenticated;

-- 2) Serie temporal: usuarios activos por dia (para el grafico de tendencia)
CREATE OR REPLACE FUNCTION get_daily_activity(days integer DEFAULT 30)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN is_mentor_or_admin(auth.uid()) THEN (
    SELECT COALESCE(json_agg(t ORDER BY t.day), '[]'::json)
    FROM (
      SELECT date_trunc('day',created_at)::date AS day,
             COUNT(DISTINCT user_id) AS users
      FROM calibrations
      WHERE created_at >= now() - (days || ' days')::interval
      GROUP BY 1
    ) t
  ) ELSE NULL END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_activity(integer) TO authenticated;

-- Verificacion
SELECT get_traction_metrics();
SELECT get_daily_activity(30);
