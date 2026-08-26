-- =====================================================
-- MAAT - Medicion de calidad del Coach IA
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente. ASCII puro (ver nota de encoding en CLAUDE.md).
-- =====================================================
-- Sin esto no sabes si el Coach es bueno: solo intuiciones. Cada pulgar
-- guarda el par (lo que pregunto el cliente -> lo que respondio el coach)
-- junto con la fase en la que iba. Con eso puedes:
--   1. Ver si una fase rinde peor que otra.
--   2. Leer las respuestas malas: ahi esta que arreglar en el prompt.
--   3. Mas adelante, usar las buenas como ejemplos de fine-tuning.
-- =====================================================

CREATE TABLE IF NOT EXISTS coach_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating        TEXT NOT NULL CHECK (rating IN ('up','down')),
  user_message  TEXT,          -- lo que pregunto el cliente
  coach_reply   TEXT,          -- lo que respondio el coach
  week          INTEGER,       -- semana del proceso al momento
  phase         INTEGER,       -- 1-4, derivada de la semana
  comment       TEXT,          -- opcional: por que estuvo mal
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_fb_user   ON coach_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_fb_rating ON coach_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_coach_fb_phase  ON coach_feedback(phase);

ALTER TABLE coach_feedback ENABLE ROW LEVEL SECURITY;

-- El cliente califica lo suyo; mentor/admin leen todo para mejorar el coach.
DROP POLICY IF EXISTS coach_fb_insert ON coach_feedback;
CREATE POLICY coach_fb_insert ON coach_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS coach_fb_select ON coach_feedback;
CREATE POLICY coach_fb_select ON coach_feedback
  FOR SELECT USING (auth.uid() = user_id OR get_my_role() IN ('mentor','admin'));

-- -----------------------------------------------------
-- Resumen para el portal (solo mentor/admin).
-- SECURITY DEFINER para poder agregar sobre toda la tabla, con guarda de rol.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_quality()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF get_my_role() NOT IN ('mentor','admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    'total',      (SELECT COUNT(*) FROM coach_feedback),
    'positivos',  (SELECT COUNT(*) FROM coach_feedback WHERE rating='up'),
    'negativos',  (SELECT COUNT(*) FROM coach_feedback WHERE rating='down'),
    'pct_positivo', (
      SELECT CASE WHEN COUNT(*)=0 THEN NULL
        ELSE ROUND(100.0*COUNT(*) FILTER (WHERE rating='up')/COUNT(*)) END
      FROM coach_feedback
    ),
    'por_fase', (
      SELECT COALESCE(json_agg(f ORDER BY f_phase), '[]'::json) FROM (
        SELECT phase AS f_phase,
          json_build_object(
            'fase', phase,
            'total', COUNT(*),
            'positivos', COUNT(*) FILTER (WHERE rating='up'),
            'pct_positivo', ROUND(100.0*COUNT(*) FILTER (WHERE rating='up')/COUNT(*))
          ) AS f
        FROM coach_feedback WHERE phase IS NOT NULL GROUP BY phase
      ) s
    ),
    'ultimos_negativos', (
      SELECT COALESCE(json_agg(n), '[]'::json) FROM (
        SELECT json_build_object(
          'fecha', created_at, 'fase', phase, 'semana', week,
          'pregunta', user_message, 'respuesta', coach_reply, 'comentario', comment
        ) AS n
        FROM coach_feedback WHERE rating='down'
        ORDER BY created_at DESC LIMIT 20
      ) s2
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_coach_quality() TO authenticated;

-- Verificacion
SELECT get_coach_quality();
