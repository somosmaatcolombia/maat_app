-- =====================================================
-- MAAT - Mentorias Grupales + Agenda de Sesiones (Sprint A)
-- =====================================================
-- Ejecutar en Supabase Dashboard > SQL Editor (proyecto pcclptmojjzqmfmzftot).
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- Introduce 3 tablas:
--   1. mentor_groups        -> cohortes (mentorias grupales)
--   2. mentor_group_members -> membresia cliente <-> grupo (1 grupo activo por cliente)
--   3. mentor_sessions      -> sesiones AGENDADAS (fecha/hora) grupales o 1:1,
--                              con recordatorios push. NO confundir con session_notes
--                              (esas son el registro POSTERIOR: conclusiones/ejercicios).
-- =====================================================

-- =====================================================
-- 1. TABLAS
-- =====================================================

-- mentor_groups: un cohort de mentoria grupal
CREATE TABLE IF NOT EXISTS mentor_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  start_date  DATE,
  start_week  INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- mentor_group_members: que clientes pertenecen a que grupo
CREATE TABLE IF NOT EXISTS mentor_group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES mentor_groups(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active    BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, client_id)
);

-- Un cliente solo puede estar en UN grupo activo a la vez (evita notas duplicadas).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_group_per_client
  ON mentor_group_members(client_id) WHERE active = true;

-- mentor_sessions: sesiones AGENDADAS con fecha/hora. Grupales o 1:1.
CREATE TABLE IF NOT EXISTS mentor_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modality         TEXT NOT NULL DEFAULT '1on1',          -- 'group' | '1on1'
  group_id         UUID REFERENCES mentor_groups(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT DEFAULT '',
  scheduled_at     TIMESTAMPTZ NOT NULL,                  -- fecha + hora exacta (UTC)
  duration_min     INTEGER DEFAULT 60,
  location         TEXT DEFAULT '',                       -- link de Zoom / lugar
  status           TEXT NOT NULL DEFAULT 'scheduled',     -- 'scheduled' | 'done' | 'cancelled'
  reminder_offsets INTEGER[] NOT NULL DEFAULT '{1440,60}',-- minutos antes (24h y 1h)
  reminders_sent   INTEGER[] NOT NULL DEFAULT '{}',       -- offsets ya disparados
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT mentor_sessions_target CHECK (
    (modality = 'group' AND group_id  IS NOT NULL) OR
    (modality = '1on1'  AND client_id IS NOT NULL)
  )
);

-- Indice para el cron de recordatorios: barre solo lo agendado y proximo.
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_sched
  ON mentor_sessions(scheduled_at) WHERE status = 'scheduled';

-- =====================================================
-- 2. HELPERS (SECURITY DEFINER, sin recursion - Regla 3)
-- =====================================================

-- mentor_owns_group: el usuario actual es el mentor duenno del grupo?
CREATE OR REPLACE FUNCTION mentor_owns_group(g UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM mentor_groups WHERE id = g AND mentor_id = auth.uid()
  );
$$;

-- my_group_ids: ids de los grupos activos a los que pertenece el usuario actual.
CREATE OR REPLACE FUNCTION my_group_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT group_id FROM mentor_group_members
  WHERE client_id = auth.uid() AND active = true;
$$;

-- =====================================================
-- 3. RLS
-- =====================================================
ALTER TABLE mentor_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_sessions      ENABLE ROW LEVEL SECURITY;

-- ---------- mentor_groups ----------
DROP POLICY IF EXISTS mentor_groups_select ON mentor_groups;
CREATE POLICY mentor_groups_select ON mentor_groups
  FOR SELECT USING (
    auth.uid() = mentor_id
    OR get_my_role() = 'admin'
    OR id IN (SELECT my_group_ids())          -- el cliente ve su propio grupo
  );

DROP POLICY IF EXISTS mentor_groups_insert ON mentor_groups;
CREATE POLICY mentor_groups_insert ON mentor_groups
  FOR INSERT WITH CHECK (
    auth.uid() = mentor_id AND get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS mentor_groups_update ON mentor_groups;
CREATE POLICY mentor_groups_update ON mentor_groups
  FOR UPDATE USING (auth.uid() = mentor_id OR get_my_role() = 'admin')
  WITH CHECK (auth.uid() = mentor_id OR get_my_role() = 'admin');

DROP POLICY IF EXISTS mentor_groups_delete ON mentor_groups;
CREATE POLICY mentor_groups_delete ON mentor_groups
  FOR DELETE USING (auth.uid() = mentor_id OR get_my_role() = 'admin');

-- ---------- mentor_group_members ----------
DROP POLICY IF EXISTS mgm_select ON mentor_group_members;
CREATE POLICY mgm_select ON mentor_group_members
  FOR SELECT USING (
    auth.uid() = client_id
    OR mentor_owns_group(group_id)
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS mgm_insert ON mentor_group_members;
CREATE POLICY mgm_insert ON mentor_group_members
  FOR INSERT WITH CHECK (
    mentor_owns_group(group_id) OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS mgm_update ON mentor_group_members;
CREATE POLICY mgm_update ON mentor_group_members
  FOR UPDATE USING (mentor_owns_group(group_id) OR get_my_role() = 'admin')
  WITH CHECK (mentor_owns_group(group_id) OR get_my_role() = 'admin');

DROP POLICY IF EXISTS mgm_delete ON mentor_group_members;
CREATE POLICY mgm_delete ON mentor_group_members
  FOR DELETE USING (mentor_owns_group(group_id) OR get_my_role() = 'admin');

-- ---------- mentor_sessions ----------
DROP POLICY IF EXISTS mentor_sessions_select ON mentor_sessions;
CREATE POLICY mentor_sessions_select ON mentor_sessions
  FOR SELECT USING (
    auth.uid() = mentor_id
    OR auth.uid() = client_id
    OR (group_id IS NOT NULL AND group_id IN (SELECT my_group_ids()))
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS mentor_sessions_insert ON mentor_sessions;
CREATE POLICY mentor_sessions_insert ON mentor_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = mentor_id AND get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS mentor_sessions_update ON mentor_sessions;
CREATE POLICY mentor_sessions_update ON mentor_sessions
  FOR UPDATE USING (auth.uid() = mentor_id OR get_my_role() = 'admin')
  WITH CHECK (auth.uid() = mentor_id OR get_my_role() = 'admin');

DROP POLICY IF EXISTS mentor_sessions_delete ON mentor_sessions;
CREATE POLICY mentor_sessions_delete ON mentor_sessions
  FOR DELETE USING (auth.uid() = mentor_id OR get_my_role() = 'admin');

-- =====================================================
-- 4. VERIFICACION RAPIDA (opcional, comentar si molesta)
-- =====================================================
-- SELECT 'mentor_groups' t, count(*) FROM mentor_groups
-- UNION ALL SELECT 'mentor_group_members', count(*) FROM mentor_group_members
-- UNION ALL SELECT 'mentor_sessions', count(*) FROM mentor_sessions;
