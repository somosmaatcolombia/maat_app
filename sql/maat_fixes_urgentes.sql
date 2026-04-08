-- =====================================================
-- MAAT — Fixes urgentes para BD en produccion
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-03-16
-- SEGURO re-ejecutar (idempotente)
-- =====================================================

-- =====================================================
-- FIX 1: handle_new_user — logica condicional por proyecto
-- Antes: defaulteaba a 'advisor' (CRM), ahora revisa metadata
-- Si el signup envia role en metadata, lo usa.
-- Si no envia role, defaultea a 'client' (MAAT es mas comun).
-- Para CRM: asegurar que signups envien data:{role:'advisor'}
-- =====================================================
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

-- =====================================================
-- FIX 2: Corregir usuarios existentes con role='advisor'
-- que deberian ser 'client' (creados por bug anterior)
-- Solo afecta usuarios que NO tienen prospects (no son del CRM)
-- =====================================================
UPDATE profiles
SET role = 'client'
WHERE role = 'advisor'
  AND id NOT IN (
    SELECT DISTINCT advisor_id FROM prospects
  )
  AND id NOT IN (
    SELECT DISTINCT advisor_id FROM activities
  );

-- =====================================================
-- FIX 3: calibrations — agregar politica UPDATE
-- Permite al usuario editar session_note desde historial
-- =====================================================
DROP POLICY IF EXISTS calibrations_update ON calibrations;
CREATE POLICY calibrations_update ON calibrations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- FIX 4: profiles — consolidar politicas redundantes
-- Eliminar las 3 politicas duplicadas de UPDATE y
-- dejar una sola clara que cubra: owner + admin
-- =====================================================

-- Eliminar las redundantes
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;

-- La politica profiles_update ya cubre owner + admin:
-- USING ((auth.uid() = id) OR (get_my_role() = 'admin'))
-- WITH CHECK ((auth.uid() = id) OR (get_my_role() = 'admin'))
-- No necesita cambio.

-- Eliminar la de INSERT admin redundante (profiles_insert ya
-- permite auth.uid() = id, y para crear clientes se usa service_role
-- via el client aislado o el upsert post-signup)
-- NOTA: profiles_insert_admin se mantiene porque el mentor crea
-- perfiles de clientes con IDs diferentes al suyo.

-- =====================================================
-- FIX 5: notification_log — agregar politica RLS
-- (tabla existe pero no tiene politicas)
-- =====================================================
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

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
-- VERIFICACION
-- =====================================================
SELECT 'handle_new_user default' AS check_item,
  CASE WHEN routine_definition LIKE '%''client''%'
       THEN 'OK — defaults to client'
       ELSE 'FAIL — check function'
  END AS status
FROM information_schema.routines
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';

SELECT 'calibrations_update policy' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END AS status
FROM pg_policies
WHERE tablename = 'calibrations' AND policyname = 'calibrations_update';

SELECT 'profiles redundant policies' AS check_item,
  CASE WHEN COUNT(*) = 0 THEN 'OK — cleaned up' ELSE 'STILL EXISTS' END AS status
FROM pg_policies
WHERE tablename = 'profiles' AND policyname IN ('profiles_update_admin', 'profiles_update_own');

SELECT 'advisor orphans fixed' AS check_item,
  COUNT(*) || ' users still with role=advisor' AS status
FROM profiles WHERE role = 'advisor';

SELECT 'notification_log RLS' AS check_item,
  CASE WHEN COUNT(*) >= 2 THEN 'OK' ELSE 'MISSING' END AS status
FROM pg_policies WHERE tablename = 'notification_log';
