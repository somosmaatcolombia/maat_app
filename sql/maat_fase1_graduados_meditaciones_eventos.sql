-- =====================================================
-- MAAT FASE 1 — Graduados + Meditaciones + Eventos
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Es idempotente (IF NOT EXISTS / IF EXISTS)
-- =====================================================

-- ─────────────────────────────────────────────────
-- 1. FLAG GRADUADO en profiles (tabla existente)
-- ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS graduated    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cycle        INTEGER DEFAULT 1;

-- ─────────────────────────────────────────────────
-- 2. CATÁLOGO DE MEDITACIONES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meditations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_es       TEXT        NOT NULL,
  title_en       TEXT,
  description_es TEXT,
  description_en TEXT,
  audio_url      TEXT        NOT NULL,
  cover_url      TEXT,
  duration_sec   INTEGER,
  category       TEXT        DEFAULT 'general',
    -- respiracion | visualizacion | sueno | energia | gratitud | enfoque | cuerpo | general
  phase          INTEGER,    -- 1-4 o NULL = aplica a todas las fases
  level          TEXT        DEFAULT 'todos',
    -- principiante | intermedio | avanzado | todos
  is_active      BOOLEAN     DEFAULT true,
  sort_order     INTEGER     DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────
-- 3. HISTORIAL DE ESCUCHAS (métricas de uso)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meditation_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  meditation_id  UUID        REFERENCES meditations(id) ON DELETE CASCADE NOT NULL,
  listened_at    TIMESTAMPTZ DEFAULT now(),
  completed      BOOLEAN     DEFAULT false,  -- true si escuchó > 80%
  duration_sec   INTEGER                     -- segundos escuchados realmente
);

-- ─────────────────────────────────────────────────
-- 4. EVENTOS Y EXPERIENCIAS
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_es         TEXT        NOT NULL,
  title_en         TEXT,
  description_es   TEXT,
  description_en   TEXT,
  event_type       TEXT        DEFAULT 'webinar',
    -- webinar | retiro | taller | encuentro | sesion-grupal | ceremonia
  event_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ,
  location_name    TEXT,                       -- "Online" | "Bogotá" | etc.
  location_url     TEXT,                       -- link Zoom, Google Maps, etc.
  cover_url        TEXT,
  price            NUMERIC     DEFAULT 0,
  is_free          BOOLEAN     DEFAULT false,
  registration_url TEXT,                       -- link externo de registro
  max_participants INTEGER,
  visible_to       TEXT        DEFAULT 'graduates',
    -- graduates | all
  is_active        BOOLEAN     DEFAULT true,
  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────
-- 5. REGISTRO A EVENTOS (interés / RSVP)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_registrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status        TEXT        DEFAULT 'registered',  -- registered | waitlist | cancelled
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- ─────────────────────────────────────────────────
-- RLS — Activar en todas las tablas nuevas
-- ─────────────────────────────────────────────────
ALTER TABLE meditations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────
-- POLICIES — meditations
-- ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "meditations_select"  ON meditations;
DROP POLICY IF EXISTS "meditations_insert"  ON meditations;
DROP POLICY IF EXISTS "meditations_update"  ON meditations;
DROP POLICY IF EXISTS "meditations_delete"  ON meditations;

-- Cualquier usuario autenticado puede leer las meditaciones activas
CREATE POLICY "meditations_select" ON meditations
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Solo mentores y admins pueden crear / editar / eliminar
CREATE POLICY "meditations_insert" ON meditations
  FOR INSERT TO authenticated
  WITH CHECK (is_mentor_or_admin(auth.uid()));

CREATE POLICY "meditations_update" ON meditations
  FOR UPDATE TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

CREATE POLICY "meditations_delete" ON meditations
  FOR DELETE TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

-- ─────────────────────────────────────────────────
-- POLICIES — meditation_logs
-- ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "meditation_logs_select" ON meditation_logs;
DROP POLICY IF EXISTS "meditation_logs_insert" ON meditation_logs;

CREATE POLICY "meditation_logs_select" ON meditation_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "meditation_logs_insert" ON meditation_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- POLICIES — events
-- ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_select" ON events;
DROP POLICY IF EXISTS "events_insert" ON events;
DROP POLICY IF EXISTS "events_update" ON events;
DROP POLICY IF EXISTS "events_delete" ON events;

-- Cualquier usuario autenticado ve eventos activos
-- (el frontend filtra visible_to=graduates si el usuario no es graduado)
CREATE POLICY "events_select" ON events
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "events_insert" ON events
  FOR INSERT TO authenticated
  WITH CHECK (is_mentor_or_admin(auth.uid()));

CREATE POLICY "events_update" ON events
  FOR UPDATE TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

CREATE POLICY "events_delete" ON events
  FOR DELETE TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

-- ─────────────────────────────────────────────────
-- POLICIES — event_registrations
-- ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "event_reg_own_select"   ON event_registrations;
DROP POLICY IF EXISTS "event_reg_own_insert"   ON event_registrations;
DROP POLICY IF EXISTS "event_reg_own_delete"   ON event_registrations;
DROP POLICY IF EXISTS "event_reg_mentor_select" ON event_registrations;

-- Usuarios ven y gestionan sus propios registros
CREATE POLICY "event_reg_own_select" ON event_registrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "event_reg_own_insert" ON event_registrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "event_reg_own_delete" ON event_registrations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Mentores/admins pueden ver todos los registros (para gestión de eventos)
CREATE POLICY "event_reg_mentor_select" ON event_registrations
  FOR SELECT TO authenticated
  USING (is_mentor_or_admin(auth.uid()));

-- ─────────────────────────────────────────────────
-- STORAGE — bucket para audios de meditaciones
-- Ejecutar en Dashboard > Storage o descomenta:
-- ─────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('maat-meditations', 'maat-meditations', true)
-- ON CONFLICT (id) DO NOTHING;

-- Policy storage (pegar en Dashboard > Storage > Policies):
-- nombre: "Public read maat-meditations"
-- SELECT: bucket_id = 'maat-meditations'
-- nombre: "Mentor upload maat-meditations"
-- INSERT/UPDATE/DELETE: bucket_id = 'maat-meditations' AND is_mentor_or_admin(auth.uid())

-- ─────────────────────────────────────────────────
-- VERIFICACIÓN — ejecuta esto para confirmar
-- ─────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'profiles'
-- AND column_name IN ('graduated','graduated_at','cycle');

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('meditations','meditation_logs','events','event_registrations');
