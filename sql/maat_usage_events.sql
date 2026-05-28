-- =====================================================
-- MAAT - Tabla usage_events (instrumentacion Fase 0)
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Captura eventos de uso para medir el embudo real.
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,   -- ver catalogo abajo
  meta       JSONB,           -- datos extra opcionales (ej: {"view":"v-coach"})
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para consultas de embudo/retencion
CREATE INDEX IF NOT EXISTS idx_usage_events_user    ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_event   ON usage_events(event);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at);

-- ---------------------------------------------------
-- CATALOGO DE EVENTOS (referencia para el frontend)
-- ---------------------------------------------------
--   app_open          -> abre la app (sesion)
--   view_enter        -> entra a una vista     meta:{view:"v-coach"}
--   calib_start       -> abre la calibracion
--   calib_done        -> completa calibracion  meta:{coherence:7}
--   habit_check       -> marca un dia de habito
--   coach_msg         -> envia mensaje al coach
--   meditation_play   -> reproduce meditacion  meta:{id:"..."}
--   book_open         -> abre el libro/pdf
--   event_rsvp        -> se registra a evento
-- ---------------------------------------------------

-- ---------------------------------------------------
-- RLS: cada usuario solo escribe/lee SUS eventos.
-- Mentores/admins pueden leer todo (para analitica).
-- ---------------------------------------------------
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_insert       ON usage_events;
DROP POLICY IF EXISTS usage_events_own_select   ON usage_events;
DROP POLICY IF EXISTS usage_events_admin_select ON usage_events;

-- Cualquier usuario autenticado inserta sus propios eventos
CREATE POLICY usage_events_insert ON usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- El usuario ve sus propios eventos
CREATE POLICY usage_events_own_select ON usage_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Mentores/admins ven todo (para el diagnostico)
CREATE POLICY usage_events_admin_select ON usage_events
  FOR SELECT TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

-- ---------------------------------------------------
-- VERIFICACION
-- ---------------------------------------------------
SELECT 'usage_events creada' AS resultado,
       (SELECT COUNT(*) FROM pg_policies
        WHERE tablename='usage_events') AS policies;
