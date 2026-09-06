-- =====================================================
-- MAAT - Viaje a los 7 Chakras: sesiones del cliente
-- Proyecto Supabase: pcclptmojjzqmfmzftot  (NO el CRM)
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- Requiere antes: sql/maat_chakra_leads.sql
--
-- Que resuelve: la pieza de chakras vive en el mismo origen que la app,
-- asi que comparte la sesion de Supabase (mismo patron que /biotipo/).
-- Si quien entra es un cliente logueado, cada meditacion o resonancia
-- completada deposita luz PERMANENTE en ese centro. La columna deja de
-- ser una animacion y se vuelve el grafico de habitos.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chakra_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = visitante sin cuenta
  lead_email  text,                       -- para cruzar con chakra_leads cuando no hay cuenta
  chakra      smallint NOT NULL CHECK (chakra BETWEEN 1 AND 7),
  kind        text NOT NULL CHECK (kind IN ('meditacion','voz','escaneo')),
  seconds     integer,                    -- duracion real de la meditacion
  hz          integer,                    -- frecuencia lograda en la resonancia
  seal_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chakra_sessions ENABLE ROW LEVEL SECURITY;

-- El cliente escribe SOLO sus propias sesiones.
DROP POLICY IF EXISTS "chakra_sessions insert propio" ON public.chakra_sessions;
CREATE POLICY "chakra_sessions insert propio"
  ON public.chakra_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Visitante sin cuenta: puede registrar la sesion, pero sin dueno.
DROP POLICY IF EXISTS "chakra_sessions insert anonimo" ON public.chakra_sessions;
CREATE POLICY "chakra_sessions insert anonimo"
  ON public.chakra_sessions FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- El cliente lee lo suyo; mentor y admin leen todo (Regla 3: sin recursion).
DROP POLICY IF EXISTS "chakra_sessions select propio" ON public.chakra_sessions;
CREATE POLICY "chakra_sessions select propio"
  ON public.chakra_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_mentor_or_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS chakra_sessions_user_idx    ON public.chakra_sessions (user_id, chakra);
CREATE INDEX IF NOT EXISTS chakra_sessions_created_idx ON public.chakra_sessions (created_at DESC);

-- Luz acumulada por centro, ya agregada: 7 filas y nada mas.
-- SECURITY INVOKER a proposito: respeta el RLS de arriba, no lo esquiva.
CREATE OR REPLACE FUNCTION public.my_chakra_light()
RETURNS TABLE (chakra smallint, sesiones bigint, ultima timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT s.chakra, count(*)::bigint, max(s.created_at)
  FROM public.chakra_sessions s
  WHERE s.user_id = auth.uid()
    AND s.kind IN ('meditacion','voz')     -- el escaneo no deposita luz: diagnostica
  GROUP BY s.chakra
  ORDER BY s.chakra;
$$;

GRANT EXECUTE ON FUNCTION public.my_chakra_light() TO authenticated;
