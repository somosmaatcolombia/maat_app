-- =====================================================
-- MAAT — SQL Maestro Completo
-- Esquema idempotente (seguro re-ejecutar)
-- Proyecto: pcclptmojjzqmfmzftot
-- Fecha: 2026-03-16
--
-- NOTA: Esta BD es compartida con un proyecto CRM.
-- Este archivo SOLO gestiona tablas MAAT.
-- NO tocar: prospects, activities, pipeline_stages,
--   email_templates, sent_emails, ad_accounts, campaigns,
--   ad_sets, ads, daily_metrics, metric_breakdowns,
--   ai_recommendations, alerts
-- =====================================================

-- =====================================================
-- 0. EXTENSIONES
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. TABLAS (12 tablas MAAT)
-- =====================================================

-- profiles: tabla central de usuarios (compartida con CRM)
-- PK = auth.users.id, FK automatica
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT DEFAULT 'client',
  active        BOOLEAN NOT NULL DEFAULT true,
  current_week  INTEGER DEFAULT 1,
  notification_hour INTEGER DEFAULT 9,
  preferred_lang TEXT DEFAULT 'es',
  whatsapp_number TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- calibrations: calibraciones diarias del cliente
CREATE TABLE IF NOT EXISTS calibrations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          TEXT,
  week          INTEGER,
  coherence     INTEGER,
  answer_q1     TEXT,
  answer_q2     TEXT,
  answer_q3     TEXT,
  session_note  TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- beliefs: creencias del cliente (5 categorias)
CREATE TABLE IF NOT EXISTS beliefs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  category      TEXT,
  date          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- week_progress: semanas completadas
CREATE TABLE IF NOT EXISTS week_progress (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week          INTEGER NOT NULL,
  completed     BOOLEAN DEFAULT false,
  UNIQUE(user_id, week)
);

-- habit_tracker: habitos semanales con JSONB
CREATE TABLE IF NOT EXISTS habit_tracker (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week          INTEGER NOT NULL,
  habits        JSONB DEFAULT '[]'::jsonb,
  intention     TEXT,
  learned       TEXT,
  felt          TEXT,
  belief        TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week)
);

-- statement_hipnosis: statement de vida + audio autohipnosis
CREATE TABLE IF NOT EXISTS statement_hipnosis (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  statement     TEXT,
  audio_url     TEXT,
  audio_name    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- phase_reflections: reflexiones por fase (1-4)
CREATE TABLE IF NOT EXISTS phase_reflections (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_id      INTEGER NOT NULL,
  reflection    TEXT DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, phase_id)
);

-- ai_config: configuracion del Coach IA (singleton, id=1)
CREATE TABLE IF NOT EXISTS ai_config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  system_prompt TEXT NOT NULL,
  api_key       TEXT NOT NULL DEFAULT 'sk-placeholder',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- mentor_clients: relacion mentor-cliente
CREATE TABLE IF NOT EXISTS mentor_clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active        BOOLEAN DEFAULT true,
  assigned_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mentor_id, client_id)
);

-- session_notes: notas de sesion del mentor
CREATE TABLE IF NOT EXISTS session_notes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type        TEXT,
  session_date        DATE DEFAULT CURRENT_DATE,
  notes               TEXT DEFAULT '',
  next_plan           TEXT DEFAULT '',
  client_week         INTEGER,
  client_coherence_avg NUMERIC,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- push_subscriptions: suscripciones Web Push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  device_name   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- chat_messages: historial del Coach IA (uno por usuario)
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  messages      JSONB DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- notification_log: registro de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  sent_at       TIMESTAMP DEFAULT now(),
  days_absent   INTEGER
);

-- =====================================================
-- 2. FUNCIONES
-- =====================================================

-- get_my_role: funcion SECURITY DEFINER para RLS sin recursion
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT COALESCE(role, 'client') FROM profiles WHERE id = auth.uid();
$$;

-- handle_new_user: trigger en auth.users para auto-crear profile
-- Default 'client' para MAAT; CRM debe enviar role:'advisor' en metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Helper functions (usadas por codigo pero no por RLS)
CREATE OR REPLACE FUNCTION is_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_mentor_or_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('mentor', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION mentor_has_client(mentor_uid UUID, client_uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM mentor_clients
    WHERE mentor_id = mentor_uid
      AND client_id = client_uid
      AND active = true
  );
$$;

-- update_updated_at: trigger generico para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- 3. TRIGGERS
-- =====================================================

-- Auto-crear profile al registrar usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- 4. RLS — HABILITAR EN TODAS LAS TABLAS MAAT
-- =====================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE beliefs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_tracker     ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_hipnosis ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log  ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. POLITICAS RLS — MAAT
-- Patron: DROP IF EXISTS + CREATE (idempotente)
-- Regla 3: NUNCA consultar la misma tabla, usar get_my_role()
-- =====================================================

-- ─── PROFILES ───
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR get_my_role() IN ('mentor', 'admin')
  );

-- Authenticated users can always read profiles (needed for mentor dashboard)
DROP POLICY IF EXISTS profiles_select_authenticated ON profiles;
CREATE POLICY profiles_select_authenticated ON profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Mentors/admins can insert profiles (for createClient flow)
DROP POLICY IF EXISTS profiles_insert_admin ON profiles;
CREATE POLICY profiles_insert_admin ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('mentor', 'admin'));

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    auth.uid() = id
    OR get_my_role() = 'admin'
  );

