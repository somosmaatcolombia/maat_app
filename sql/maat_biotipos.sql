-- =====================================================
-- MAAT - Biotipos (Fase 2)
-- Proyecto Supabase: pcclptmojjzqmfmzftot  (NO el CRM)
-- Idempotente: se puede correr varias veces sin romper nada.
-- =====================================================

-- 1) Columnas de biotipo en el perfil del cliente ------------------
--    El cuestionario (src/maat_biotipo.html) las escribe cuando el
--    usuario tiene sesion MAAT activa (mismo origen somosmaat.org).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS biotype_primary   text,   -- 's' | 'c' | 'm' | 'f'
  ADD COLUMN IF NOT EXISTS biotype_secondary text,   -- 's' | 'c' | 'm' | 'f'
  ADD COLUMN IF NOT EXISTS biotype_scores    jsonb,  -- { "s":25,"c":100,"m":75,"f":25 }
  ADD COLUMN IF NOT EXISTS biotype_taken_at  timestamptz;

-- NOTA RLS: guardar en perfil usa un UPDATE del propio usuario sobre su
-- fila (eq id = auth.uid()). Si tu politica de UPDATE en profiles ya es
-- "el usuario edita su propia fila", estas columnas quedan cubiertas
-- automaticamente (no hay restriccion por columna). Nada mas que hacer.


-- 2) Tabla de leads del quiz publico (visitantes sin cuenta) --------
--    Se llena con la captura de email OPCIONAL al final del test.
CREATE TABLE IF NOT EXISTS public.biotype_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  name              text,
  biotype_primary   text,
  biotype_secondary text,
  scores            jsonb,
  lang              text DEFAULT 'es',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.biotype_leads ENABLE ROW LEVEL SECURITY;

-- Insert publico (anon): un visitante puede dejar su correo, nada mas.
DROP POLICY IF EXISTS "biotype_leads insert publico" ON public.biotype_leads;
CREATE POLICY "biotype_leads insert publico"
  ON public.biotype_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Lectura SOLO para mentor/admin (los leads son datos sensibles).
DROP POLICY IF EXISTS "biotype_leads lee staff" ON public.biotype_leads;
CREATE POLICY "biotype_leads lee staff"
  ON public.biotype_leads FOR SELECT
  TO authenticated
  USING (public.is_mentor_or_admin(auth.uid()));

-- Indice para ordenar los leads mas recientes.
CREATE INDEX IF NOT EXISTS biotype_leads_created_idx
  ON public.biotype_leads (created_at DESC);
