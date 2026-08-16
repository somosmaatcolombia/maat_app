-- =====================================================
-- MAAT - Trazabilidad de Satisfaccion y Feedback
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Proyecto MAAT: pcclptmojjzqmfmzftot  (NO el CRM)
-- =====================================================
-- Mide la transformacion del cliente en 3 momentos del
-- proceso de 16 semanas: inicio, intermedio y final.
-- Dimensiones nucleo (se repiten en los 3 momentos, 1-10):
--   actitud, claridad, confianza, energia y 4 sub-ejes
--   de entorno (profesional, relaciones, familiar, intrapersonal).
-- Experiencia (intermedio + final): satisfaccion.
-- Cierre (solo final): nps + testimonio + referidos.
-- Idempotente: se puede re-ejecutar sin romper nada.
-- =====================================================

-- -----------------------------------------------------
-- 1) TABLA client_feedback
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS client_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  moment            TEXT NOT NULL CHECK (moment IN ('inicio','intermedio','final')),
  week              INTEGER,                              -- semana en la que respondio (1-16)
  -- Nucleo repetible (1-10)
  actitud           INTEGER CHECK (actitud           BETWEEN 1 AND 10),
  claridad          INTEGER CHECK (claridad          BETWEEN 1 AND 10),
  confianza         INTEGER CHECK (confianza         BETWEEN 1 AND 10),
  energia           INTEGER CHECK (energia           BETWEEN 1 AND 10),
  ent_profesional   INTEGER CHECK (ent_profesional   BETWEEN 1 AND 10),
  ent_relaciones    INTEGER CHECK (ent_relaciones    BETWEEN 1 AND 10),
  ent_familiar      INTEGER CHECK (ent_familiar      BETWEEN 1 AND 10),
  ent_intrapersonal INTEGER CHECK (ent_intrapersonal BETWEEN 1 AND 10),
  -- Experiencia (intermedio + final)
  satisfaccion      INTEGER CHECK (satisfaccion BETWEEN 1 AND 10),
  mejora_text       TEXT,                                 -- "que faltaria para un 10"
  -- Cierre (solo final)
  nps               INTEGER CHECK (nps BETWEEN 0 AND 10),
  testimonial_ok    BOOLEAN NOT NULL DEFAULT FALSE,
  testimonial_text  TEXT,
  -- Cualitativo en los 3 momentos
  open_text         TEXT,                                 -- "una frase de como te sientes hoy"
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, moment)
);

CREATE INDEX IF NOT EXISTS idx_client_feedback_user   ON client_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_client_feedback_moment ON client_feedback (moment);

-- -----------------------------------------------------
-- 2) TABLA client_referrals (2 leads referidos por cliente)
--    Se guardan en MAAT; el puente al CRM (proyecto
--    separado vbfesmgxegxsurnfazjs) se hace despues via
--    export/Edge Function usando el flag synced_to_crm.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS client_referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  contact       TEXT NOT NULL,                            -- email o whatsapp
  reason        TEXT,                                     -- por que crees que lo necesita
  synced_to_crm BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_referrals_by   ON client_referrals (referred_by);
CREATE INDEX IF NOT EXISTS idx_client_referrals_sync ON client_referrals (synced_to_crm);

-- -----------------------------------------------------
-- 3) RLS (Regla 3: nunca consultar la misma tabla; usar get_my_role())
-- -----------------------------------------------------
ALTER TABLE client_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_referrals ENABLE ROW LEVEL SECURITY;