-- ─── CALIBRATIONS ───
DROP POLICY IF EXISTS calibrations_select ON calibrations;
CREATE POLICY calibrations_select ON calibrations
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS calibrations_insert ON calibrations;
CREATE POLICY calibrations_insert ON calibrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS calibrations_update ON calibrations;
CREATE POLICY calibrations_update ON calibrations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── BELIEFS ───
DROP POLICY IF EXISTS beliefs_select ON beliefs;
CREATE POLICY beliefs_select ON beliefs
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS beliefs_insert ON beliefs;
CREATE POLICY beliefs_insert ON beliefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS beliefs_delete ON beliefs;
CREATE POLICY beliefs_delete ON beliefs
  FOR DELETE USING (auth.uid() = user_id);

-- ─── WEEK_PROGRESS ───
DROP POLICY IF EXISTS week_progress_select ON week_progress;
CREATE POLICY week_progress_select ON week_progress
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS week_progress_insert ON week_progress;
CREATE POLICY week_progress_insert ON week_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS week_progress_update ON week_progress;
CREATE POLICY week_progress_update ON week_progress
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── HABIT_TRACKER ───
DROP POLICY IF EXISTS habit_tracker_select ON habit_tracker;
CREATE POLICY habit_tracker_select ON habit_tracker
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS habit_tracker_insert ON habit_tracker;
CREATE POLICY habit_tracker_insert ON habit_tracker
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS habit_tracker_update ON habit_tracker;
CREATE POLICY habit_tracker_update ON habit_tracker
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── STATEMENT_HIPNOSIS ───
DROP POLICY IF EXISTS statement_hipnosis_select ON statement_hipnosis;
CREATE POLICY statement_hipnosis_select ON statement_hipnosis
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS statement_hipnosis_insert ON statement_hipnosis;
CREATE POLICY statement_hipnosis_insert ON statement_hipnosis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS statement_hipnosis_update ON statement_hipnosis;
CREATE POLICY statement_hipnosis_update ON statement_hipnosis
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── PHASE_REFLECTIONS ───
DROP POLICY IF EXISTS phase_reflections_select ON phase_reflections;
CREATE POLICY phase_reflections_select ON phase_reflections
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS phase_reflections_insert ON phase_reflections;
CREATE POLICY phase_reflections_insert ON phase_reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS phase_reflections_update ON phase_reflections;
CREATE POLICY phase_reflections_update ON phase_reflections
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── AI_CONFIG ───
DROP POLICY IF EXISTS ai_config_select ON ai_config;
CREATE POLICY ai_config_select ON ai_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ai_config_update ON ai_config;
CREATE POLICY ai_config_update ON ai_config
  FOR UPDATE USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ─── MENTOR_CLIENTS ───
DROP POLICY IF EXISTS mentor_clients_select ON mentor_clients;
CREATE POLICY mentor_clients_select ON mentor_clients
  FOR SELECT USING (
    auth.uid() = mentor_id
    OR auth.uid() = client_id
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS mentor_clients_insert ON mentor_clients;
CREATE POLICY mentor_clients_insert ON mentor_clients
  FOR INSERT WITH CHECK (
    auth.uid() = mentor_id
    OR get_my_role() = 'admin'
  );

-- ─── SESSION_NOTES ───
DROP POLICY IF EXISTS session_notes_select ON session_notes;
CREATE POLICY session_notes_select ON session_notes
  FOR SELECT USING (
    auth.uid() = mentor_id
    OR auth.uid() = client_id
    OR get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS session_notes_insert ON session_notes;
CREATE POLICY session_notes_insert ON session_notes
  FOR INSERT WITH CHECK (auth.uid() = mentor_id);

DROP POLICY IF EXISTS session_notes_update ON session_notes;
CREATE POLICY session_notes_update ON session_notes
  FOR UPDATE USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

-- ─── PUSH_SUBSCRIPTIONS ───
DROP POLICY IF EXISTS push_subscriptions_all ON push_subscriptions;
CREATE POLICY push_subscriptions_all ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── CHAT_MESSAGES ───
DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
CREATE POLICY chat_messages_update ON chat_messages
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── NOTIFICATION_LOG ───
DROP POLICY IF EXISTS notification_log_select ON notification_log;
CREATE POLICY notification_log_select ON notification_log
  FOR SELECT USING (
    auth.uid() = user_id
    OR get_my_role() IN ('mentor', 'admin')
  );

DROP POLICY IF EXISTS notification_log_insert ON notification_log;
CREATE POLICY notification_log_insert ON notification_log
  FOR INSERT WITH CHECK (
    get_my_role() IN ('mentor', 'admin')
  );

-- =====================================================
-- 6. DATOS INICIALES
-- =====================================================
INSERT INTO ai_config (id, system_prompt)
VALUES (
  1,
  'Eres el Coach MAAT, un mentor de neurociencia aplicada, filosofia practica y metacognicion. Ayudas a profesionales de alto rendimiento a recuperar sentido, pasion y energia. Responde en espanol, con empatia y precision. Maximo 150 palabras.'
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. VERIFICACION
-- =====================================================
SELECT '--- VERIFICACION MAAT ---' AS info;

SELECT table_name, COUNT(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'calibrations', 'beliefs', 'week_progress',
    'habit_tracker', 'statement_hipnosis', 'phase_reflections',
    'ai_config', 'mentor_clients', 'session_notes',
    'push_subscriptions', 'notification_log'
  )
GROUP BY table_name
ORDER BY table_name;

SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'calibrations', 'beliefs', 'week_progress',
    'habit_tracker', 'statement_hipnosis', 'phase_reflections',
    'ai_config', 'mentor_clients', 'session_notes',
    'push_subscriptions', 'notification_log'
  )
GROUP BY tablename
ORDER BY tablename;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_my_role', 'handle_new_user', 'is_admin', 'is_mentor_or_admin', 'mentor_has_client')
ORDER BY routine_name;
