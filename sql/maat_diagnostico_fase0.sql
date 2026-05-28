-- =====================================================
-- MAAT - DIAGNOSTICO FASE 0 (sobre datos existentes)
-- Ejecutar consulta por consulta en Supabase > SQL Editor
-- No modifica nada. Solo lee.
-- =====================================================
-- NOTA: con pocos usuarios, los porcentajes son referenciales.
-- El valor real esta en ver el ESTADO de cada persona y los
-- patrones de abandono. Complementar SIEMPRE con entrevistas.
-- =====================================================


-- =====================================================
-- QUERY 1 - SNAPSHOT POR USUARIO (la mas importante)
-- Tabla de salud de cada cliente: estado real hoy.
-- =====================================================
SELECT
  p.full_name,
  p.current_week                                         AS semana,
  CASE WHEN p.graduated THEN 'Graduado'
       WHEN p.active IS FALSE THEN 'Desactivado'
       ELSE 'Activo' END                                 AS estado,
  -- Antiguedad
  date_part('day', now() - p.created_at)::int            AS dias_desde_alta,
  -- Calibracion (el habito central)
  COUNT(DISTINCT c.date)                                 AS dias_calibrados,
  date_part('day', now() - MAX(c.created_at))::int       AS dias_sin_calibrar,
  -- Tasa de calibracion (dias calibrados / dias de antiguedad)
  ROUND(
    COUNT(DISTINCT c.date)::numeric
    / GREATEST(date_part('day', now() - p.created_at), 1)::numeric * 100
  , 0)                                                   AS pct_constancia,
  -- Actitud promedio (coherencia 1-10)
  ROUND(AVG(c.coherence)::numeric, 1)                    AS actitud_prom,
  -- Profundidad: usa otras features?
  (SELECT COUNT(*) FROM habit_tracker h WHERE h.user_id = p.id) AS semanas_habitos,
  (SELECT COUNT(*) FROM beliefs b WHERE b.user_id = p.id)       AS creencias,
  EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.user_id = p.id) AS uso_coach
FROM profiles p
LEFT JOIN calibrations c ON c.user_id = p.id
WHERE p.role = 'client'
GROUP BY p.id
ORDER BY dias_sin_calibrar NULLS FIRST;


-- =====================================================
-- QUERY 2 - EMBUDO DE ACTIVACION
-- Cuantos llegan a cada nivel de compromiso.
-- =====================================================
SELECT
  COUNT(*)                                                          AS total_clientes,
  COUNT(*) FILTER (WHERE cal.n >= 1)                                AS calibraron_1vez,
  COUNT(*) FILTER (WHERE cal.n >= 3)                                AS calibraron_3mas,
  COUNT(*) FILTER (WHERE cal.n >= 7)                                AS calibraron_7mas,
  COUNT(*) FILTER (WHERE cal.ult >= now() - interval '7 days')      AS activos_7dias,
  COUNT(*) FILTER (WHERE p.graduated)                               AS graduados
FROM profiles p
LEFT JOIN (
  SELECT user_id, COUNT(DISTINCT date) AS n, MAX(created_at) AS ult
  FROM calibrations GROUP BY user_id
) cal ON cal.user_id = p.id
WHERE p.role = 'client';


-- =====================================================
-- QUERY 3 - ABANDONO POR SEMANA
-- En que semana del proceso se quedan / abandonan.
-- =====================================================
SELECT
  p.current_week                                       AS semana,
  COUNT(*)                                             AS clientes,
  COUNT(*) FILTER (
    WHERE cal.ult >= now() - interval '7 days'
  )                                                    AS activos_ult_semana,
  COUNT(*) FILTER (
    WHERE cal.ult < now() - interval '14 days'
       OR cal.ult IS NULL
  )                                                    AS inactivos_14d
FROM profiles p
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS ult
  FROM calibrations GROUP BY user_id
) cal ON cal.user_id = p.id
WHERE p.role = 'client' AND COALESCE(p.graduated,false) = false
GROUP BY p.current_week
ORDER BY p.current_week;


-- =====================================================
-- QUERY 4 - PROFUNDIDAD DE USO (que features usan)
-- =====================================================
SELECT
  'Calibracion'  AS feature, COUNT(DISTINCT user_id) AS usuarios FROM calibrations
UNION ALL
SELECT 'Habitos',     COUNT(DISTINCT user_id) FROM habit_tracker
UNION ALL
SELECT 'Creencias',   COUNT(DISTINCT user_id) FROM beliefs
UNION ALL
SELECT 'Coach IA',    COUNT(DISTINCT user_id) FROM chat_messages
UNION ALL
SELECT 'Reflexiones', COUNT(DISTINCT user_id) FROM phase_reflections
ORDER BY usuarios DESC;


-- =====================================================
-- QUERY 5 - RITMO DE CALIBRACION (ultimos 30 dias)
-- Cuantas calibraciones por dia hay en total.
-- Sirve para ver si la app esta "viva" o apagandose.
-- =====================================================
SELECT
  date_trunc('day', created_at)::date  AS dia,
  COUNT(*)                             AS calibraciones,
  COUNT(DISTINCT user_id)              AS usuarios_activos
FROM calibrations
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;