-- client_feedback: el cliente ve/gestiona lo suyo; mentor/admin ven todo
DROP POLICY IF EXISTS client_feedback_select ON client_feedback;
CREATE POLICY client_feedback_select ON client_feedback
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS client_feedback_insert ON client_feedback;
CREATE POLICY client_feedback_insert ON client_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS client_feedback_update ON client_feedback;
CREATE POLICY client_feedback_update ON client_feedback
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- client_referrals: el cliente inserta/ve lo suyo; mentor/admin ven todo
DROP POLICY IF EXISTS client_referrals_select ON client_referrals;
CREATE POLICY client_referrals_select ON client_referrals
  FOR SELECT USING (
    auth.uid() = referred_by
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS client_referrals_insert ON client_referrals;
CREATE POLICY client_referrals_insert ON client_referrals
  FOR INSERT WITH CHECK (auth.uid() = referred_by);

-- Solo mentor/admin pueden marcar un referido como sincronizado al CRM
DROP POLICY IF EXISTS client_referrals_update ON client_referrals;
CREATE POLICY client_referrals_update ON client_referrals
  FOR UPDATE USING (get_my_role() IN ('mentor', 'admin'))
  WITH CHECK (get_my_role() IN ('mentor', 'admin'));

-- -----------------------------------------------------
-- 4) Mantener updated_at en client_feedback (upsert-friendly)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION touch_client_feedback()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client_feedback ON client_feedback;
CREATE TRIGGER trg_touch_client_feedback
  BEFORE UPDATE ON client_feedback
  FOR EACH ROW EXECUTE FUNCTION touch_client_feedback();

-- -----------------------------------------------------
-- 5) Resumen agregado para el dashboard (solo mentor/admin)
--    Promedios por dimension y momento + NPS + conteos.
--    SECURITY DEFINER para agregar sobre toda la tabla,
--    con guarda de rol explicita dentro de la funcion.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_feedback_overview()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF get_my_role() NOT IN ('mentor', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    'by_moment', (
      SELECT COALESCE(json_object_agg(moment, m), '{}'::json)
      FROM (
        SELECT moment,
          json_build_object(
            'n',                 COUNT(*),
            'actitud',           ROUND(AVG(actitud)::numeric, 2),
            'claridad',          ROUND(AVG(claridad)::numeric, 2),
            'confianza',         ROUND(AVG(confianza)::numeric, 2),
            'energia',           ROUND(AVG(energia)::numeric, 2),
            'ent_profesional',   ROUND(AVG(ent_profesional)::numeric, 2),
            'ent_relaciones',    ROUND(AVG(ent_relaciones)::numeric, 2),
            'ent_familiar',      ROUND(AVG(ent_familiar)::numeric, 2),
            'ent_intrapersonal', ROUND(AVG(ent_intrapersonal)::numeric, 2),
            'satisfaccion',      ROUND(AVG(satisfaccion)::numeric, 2)
          ) AS m
        FROM client_feedback
        GROUP BY moment
      ) s
    ),
    'nps', (
      SELECT json_build_object(
        'n',          COUNT(nps),
        'promoters',  COUNT(*) FILTER (WHERE nps >= 9),
        'passives',   COUNT(*) FILTER (WHERE nps BETWEEN 7 AND 8),
        'detractors', COUNT(*) FILTER (WHERE nps <= 6 AND nps IS NOT NULL),
        'score',      CASE WHEN COUNT(nps) = 0 THEN NULL ELSE
                        ROUND(
                          (COUNT(*) FILTER (WHERE nps >= 9)::numeric
                           - COUNT(*) FILTER (WHERE nps <= 6 AND nps IS NOT NULL)::numeric)
                          / COUNT(nps)::numeric * 100
                        )
                      END
      )
      FROM client_feedback
    ),
    'clients_total', (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND active IS NOT FALSE),
    'referrals_total', (SELECT COUNT(*) FROM client_referrals),
    'referrals_pending_sync', (SELECT COUNT(*) FROM client_referrals WHERE synced_to_crm = FALSE)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_feedback_overview() TO authenticated;

-- -----------------------------------------------------
-- 6) Verificacion
-- -----------------------------------------------------
-- SELECT get_feedback_overview();
-- SELECT * FROM client_feedback ORDER BY submitted_at DESC LIMIT 5;
-- SELECT * FROM client_referrals ORDER BY created_at DESC LIMIT 5;
