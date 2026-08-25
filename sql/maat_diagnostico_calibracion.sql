-- =====================================================
-- MAAT - Diagnostico de la calibracion diaria
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- SOLO LECTURA: no modifica nada.
-- =====================================================
-- Responde: quien calibra, cada cuanto, en que semana se caen, y si el
-- modo express sirvio. Correr las 6 consultas y leer los resultados juntos.
-- =====================================================

-- 1. ACTIVACION: de los clientes activos, cuantos calibraron alguna vez
SELECT
  COUNT(*)                                                   AS clientes_activos,
  COUNT(*) FILTER (WHERE c.n > 0)                            AS calibraron_alguna_vez,
  ROUND(100.0 * COUNT(*) FILTER (WHERE c.n > 0) / NULLIF(COUNT(*),0)) AS pct_activacion
FROM profiles p
LEFT JOIN (SELECT user_id, COUNT(*) n FROM calibrations GROUP BY user_id) c
       ON c.user_id = p.id
WHERE p.role = 'client' AND p.active IS NOT FALSE;

-- 2. EL NUMERO CLAVE: calibraciones por persona en los ultimos 14 dias
--    (7+ = habito real | 3-6 = intermitente | 1-2 = casi perdido | 0 = ausente)
SELECT
  CASE
    WHEN d.dias >= 7 THEN 'a) habito (7-14 dias)'
    WHEN d.dias >= 3 THEN 'b) intermitente (3-6)'
    WHEN d.dias >= 1 THEN 'c) casi perdido (1-2)'
    ELSE                   'd) ausente (0)'
  END AS segmento,
  COUNT(*) AS personas
FROM profiles p
LEFT JOIN (
  SELECT user_id, COUNT(DISTINCT date) dias
  FROM calibrations
  WHERE created_at >= now() - interval '14 days'
  GROUP BY user_id
) d ON d.user_id = p.id
WHERE p.role = 'client' AND p.active IS NOT FALSE
GROUP BY 1 ORDER BY 1;

-- 3. ABANDONO POR SEMANA DEL PROCESO: en que semana dejan de calibrar
SELECT
  p.current_week AS semana,
  COUNT(*)       AS clientes,
  COUNT(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM calibrations c
                  WHERE c.user_id = p.id AND c.created_at >= now() - interval '7 days')
  ) AS calibraron_ult_7d
FROM profiles p
WHERE p.role = 'client' AND p.active IS NOT FALSE
GROUP BY p.current_week ORDER BY p.current_week;

-- 4. EXPRESS vs PROFUNDA: sirvio el modo rapido?
SELECT
  CASE WHEN session_note = 'express' THEN 'express (30s)' ELSE 'profunda (3 preguntas)' END AS modo,
  COUNT(*) AS calibraciones,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (),0)) AS pct
FROM calibrations
WHERE created_at >= now() - interval '30 days'
GROUP BY 1;

-- 5. TENDENCIA: calibraciones por semana (ultimas 8) - sube o baja?
SELECT
  date_trunc('week', created_at)::date AS semana,
  COUNT(*)                             AS calibraciones,
  COUNT(DISTINCT user_id)              AS personas_distintas
FROM calibrations
WHERE created_at >= now() - interval '8 weeks'
GROUP BY 1 ORDER BY 1;

-- 6. LA PREGUNTA INCOMODA: se abandona a mitad del flujo?
--    Compara cuantos ABREN la calibracion vs cuantos la COMPLETAN.
--    (requiere usage_events con calib_start / calib_done)
SELECT
  COUNT(*) FILTER (WHERE event = 'calib_start') AS abrieron,
  COUNT(*) FILTER (WHERE event = 'calib_done')  AS completaron,
  ROUND(100.0 * COUNT(*) FILTER (WHERE event = 'calib_done')
        / NULLIF(COUNT(*) FILTER (WHERE event = 'calib_start'),0)) AS pct_completan
FROM usage_events
WHERE created_at >= now() - interval '30 days';
